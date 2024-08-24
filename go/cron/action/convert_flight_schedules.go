package action

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"golang.org/x/sync/errgroup"
	"strings"
)

const (
	queryDateId       int = -1
	codeShareChildId  int = 10
	codeShareParentId int = 50
)

type ConvertFlightSchedulesParams struct {
	InputBucket  string                 `json:"inputBucket"`
	InputPrefix  string                 `json:"inputPrefix"`
	OutputBucket string                 `json:"outputBucket"`
	OutputPrefix string                 `json:"outputPrefix"`
	DateRanges   common.LocalDateRanges `json:"dateRanges"`
}

type ConvertFlightSchedulesOutput struct {
}

type cfsAction struct {
	s3c MinimalS3Client
}

func NewConvertFlightSchedulesAction(s3c MinimalS3Client) Action[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput] {
	return &cfsAction{s3c}
}

func (a *cfsAction) Handle(ctx context.Context, params ConvertFlightSchedulesParams) (ConvertFlightSchedulesOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	flightsByDepartureDateUTC, err := a.convertAll(ctx, params.InputBucket, params.InputPrefix, params.DateRanges)
	if err != nil {
		return ConvertFlightSchedulesOutput{}, err
	}

	return ConvertFlightSchedulesOutput{}, a.upsertAll(ctx, params.OutputBucket, params.OutputPrefix, params.DateRanges, flightsByDepartureDateUTC)
}

func (a *cfsAction) convertAll(ctx context.Context, inputBucket, inputPrefix string, dateRanges common.LocalDateRanges) (map[common.LocalDate][]*common.Flight, error) {
	ch := make(chan *common.Flight, 1024)
	g, gCtx := errgroup.WithContext(ctx)

	for _, r := range dateRanges {
		g.Go(func() error {
			return a.convertRange(gCtx, inputBucket, inputPrefix, r[0], r[1], ch)
		})
	}

	done := make(chan map[common.LocalDate][]*common.Flight)
	go func() {
		defer close(done)

		result := make(map[common.LocalDate][]*common.Flight)
		for f := range ch {
			result[f.DepartureDate()] = append(result[f.DepartureDate()], f)
		}

		done <- result
	}()

	if err := func() error { defer close(ch); return g.Wait() }(); err != nil {
		return nil, err
	}

	return <-done, nil
}

func (a *cfsAction) convertRange(ctx context.Context, inputBucket, inputPrefix string, start, end common.LocalDate, ch chan<- *common.Flight) error {
	g, ctx := errgroup.WithContext(ctx)
	for curr := range start.Until(end) {
		g.Go(func() error {
			return a.convertSingle(ctx, inputBucket, inputPrefix, curr, ch)
		})
	}

	return g.Wait()
}

func (a *cfsAction) convertSingle(ctx context.Context, inputBucket, inputPrefix string, d common.LocalDate, ch chan<- *common.Flight) error {
	schedules, err := a.loadFlightSchedules(ctx, inputBucket, inputPrefix, d)
	if err != nil {
		return err
	}

	return convertFlightSchedulesToFlights(ctx, d, schedules, ch)
}

func (a *cfsAction) loadFlightSchedules(ctx context.Context, bucket, prefix string, d common.LocalDate) ([]lufthansa.FlightSchedule, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
	})

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	var schedules []lufthansa.FlightSchedule
	return schedules, json.NewDecoder(resp.Body).Decode(&schedules)
}

func (a *cfsAction) upsertAll(ctx context.Context, bucket, prefix string, queryDateRanges common.LocalDateRanges, flightsByDepartureDateUTC map[common.LocalDate][]*common.Flight) error {
	g, ctx := errgroup.WithContext(ctx)
	for d, flights := range flightsByDepartureDateUTC {
		g.Go(func() error {
			return a.upsertFlights(
				ctx,
				bucket,
				prefix,
				d,
				queryDateRanges,
				flights,
			)
		})
	}

	return g.Wait()
}

