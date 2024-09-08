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

	scheduleByFlightNumber, err := a.convertAll(ctx, params.InputBucket, params.InputPrefix, params.DateRanges)
	if err != nil {
		return ConvertFlightsOutput{}, err
	}

	return ConvertFlightsOutput{}, a.upsertAll(ctx, params.OutputBucket, params.OutputPrefix, params.DateRanges, scheduleByFlightNumber)
}

func (a *cfAction) convertAll(ctx context.Context, bucket, prefix string, dateRanges xtime.LocalDateRanges) (map[common.FlightNumber]*common.FlightSchedule, error) {
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
			d := xtime.NewLocalDate(f.DepartureTime)
			fn := f.Number()
			fsd := convertFlightToData(f)

			if fs, ok := result[fn]; ok {
				if variant, ok := fs.Variant(fsd); ok {
					variant.Ranges = variant.Ranges.Add(d)
				} else {
					fs.Variants = append(fs.Variants, &common.FlightScheduleVariant{
						Ranges: xtime.LocalDateRanges{{d, d}},
						Data:   fsd,
					})
				}
			} else {
				result[fn] = &common.FlightSchedule{
					Airline:      f.Airline,
					FlightNumber: f.FlightNumber,
					Suffix:       f.Suffix,
					Variants: []*common.FlightScheduleVariant{
						{
							Ranges: xtime.LocalDateRanges{{d, d}},
							Data:   fsd,
						},
					},
				}
			}

			for codeShareFn := range f.CodeShares {
				if fs, ok := result[codeShareFn]; ok {
					if variant, ok := fs.Variant(fsd); ok {
						variant.Ranges = variant.Ranges.Add(d)
					} else {
						fs.Variants = append(fs.Variants, &common.FlightScheduleVariant{
							Ranges: xtime.LocalDateRanges{{d, d}},
							Data:   fsd,
						})
					}
				} else {
					result[codeShareFn] = &common.FlightSchedule{
						Airline:      codeShareFn.Airline,
						FlightNumber: codeShareFn.Number,
						Suffix:       codeShareFn.Suffix,
						Variants: []*common.FlightScheduleVariant{
							{
								Ranges: xtime.LocalDateRanges{{d, d}},
								Data:   fsd,
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

func (a *cfAction) loadRange(ctx context.Context, bucket, prefix string, ldr xtime.LocalDateRange, ch chan<- *common.Flight) error {
	g, ctx := errgroup.WithContext(ctx)
	for curr := range ldr.Iter() {
		g.Go(func() error {
			return a.loadSingle(ctx, bucket, prefix, curr, ch)
		})
	}

	return g.Wait()
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

func (a *cfAction) upsertAll(ctx context.Context, bucket, prefix string, utcDateRanges xtime.LocalDateRanges, scheduleByFlightNumber map[common.FlightNumber]*common.FlightSchedule) error {
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

func (a *cfAction) upsertFlightSchedules(ctx context.Context, bucket, prefix string, utcDateRanges xtime.LocalDateRanges, fn common.FlightNumber, fs *common.FlightSchedule) error {
	s3Key := prefix + fmt.Sprintf("%s/%d%s.json", fn.Airline, fn.Number, fn.Suffix)
	existing, err := a.loadFlightSchedule(ctx, bucket, s3Key)
	if err != nil {
		return err
	}

	if existing != nil {
		for d := range utcDateRanges.Iter() {
			// remove all variants which should come in fresh because they were updated in this execution
			// if they do not come in again, the flight was removed
			start := d.Time(nil)
			end := d.Next().Time(nil).Add(-1) // end of the same day

			existing.Delete(start, end)
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
		if existingVariant, ok := existing.Variant(variant.Data); ok {
			existingVariant.Ranges = existingVariant.Ranges.ExpandAll(variant.Ranges)
		} else {
			existing.Variants = append(existing.Variants, variant)
		}
	}

	return existing
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
