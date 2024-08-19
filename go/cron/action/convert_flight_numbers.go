package action

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"golang.org/x/sync/errgroup"
)

type ConvertFlightNumbersParams struct {
	InputBucket  string                `json:"inputBucket"`
	InputPrefix  string                `json:"inputPrefix"`
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   [][2]common.LocalDate `json:"dateRanges"`
}

type ConvertFlightNumbersOutput struct {
}

type cfnAction struct {
	s3c *s3.Client
}

func NewConvertFlightNumbersAction(s3c *s3.Client) Action[ConvertFlightNumbersParams, ConvertFlightNumbersOutput] {
	return &cfnAction{s3c}
}

func (a *cfnAction) Handle(ctx context.Context, params ConvertFlightNumbersParams) (ConvertFlightNumbersOutput, error) {
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

	return ConvertFlightNumbersOutput{}, g.Wait()
}

func (a *cfnAction) convertRange(ctx context.Context, inputBucket, inputPrefix, outputBucket, outputPrefix string, start, end common.LocalDate) error {
	for curr := range start.Until(end) {
		if err := a.convertSingle(ctx, inputBucket, inputPrefix, outputBucket, outputPrefix, curr); err != nil {
			return err
		}
	}

	return nil
}

func (a *cfnAction) convertSingle(ctx context.Context, inputBucket, inputPrefix, outputBucket, outputPrefix string, d common.LocalDate) error {
	var flightNumbers map[common.FlightId]*common.Flight
	{
		flights, err := a.loadFlights(ctx, inputBucket, inputPrefix, d)
		if err != nil {
			return err
		}

		flightNumbers = convertFlightsToFlightNumbers(flights)
	}

	return a.saveFlightNumbers(ctx, outputBucket, outputPrefix, d, flightNumbers)
}

func (a *cfnAction) loadFlights(ctx context.Context, bucket, prefix string, d common.LocalDate) ([]*common.Flight, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
	})

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	var flights []*common.Flight
	return flights, json.NewDecoder(resp.Body).Decode(&flights)
}

func (a *cfnAction) saveFlightNumbers(ctx context.Context, bucket, prefix string, d common.LocalDate, flightNumbers map[common.FlightId]*common.Flight) error {
	for fid, flight := range flightNumbers {
		b, err := json.Marshal(flight)
		if err != nil {
			return err
		}

		_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
			Bucket: aws.String(bucket),
			Key: aws.String(fmt.Sprintf(
				"%s%s/%s/%s.json",
				prefix,
				fid.Number.String(),
				fid.Departure.Airport,
				d.Time(nil).Format("2006/01/02"),
			)),
			ContentType: aws.String("application/json"),
			Body:        bytes.NewReader(b),
		})

		if err != nil {
			return err
		}
	}

	return nil
}

func convertFlightsToFlightNumbers(flights []*common.Flight) map[common.FlightId]*common.Flight {
	result := make(map[common.FlightId]*common.Flight)
	for _, flight := range flights {
		result[flight.Id()] = flight

		for _, fn := range flight.CodeShares {
			result[fn.Id(flight.Departure())] = flight
		}
	}

	return result
}
