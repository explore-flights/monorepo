package action

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"golang.org/x/sync/errgroup"
)

const codeShareId int = 50

type ConvertFlightSchedulesParams struct {
	InputBucket  string                `json:"inputBucket"`
	InputPrefix  string                `json:"inputPrefix"`
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   [][2]common.LocalDate `json:"dateRanges"`
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

	g, ctx := errgroup.WithContext(ctx)
	for _, r := range params.DateRanges {
		g.Go(func() error {
			return a.convertRange(
				ctx,
				params.InputBucket,
				params.InputPrefix,
				params.OutputBucket,
				params.OutputPrefix,
				r[0],
				r[1],
			)
		})
	}

	return ConvertFlightSchedulesOutput{}, g.Wait()
}

func (a *cfsAction) convertRange(ctx context.Context, inputBucket, inputPrefix, outputBucket, outputPrefix string, start, end common.LocalDate) error {
	for _, curr := range start.Until(end) {
		if err := a.convertSingle(ctx, inputBucket, inputPrefix, outputBucket, outputPrefix, curr); err != nil {
			return err
		}

		curr = curr.Next()
	}

	return nil
}

func (a *cfsAction) convertSingle(ctx context.Context, inputBucket, inputPrefix, outputBucket, outputPrefix string, d common.LocalDate) error {
	var flights []*common.Flight
	{
		schedules, err := a.loadFlightSchedules(ctx, inputBucket, inputPrefix, d)
		if err != nil {
			return err
		}

		flights, err = convertFlightSchedulesToFlights(schedules)
		if err != nil {
			return err
		}
	}

	return a.saveFlights(ctx, outputBucket, outputPrefix, d, flights)
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

func (a *cfsAction) saveFlights(ctx context.Context, bucket, prefix string, d common.LocalDate, flights []*common.Flight) error {
	b, err := json.Marshal(flights)
	if err != nil {
		return err
	}

	_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
		ContentType: aws.String("application/json"),
		Body:        bytes.NewReader(b),
	})

	return err
}

func convertFlightSchedulesToFlights(schedules []lufthansa.FlightSchedule) ([]*common.Flight, error) {
	flights := make([]*common.Flight, 0, len(schedules))
	lookup := make(map[common.FlightId]*common.Flight)
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
				CodeShares:                   make([]common.FlightNumber, 0),
			}

			lookup[f.Id()] = f

			if codeShare := f.DataElements[codeShareId]; codeShare != "" {
				fn, err := common.ParseFlightNumber(codeShare)
				if err != nil {
					return nil, err
				}

				fid := common.FlightId{
					Number:    fn,
					Departure: f.Departure(),
				}

				if parent, ok := lookup[fid]; ok {
					parent.CodeShares = append(parent.CodeShares, f.Number())
				} else {
					addLater[fid] = append(addLater[fid], f)
				}
			} else {
				flights = append(flights, f)

				if codeShares, ok := addLater[f.Id()]; ok {
					for _, child := range codeShares {
						f.CodeShares = append(f.CodeShares, child.Number())
					}

					delete(addLater, f.Id())
				}
			}
		}
	}

	for fid, codeShares := range addLater {
		if len(codeShares) < 1 {
			continue
		}

		first := codeShares[0]
		f := &common.Flight{
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
			DataElements:                 first.DataElements,
			CodeShares:                   make([]common.FlightNumber, 0),
		}

		for _, child := range codeShares {
			f.CodeShares = append(f.CodeShares, child.Number())
		}

		flights = append(flights, f)
	}

	return flights, nil
}