func (a *cfsAction) upsertFlights(ctx context.Context, bucket, prefix string, d common.LocalDate, queryDateRanges common.LocalDateRanges, flights []*common.Flight) error {
	s3Key := prefix + d.Time(nil).Format("2006/01/02") + ".json"
	existing, err := a.loadFlights(ctx, bucket, s3Key)
	if err != nil {
		return err
	}

	added := make(map[common.FlightId]*common.Flight)
	result := make([]*common.Flight, 0, max(len(flights), len(existing)))

	for _, f := range flights {
		if addedFlight, ok := added[f.Id()]; ok {
			if err := combineFlights(addedFlight, f, queryDateRanges); err != nil {
				return err
			}
		} else {
			result = append(result, f)
			added[f.Id()] = f
		}
	}

	for _, f := range existing {
		if addedFlight, ok := added[f.Id()]; ok {
			if err := combineFlights(addedFlight, f, queryDateRanges); err != nil {
				return err
			}
		} else {
			flightQueryDate, err := common.ParseLocalDate(f.DataElements[queryDateId])
			if err != nil {
				return err
			}

			if !queryDateRanges.Contains(flightQueryDate) {
				result = append(result, f)
				added[f.Id()] = f
			}
		}
	}

	b, err := json.Marshal(result)
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

func (a *cfsAction) loadFlights(ctx context.Context, bucket, s3Key string) ([]*common.Flight, error) {
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

	var flights []*common.Flight
	return flights, json.NewDecoder(resp.Body).Decode(&flights)
}

func convertFlightSchedulesToFlights(ctx context.Context, queryDate common.LocalDate, schedules []lufthansa.FlightSchedule, ch chan<- *common.Flight) error {
	lookup := make(map[common.FlightId]*common.Flight)
	codeShareIds := make(map[common.FlightId]struct{})
	addLater := make(map[common.FlightId][]*common.Flight)

	for _, fs := range schedules {
		for _, leg := range fs.Legs {
			f := &common.Flight{
				Airline:                      common.AirlineIdentifier(fs.Airline),
				FlightNumber:                 fs.FlightNumber,
				Suffix:                       fs.Suffix,
				DepartureTime:                leg.DepartureTime(fs.PeriodOfOperationUTC.StartDate),
				DepartureAirport:             leg.Origin,
				ArrivalTime:                  leg.ArrivalTime(fs.PeriodOfOperationUTC.StartDate),
				ArrivalAirport:               leg.Destination,
				ServiceType:                  leg.ServiceType,
				AircraftOwner:                common.AirlineIdentifier(leg.AircraftOwner),
				AircraftType:                 leg.AircraftType,
				AircraftConfigurationVersion: leg.AircraftConfigurationVersion,
				Registration:                 leg.Registration,
				DataElements:                 fs.DataElementsForSequence(leg.SequenceNumber),
				CodeShares:                   make(map[common.FlightNumber]map[int]string),
			}

			f.DataElements[queryDateId] = queryDate.String()

			lookup[f.Id()] = f

			if codeSharesRaw := f.DataElements[codeShareChildId]; codeSharesRaw != "" {
				// this flight has codeshares
				for _, codeShare := range strings.Split(codeSharesRaw, "/") {
					codeShareFn, err := common.ParseFlightNumber(codeShare)
					if err != nil {
						return err
					}

					if _, ok := f.CodeShares[codeShareFn]; !ok {
						f.CodeShares[codeShareFn] = map[int]string{
							queryDateId: queryDate.String(),
						}
					}

					// mark as codeshare
					codeShareIds[codeShareFn.Id(f.Departure())] = struct{}{}
				}
			}

			if codeShare := f.DataElements[codeShareParentId]; codeShare != "" {
				// this flight is a codeshare
				parentFn, err := common.ParseFlightNumber(codeShare)
				if err != nil {
					return err
				}

				parentFid := parentFn.Id(f.Departure())

				if parent, ok := lookup[parentFid]; ok {
					parent.CodeShares[f.Number()] = f.DataElements
				} else {
					addLater[parentFid] = append(addLater[parentFid], f)
				}

				// mark self as codeshare
				codeShareIds[f.Id()] = struct{}{}
			}
		}
	}

	// add codeshares to parent
	for fid, codeShares := range addLater {
		if len(codeShares) < 1 {
			continue
		}

		f, ok := lookup[fid]
		if !ok {
			// create a parent if the parent itself isn't present
			first := codeShares[0]
			f = &common.Flight{
				Airline:                      fid.Number.Airline,
				FlightNumber:                 fid.Number.Number,
				Suffix:                       fid.Number.Suffix,
				DepartureTime:                first.DepartureTime,
				DepartureAirport:             first.DepartureAirport,
				ArrivalTime:                  first.ArrivalTime,
				ArrivalAirport:               first.ArrivalAirport,
				ServiceType:                  first.ServiceType,
				AircraftOwner:                first.AircraftOwner,
				AircraftType:                 first.AircraftType,
				AircraftConfigurationVersion: first.AircraftConfigurationVersion,
				Registration:                 first.Registration,
				DataElements: map[int]string{
					queryDateId: queryDate.String(),
				},
				CodeShares: make(map[common.FlightNumber]map[int]string),
			}

			lookup[fid] = f
		}

		for _, child := range codeShares {
			f.CodeShares[child.Number()] = child.DataElements
		}
	}

	for fid, f := range lookup {
		if _, ok := codeShareIds[fid]; !ok {
			select {
			case ch <- f:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}

	return nil
}

func combineFlights(f, other *common.Flight, queryDateRanges common.LocalDateRanges) error {
	otherQueryDate, err := common.ParseLocalDate(other.DataElements[queryDateId])
	if err != nil {
		return err
	}

	if !queryDateRanges.Contains(otherQueryDate) {
		for k, v := range other.DataElements {
			if _, ok := f.DataElements[k]; !ok {
				f.DataElements[k] = v
			}
		}
	}

	for codeShareFn, otherDataElements := range other.CodeShares {
		codeShareQueryDate, err := common.ParseLocalDate(otherDataElements[queryDateId])
		if err != nil {
			return err
		}

		if !queryDateRanges.Contains(codeShareQueryDate) {
			if dataElements, ok := f.CodeShares[codeShareFn]; ok {
				for k, v := range otherDataElements {
					if _, ok := dataElements[k]; !ok {
						dataElements[k] = v
					}
				}
			} else {
				f.CodeShares[codeShareFn] = otherDataElements
			}
		}
	}

	return nil
}
