package action

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"golang.org/x/sync/errgroup"
	"time"
)

type ConvertFlightsParams struct {
	InputBucket  string                `json:"inputBucket"`
	InputPrefix  string                `json:"inputPrefix"`
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   xtime.LocalDateRanges `json:"dateRanges"`
}

type ConvertFlightsOutput struct {
}

type cfAction struct {
	s3c MinimalS3Client
}

func NewConvertFlightsAction(s3c MinimalS3Client) Action[ConvertFlightsParams, ConvertFlightsOutput] {
	return &cfAction{s3c}
}

func (a *cfAction) Handle(ctx context.Context, params ConvertFlightsParams) (ConvertFlightsOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	scheduleByAirlineAndFlightNumber, err := a.convertAll(ctx, params.InputBucket, params.InputPrefix, params.DateRanges)
	if err != nil {
		return ConvertFlightsOutput{}, err
	}

	return ConvertFlightsOutput{}, a.upsertAll(ctx, params.OutputBucket, params.OutputPrefix, params.DateRanges, scheduleByAirlineAndFlightNumber)
}

func (a *cfAction) convertAll(ctx context.Context, bucket, prefix string, dateRanges xtime.LocalDateRanges) (map[common.AirlineIdentifier]map[common.FlightNumber]*common.FlightSchedule, error) {
	ch := make(chan *common.Flight, 1024)
	done := make(chan map[common.AirlineIdentifier]map[common.FlightNumber]*common.FlightSchedule)
	go func() {
		defer close(done)

		result := make(map[common.AirlineIdentifier]map[common.FlightNumber]*common.FlightSchedule)
		for f := range ch {
			d := f.DepartureDateLocal()
			fsd := convertFlightToData(f)

			metadataByFn := make(map[common.FlightNumber]common.FlightScheduleVariantMetadata)
			metadataByFn[f.Number()] = common.FlightScheduleVariantMetadata{
				CreationTime:     f.Metadata.CreationTime,
				RangesUpdateTime: f.Metadata.CreationTime,
				DataUpdateTime:   f.Metadata.UpdateTime,
			}

			for codeShareFn, codeShare := range f.CodeShares {
				metadataByFn[codeShareFn] = common.FlightScheduleVariantMetadata{
					CreationTime:     codeShare.Metadata.CreationTime,
					RangesUpdateTime: codeShare.Metadata.CreationTime,
					DataUpdateTime:   codeShare.Metadata.UpdateTime,
				}
			}

			for fn, md := range metadataByFn {
				byFlightNumber, ok := result[fn.Airline]
				if !ok {
					byFlightNumber = make(map[common.FlightNumber]*common.FlightSchedule)
					result[fn.Airline] = byFlightNumber
				}

				if fs, ok := byFlightNumber[fn]; ok {
					if variant, ok := fs.Variant(fsd); ok {
						variant.Ranges = variant.Ranges.Add(d)
						variant.Metadata.CreationTime = xtime.Min(variant.Metadata.CreationTime, md.CreationTime)
						variant.Metadata.RangesUpdateTime = xtime.Max(variant.Metadata.RangesUpdateTime, md.RangesUpdateTime)
						variant.Metadata.DataUpdateTime = xtime.Min(variant.Metadata.DataUpdateTime, md.DataUpdateTime)
					} else {
						fs.Variants = append(fs.Variants, &common.FlightScheduleVariant{
							Ranges:   xtime.NewLocalDateRanges(xiter.Single(d)),
							Data:     fsd,
							Metadata: md,
						})
					}
				} else {
					byFlightNumber[fn] = &common.FlightSchedule{
						Airline:      fn.Airline,
						FlightNumber: fn.Number,
						Suffix:       fn.Suffix,
						Variants: []*common.FlightScheduleVariant{
							{
								Ranges:   xtime.NewLocalDateRanges(xiter.Single(d)),
								Data:     fsd,
								Metadata: md,
							},
						},
					}
				}
			}
		}

		done <- result
	}()

	err := func() error {
		defer close(ch)
		return a.loadRanges(ctx, bucket, prefix, dateRanges, ch)
	}()

	if err != nil {
		return nil, err
	}

	return <-done, nil
}

func (a *cfAction) loadRanges(ctx context.Context, bucket, prefix string, ldrs xtime.LocalDateRanges, ch chan<- *common.Flight) error {
	for d := range ldrs.Iter() {
		if err := a.loadSingle(ctx, bucket, prefix, d, ch); err != nil {
			return err
		}
	}

	return nil
}

