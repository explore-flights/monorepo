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
	s3c *s3.Client
}

func NewConvertFlightSchedulesAction(s3c *s3.Client) Action[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput] {
	return &cfsAction{s3c}
}

func (a *cfsAction) Handle(ctx context.Context, params ConvertFlightSchedulesParams) (ConvertFlightSchedulesOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var grouped map[common.LocalDate][]*common.Flight
	{
		g, ctx := errgroup.WithContext(ctx)
		results := make([][]*common.Flight, len(params.DateRanges))

		for i, r := range params.DateRanges {
			g.Go(func() error {
				flights, err := a.convertRange(ctx, params.InputBucket, params.InputPrefix, r[0], r[1])
				if err != nil {
					return err
				}

				results[i] = flights
				return nil
			})
		}

		if err := g.Wait(); err != nil {
			return ConvertFlightSchedulesOutput{}, err
		}

		grouped = groupByDepartureDateUTC(results)
	}

	g, ctx := errgroup.WithContext(ctx)
	for d, flights := range grouped {
		g.Go(func() error {
			return a.upsertFlights(
				ctx,
				params.OutputBucket,
				params.OutputPrefix,
				d,
				params.DateRanges,
				flights,
			)
		})
	}

	return ConvertFlightSchedulesOutput{}, g.Wait()
}

func (a *cfsAction) convertRange(ctx context.Context, inputBucket, inputPrefix string, start, end common.LocalDate) ([]*common.Flight, error) {
	var flights []*common.Flight

	for curr := range start.Until(end) {
		converted, err := a.convertSingle(ctx, inputBucket, inputPrefix, curr)
		if err != nil {
			return nil, err
		}

		flights = append(flights, converted...)
	}

	return flights, nil
}

func (a *cfsAction) convertSingle(ctx context.Context, inputBucket, inputPrefix string, d common.LocalDate) ([]*common.Flight, error) {
	var flights []*common.Flight
	{
		schedules, err := a.loadFlightSchedules(ctx, inputBucket, inputPrefix, d)
		if err != nil {
			return nil, err
		}

		flights, err = convertFlightSchedulesToFlights(d, schedules)
		if err != nil {
			return nil, err
		}
	}

	return flights, nil
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

func (a *cfsAction) upsertFlights(ctx context.Context, bucket, prefix string, d common.LocalDate, queryDateRanges common.LocalDateRanges, flights []*common.Flight) error {
	s3Key := prefix + d.Time(nil).Format("2006/01/02") + ".json"
	existing, err := a.loadFlights(ctx, bucket, s3Key)
	if err != nil {
		return err
	}

	added := make(map[common.FlightId]struct{})
	result := make([]*common.Flight, 0, max(len(flights), len(existing)))

	for _, f := range flights {
		result = append(result, f)
		added[f.Id()] = struct{}{}
	}

	for _, f := range existing {
		if _, ok := added[f.Id()]; !ok && !queryDateRanges.Contains(f.QueryDate) {
			result = append(result, f)
			added[f.Id()] = struct{}{}
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

func convertFlightSchedulesToFlights(queryDate common.LocalDate, schedules []lufthansa.FlightSchedule) ([]*common.Flight, error) {
	lookup := make(map[common.FlightId]*common.Flight)
	codeShareIds := make(map[common.FlightId]struct{})
	addLater := make(map[common.FlightId][]*common.Flight)

	for _, fs := range schedules {
		for _, leg := range fs.Legs {
			f := &common.Flight{
				QueryDate:                    queryDate,
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

			lookup[f.Id()] = f

			if codeSharesRaw := f.DataElements[codeShareChildId]; codeSharesRaw != "" {
				// this flight has codeshares
				for _, codeShare := range strings.Split(codeSharesRaw, "/") {
					codeShareFn, err := common.ParseFlightNumber(codeShare)
					if err != nil {
						return nil, err
					}

					if _, ok := f.CodeShares[codeShareFn]; !ok {
						f.CodeShares[codeShareFn] = make(map[int]string)
					}

					// mark as codeshare
					codeShareIds[codeShareFn.Id(f.Departure())] = struct{}{}
				}
			}

			if codeShare := f.DataElements[codeShareParentId]; codeShare != "" {
				// this flight is a codeshare
				parentFn, err := common.ParseFlightNumber(codeShare)
				if err != nil {
					return nil, err
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
				QueryDate:                    queryDate,
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
				DataElements:                 make(map[int]string),
				CodeShares:                   make(map[common.FlightNumber]map[int]string),
			}

			lookup[fid] = f
		}

		for _, child := range codeShares {
			f.CodeShares[child.Number()] = child.DataElements
		}
	}

	flights := make([]*common.Flight, 0, len(lookup)-len(codeShareIds))
	for fid, f := range lookup {
		if _, ok := codeShareIds[fid]; !ok {
			flights = append(flights, f)
		}
	}

	return flights, nil
}

func groupByDepartureDateUTC(results [][]*common.Flight) map[common.LocalDate][]*common.Flight {
	grouped := make(map[common.LocalDate][]*common.Flight)
	for _, result := range results {
		for _, f := range result {
			grouped[f.DepartureDate()] = append(grouped[f.DepartureDate()], f)
		}
	}

	return grouped
}
