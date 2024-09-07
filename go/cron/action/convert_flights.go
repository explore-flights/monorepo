package action

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"golang.org/x/sync/errgroup"
	"time"
)

type ConvertFlightsParams struct {
	InputBucket  string                 `json:"inputBucket"`
	InputPrefix  string                 `json:"inputPrefix"`
	OutputBucket string                 `json:"outputBucket"`
	OutputPrefix string                 `json:"outputPrefix"`
	DateRanges   common.LocalDateRanges `json:"dateRanges"`
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

	scheduleByFlightNumber, err := a.convertAll(ctx, params.InputBucket, params.InputPrefix, params.DateRanges)
	if err != nil {
		return ConvertFlightsOutput{}, err
	}

	return ConvertFlightsOutput{}, a.upsertAll(ctx, params.OutputBucket, params.OutputPrefix, params.DateRanges, scheduleByFlightNumber)
}

func (a *cfAction) convertAll(ctx context.Context, bucket, prefix string, dateRanges common.LocalDateRanges) (map[common.FlightNumber]*common.FlightSchedule, error) {
	ch := make(chan *common.Flight, 1024)
	g, gCtx := errgroup.WithContext(ctx)

	for _, r := range dateRanges {
		g.Go(func() error {
			return a.loadRange(gCtx, bucket, prefix, r, ch)
		})
	}

	done := make(chan map[common.FlightNumber]*common.FlightSchedule)
	go func() {
		defer close(done)

		result := make(map[common.FlightNumber]*common.FlightSchedule)
		for f := range ch {
			d := common.NewLocalDate(f.DepartureTime)
			fn := f.Number()
			fsd := convertFlightToData(f)
			fsa := convertFlightToAlias(f)

			if fs, ok := result[fn]; ok {
				if variant, ok := fs.DataVariant(fsd); ok {
					variant.Ranges = variant.Ranges.Add(d)
				} else {
					fs.Variants = append(fs.Variants, &common.FlightScheduleVariant{
						Ranges: common.LocalDateRanges{{d, d}},
						Data:   &fsd,
					})
				}
			} else {
				result[fn] = &common.FlightSchedule{
					Airline:      f.Airline,
					FlightNumber: f.FlightNumber,
					Suffix:       f.Suffix,
					Variants: []*common.FlightScheduleVariant{
						{
							Ranges: common.LocalDateRanges{{d, d}},
							Data:   &fsd,
						},
					},
				}
			}

			for codeShareFn := range f.CodeShares {
				if fs, ok := result[codeShareFn]; ok {
					if variant, ok := fs.AliasVariant(fsa); ok {
						variant.Ranges = variant.Ranges.Add(d)
					} else {
						fs.Variants = append(fs.Variants, &common.FlightScheduleVariant{
							Ranges: common.LocalDateRanges{{d, d}},
							Alias:  &fsa,
						})
					}
				} else {
					result[codeShareFn] = &common.FlightSchedule{
						Airline:      codeShareFn.Airline,
						FlightNumber: codeShareFn.Number,
						Suffix:       codeShareFn.Suffix,
						Variants: []*common.FlightScheduleVariant{
							{
								Ranges: common.LocalDateRanges{{d, d}},
								Alias:  &fsa,
							},
						},
					}
				}
			}
		}

		done <- result
	}()

	if err := func() error { defer close(ch); return g.Wait() }(); err != nil {
		return nil, err
	}

	return <-done, nil
}

func (a *cfAction) loadRange(ctx context.Context, bucket, prefix string, ldr common.LocalDateRange, ch chan<- *common.Flight) error {
	g, ctx := errgroup.WithContext(ctx)
	for curr := range ldr.Iter() {
		g.Go(func() error {
			return a.loadSingle(ctx, bucket, prefix, curr, ch)
		})
	}

	return g.Wait()
}

func (a *cfAction) loadSingle(ctx context.Context, bucket, prefix string, d common.LocalDate, ch chan<- *common.Flight) error {
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

func (a *cfAction) upsertAll(ctx context.Context, bucket, prefix string, utcDateRanges common.LocalDateRanges, scheduleByFlightNumber map[common.FlightNumber]*common.FlightSchedule) error {
	ch := make(chan Pair[common.FlightNumber, *common.FlightSchedule])
	go func() {
		defer close(ch)

		for fn, fs := range scheduleByFlightNumber {
			ch <- Pair[common.FlightNumber, *common.FlightSchedule]{fn, fs}
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

func (a *cfAction) upsertFlightSchedules(ctx context.Context, bucket, prefix string, utcDateRanges common.LocalDateRanges, fn common.FlightNumber, fs *common.FlightSchedule) error {
	s3Key := prefix + fmt.Sprintf("%s/%d%s.json", fn.Airline, fn.Number, fn.Suffix)
	existing, err := a.loadFlightSchedule(ctx, bucket, s3Key)
	if err != nil {
		return err
	}

	if existing != nil {
		for d := range utcDateRanges.Iter() {
			// remove all variants which should come in fresh because they were updated in this execution
			// if they do not come in again, the flight was removed
			start := d.Time(time.UTC)
			end := d.Next().Time(time.UTC).Add(-time.Duration(1))

			existing.RemoveVariants(start, end)
		}

		fs = combineSchedules(fs, existing)
	}

	b, err := json.Marshal(fs)
	if err != nil {
		return err
	}

	_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(s3Key),
		ContentType: aws.String("application/json"),
		Body:        bytes.NewReader(b),
	})

	return err
}

func (a *cfAction) loadFlightSchedule(ctx context.Context, bucket, s3Key string) (*common.FlightSchedule, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(s3Key),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, nil
		} else {
			return nil, err
		}
	}

	defer resp.Body.Close()

	var fs *common.FlightSchedule
	return fs, json.NewDecoder(resp.Body).Decode(&fs)
}

func combineSchedules(fs *common.FlightSchedule, existing *common.FlightSchedule) *common.FlightSchedule {
	for _, variant := range fs.Variants {
		var existingVariant *common.FlightScheduleVariant
		var ok bool

		if variant.Data != nil {
			existingVariant, ok = existing.DataVariant(*variant.Data)
		} else if variant.Alias != nil {
			existingVariant, ok = existing.AliasVariant(*variant.Alias)
		}

		if ok {
			existingVariant.Ranges = existingVariant.Ranges.ExpandAll(variant.Ranges)
		} else {
			existing.Variants = append(existing.Variants, variant)
		}
	}

	return existing
}

func convertFlightToData(f *common.Flight) common.FlightScheduleData {
	codeShares := make([]common.FlightNumber, 0, len(f.CodeShares))
	for fn := range f.CodeShares {
		codeShares = append(codeShares, fn)
	}

	return common.FlightScheduleData{
		DepartureTime:                common.NewOffsetTime(f.DepartureTime),
		DepartureAirport:             f.DepartureAirport,
		ArrivalTime:                  common.NewOffsetTime(f.ArrivalTime),
		ArrivalAirport:               f.ArrivalAirport,
		ServiceType:                  f.ServiceType,
		AircraftOwner:                f.AircraftOwner,
		AircraftType:                 f.AircraftType,
		AircraftConfigurationVersion: f.AircraftConfigurationVersion,
		CodeShares:                   codeShares,
	}
}

func convertFlightToAlias(f *common.Flight) common.FlightScheduleAlias {
	return common.FlightScheduleAlias{
		FlightNumber:     f.Number(),
		DepartureTime:    common.NewOffsetTime(f.DepartureTime),
		DepartureAirport: f.DepartureAirport,
	}
}