func (a *cfAction) loadSingle(ctx context.Context, bucket, prefix string, d xtime.LocalDate, ch chan<- *common.Flight) error {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
	})

	if err != nil {
		return err
	}

	defer resp.Body.Close()

	var flights []*common.Flight
	if err = json.NewDecoder(resp.Body).Decode(&flights); err != nil {
		return err
	}

	for _, f := range flights {
		select {
		case ch <- f:
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return nil
}

func (a *cfAction) upsertAll(ctx context.Context, bucket, prefix string, utcDateRanges xtime.LocalDateRanges, scheduleByAirlineAndFlightNumber map[common.AirlineIdentifier]map[common.FlightNumber]*common.FlightSchedule) error {
	ch := make(chan Pair[common.AirlineIdentifier, map[common.FlightNumber]*common.FlightSchedule])
	go func() {
		defer close(ch)

		for airline, scheduleByFlightNumber := range scheduleByAirlineAndFlightNumber {
			ch <- Pair[common.AirlineIdentifier, map[common.FlightNumber]*common.FlightSchedule]{airline, scheduleByFlightNumber}
		}
	}()

	g, ctx := errgroup.WithContext(ctx)
	for range 10 {
		g.Go(func() error {
			for {
				select {
				case pair, ok := <-ch:
					if !ok {
						return nil
					}

					if err := a.upsertFlightSchedules(ctx, bucket, prefix, utcDateRanges, pair._1, pair._2); err != nil {
						return err
					}

				case <-ctx.Done():
					return ctx.Err()
				}
			}
		})
	}

	return g.Wait()
}

func (a *cfAction) upsertFlightSchedules(ctx context.Context, bucket, prefix string, utcDateRanges xtime.LocalDateRanges, airline common.AirlineIdentifier, scheduleByFlightNumber map[common.FlightNumber]*common.FlightSchedule) error {
	existing, err := a.loadFlightSchedules(ctx, bucket, prefix, airline)
	if err != nil {
		return err
	}

	if existing != nil {
		for fn, existingFs := range existing {
			if fs, ok := scheduleByFlightNumber[fn]; ok {
				scheduleByFlightNumber[fn] = combineSchedules(fs, existingFs, utcDateRanges)
			} else {
				// remove all variants which should come in fresh because they were updated in this execution
				// if they do not come in again, the flight was removed
				existingFs.DeleteAll(func(fsv *common.FlightScheduleVariant, d xtime.LocalDate) bool {
					return utcDateRanges.Contains(fsv.DepartureDateUTC(d))
				})

				if len(existingFs.Variants) > 0 {
					scheduleByFlightNumber[fn] = existingFs
				}
			}
		}
	}

	var buf bytes.Buffer
	w, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		return err
	}

	if err = json.NewEncoder(w).Encode(scheduleByFlightNumber); err != nil {
		return err
	}

	if err = w.Close(); err != nil {
		return err
	}

	_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:          aws.String(bucket),
		Key:             aws.String(prefix + string(airline) + ".json.gz"),
		ContentType:     aws.String("application/json"),
		ContentEncoding: aws.String("gzip"),
		Body:            bytes.NewReader(buf.Bytes()),
	})

	return err
}

func (a *cfAction) loadFlightSchedules(ctx context.Context, bucket, prefix string, airline common.AirlineIdentifier) (map[common.FlightNumber]*common.FlightSchedule, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix + string(airline) + ".json.gz"),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, nil
		} else {
			return nil, err
		}
	}

	defer resp.Body.Close()

	r, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, err
	}

	var result map[common.FlightNumber]*common.FlightSchedule
	if err = json.NewDecoder(r).Decode(&result); err != nil {
		return nil, err
	}

	return result, r.Close()
}

func combineSchedules(fs *common.FlightSchedule, existing *common.FlightSchedule, ignoreUtcDataRanges xtime.LocalDateRanges) *common.FlightSchedule {
	for _, existingVariant := range existing.Variants {
		existingVariant.Ranges = existingVariant.Ranges.RemoveAll(func(d xtime.LocalDate) bool {
			return ignoreUtcDataRanges.Contains(existingVariant.DepartureDateUTC(d))
		})

		if variant, ok := fs.Variant(existingVariant.Data); ok {
			if len(existingVariant.Ranges) > 0 {
				variant.Ranges = variant.Ranges.ExpandAll(existingVariant.Ranges)
				variant.Metadata.RangesUpdateTime = xtime.Max(variant.Metadata.RangesUpdateTime, existingVariant.Metadata.RangesUpdateTime)
			}

			variant.Metadata.CreationTime = xtime.Min(variant.Metadata.CreationTime, existingVariant.Metadata.CreationTime)
			variant.Metadata.DataUpdateTime = xtime.Min(variant.Metadata.DataUpdateTime, existingVariant.Metadata.DataUpdateTime)
		} else if len(variant.Ranges) > 0 {
			fs.Variants = append(fs.Variants, existingVariant)
		}
	}

	return fs
}

func convertFlightToData(f *common.Flight) common.FlightScheduleData {
	codeShares := make(common.Set[common.FlightNumber])
	for fn := range f.CodeShares {
		codeShares[fn] = struct{}{}
	}

	_, departureUTCOffset := f.DepartureTime.Zone()
	_, arrivalUTCOffset := f.ArrivalTime.Zone()

	return common.FlightScheduleData{
		OperatedAs:                   f.Number(),
		DepartureTime:                xtime.NewLocalTime(f.DepartureTime),
		DepartureAirport:             f.DepartureAirport,
		DepartureUTCOffset:           departureUTCOffset,
		DurationSeconds:              int64(f.Duration() / time.Second),
		ArrivalAirport:               f.ArrivalAirport,
		ArrivalUTCOffset:             arrivalUTCOffset,
		ServiceType:                  f.ServiceType,
		AircraftOwner:                f.AircraftOwner,
		AircraftType:                 f.AircraftType,
		AircraftConfigurationVersion: f.AircraftConfigurationVersion,
		CodeShares:                   codeShares,
	}
}
