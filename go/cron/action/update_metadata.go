package action

import (
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"golang.org/x/sync/errgroup"
	"maps"
	"slices"
)

type UpdateMetadataParams struct {
	InputBucket  string                `json:"inputBucket"`
	InputPrefix  string                `json:"inputPrefix"`
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   xtime.LocalDateRanges `json:"dateRanges"`
}

type UpdateMetadataOutput struct {
	NewAirports      int `json:"newAirports"`
	NewAirlines      int `json:"newAirlines"`
	NewFlightNumbers int `json:"newFlightNumbers"`
	NewAircraft      int `json:"newAircraft"`
}

type metadata struct {
	airports      map[string]struct{}
	airlines      map[common.AirlineIdentifier]struct{}
	flightNumbers map[common.FlightNumber]struct{}
	aircraft      map[string]struct{}
}

type umdAction struct {
	s3c MinimalS3Client
}

func NewUpdateMetadataAction(s3c MinimalS3Client) Action[UpdateMetadataParams, UpdateMetadataOutput] {
	return &umdAction{s3c}
}

func (a *umdAction) Handle(ctx context.Context, params UpdateMetadataParams) (UpdateMetadataOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	wg := concurrent.WorkGroup[xtime.LocalDate, metadata, metadata]{
		Parallelism: 10,
		Worker:      a.worker(params.InputBucket, params.InputPrefix),
		Combiner:    a.combiner,
		Finisher:    a.finisher,
	}

	md, err := wg.RunSeq(ctx, params.DateRanges.Iter())
	if err != nil {
		return UpdateMetadataOutput{}, err
	}

	return a.upsertMetadata(ctx, params.OutputBucket, params.OutputPrefix, md)
}

func (a *umdAction) worker(bucket, prefix string) func(ctx context.Context, d xtime.LocalDate, md metadata) (metadata, error) {
	return func(ctx context.Context, d xtime.LocalDate, md metadata) (metadata, error) {
		resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
		})

		if err != nil {
			return md, err
		}

		defer resp.Body.Close()

		var flights []*common.Flight
		if err = json.NewDecoder(resp.Body).Decode(&flights); err != nil {
			return md, err
		}

		md = a.ensureMetadata(md)
		for _, f := range flights {
			md.airports[f.DepartureAirport] = struct{}{}
			md.airports[f.ArrivalAirport] = struct{}{}

			for fn := range xiter.Combine(xiter.Single(f.Number()), maps.Keys(f.CodeShares)) {
				md.airlines[fn.Airline] = struct{}{}
				md.flightNumbers[fn] = struct{}{}
			}

			md.aircraft[f.AircraftType] = struct{}{}
		}

		return md, nil
	}
}

func (a *umdAction) combiner(ctx context.Context, first, second metadata) (metadata, error) {
	first = a.ensureMetadata(first)

	if second.airports != nil {
		maps.Copy(first.airports, second.airports)
	}

	if second.airlines != nil {
		maps.Copy(first.airlines, second.airlines)
	}

	if second.flightNumbers != nil {
		maps.Copy(first.flightNumbers, second.flightNumbers)
	}

	if second.aircraft != nil {
		maps.Copy(first.aircraft, second.aircraft)
	}

	return first, nil
}

func (a *umdAction) finisher(ctx context.Context, md metadata) (metadata, error) {
	return a.ensureMetadata(md), nil
}

func (*umdAction) ensureMetadata(md metadata) metadata {
	if md.airports == nil {
		md.airports = make(map[string]struct{})
	}

	if md.airlines == nil {
		md.airlines = make(map[common.AirlineIdentifier]struct{})
	}

	if md.flightNumbers == nil {
		md.flightNumbers = make(map[common.FlightNumber]struct{})
	}

	if md.aircraft == nil {
		md.aircraft = make(map[string]struct{})
	}

	return md
}

func (a *umdAction) upsertMetadata(ctx context.Context, bucket, prefix string, md metadata) (UpdateMetadataOutput, error) {
	var output UpdateMetadataOutput

	g, ctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		output.NewAirports, err = upsertMetadata(ctx, a.s3c, bucket, prefix, "airports", md.airports)
		return err
	})

	g.Go(func() error {
		var err error
		output.NewAirlines, err = upsertMetadata(ctx, a.s3c, bucket, prefix, "airlines", md.airlines)
		return err
	})

	g.Go(func() error {
		var err error
		output.NewFlightNumbers, err = upsertMetadata(ctx, a.s3c, bucket, prefix, "flightNumbers", md.flightNumbers)
		return err
	})

	g.Go(func() error {
		var err error
		output.NewAircraft, err = upsertMetadata(ctx, a.s3c, bucket, prefix, "aircraft", md.aircraft)
		return err
	})

	return output, g.Wait()
}

func upsertMetadata[T comparable](ctx context.Context, s3c MinimalS3Client, bucket, prefix, name string, newValues map[T]struct{}) (int, error) {
	key := prefix + name + ".json"

	var existingValues []T
	err := adapt.S3GetJson(ctx, s3c, bucket, key, &existingValues)

	if err != nil && !adapt.IsS3NotFound(err) {
		return 0, err
	}

	newValueCount := len(newValues)
	for _, v := range existingValues {
		if _, ok := newValues[v]; ok {
			newValueCount--
		} else {
			newValues[v] = struct{}{}
		}
	}

	return newValueCount, adapt.S3PutJson(ctx, s3c, bucket, key, slices.AppendSeq(make([]T, 0, len(newValues)), maps.Keys(newValues)))
}
