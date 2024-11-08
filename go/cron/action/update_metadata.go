package action

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"golang.org/x/sync/errgroup"
	"maps"
	"time"
)

type UpdateMetadataParams struct {
	InputBucket  string `json:"inputBucket"`
	InputPrefix  string `json:"inputPrefix"`
	OutputBucket string `json:"outputBucket"`
	OutputPrefix string `json:"outputPrefix"`
}

type UpdateMetadataOutput struct {
	Airports      AddedAndRemoved `json:"airports"`
	Airlines      AddedAndRemoved `json:"airlines"`
	FlightNumbers AddedAndRemoved `json:"flightNumbers"`
	Aircraft      AddedAndRemoved `json:"aircraft"`
}

type AddedAndRemoved struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

type metadata struct {
	airports      common.Set[string]
	airlines      common.Set[common.AirlineIdentifier]
	flightNumbers map[common.FlightNumber]time.Time
	aircraft      common.Set[string]
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

	files, err := a.listScheduleFiles(ctx, params.InputBucket, params.InputPrefix)
	if err != nil {
		return UpdateMetadataOutput{}, err
	}

	wg := concurrent.WorkGroup[[2]string, metadata, metadata]{
		Parallelism: 10,
		Worker:      a.worker,
		Combiner:    a.combiner,
		Finisher:    a.finisher,
	}

	md, err := wg.RunSeq(ctx, xiter.All(files))
	if err != nil {
		return UpdateMetadataOutput{}, err
	}

	return a.updateMetadata(ctx, params.OutputBucket, params.OutputPrefix, md)
}

func (a *umdAction) listScheduleFiles(ctx context.Context, bucket, prefix string) ([][2]string, error) {
	files := make([][2]string, 0)

	paginator := s3.NewListObjectsV2Paginator(a.s3c, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		resp, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}

		for _, obj := range resp.Contents {
			files = append(files, [2]string{bucket, *obj.Key})
		}
	}

	return files, nil
}

func (a *umdAction) worker(ctx context.Context, obj [2]string, md metadata) (metadata, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(obj[0]),
		Key:    aws.String(obj[1]),
	})

	if err != nil {
		return md, err
	}

	defer resp.Body.Close()

	r, err := gzip.NewReader(resp.Body)
	if err != nil {
		return md, err
	}

	defer r.Close()

	var schedules map[common.FlightNumber]*common.FlightSchedule
	if err = json.NewDecoder(r).Decode(&schedules); err != nil {
		return md, err
	}

	md = a.ensureMetadata(md)
	for fn, fs := range schedules {
		md.airlines[fn.Airline] = struct{}{}

		for _, variant := range fs.Variants {
			md.flightNumbers[fn] = common.Max(md.flightNumbers[fn], variant.Metadata.RangesUpdateTime)
			md.flightNumbers[fn] = common.Max(md.flightNumbers[fn], variant.Metadata.DataUpdateTime)

			md.airports[variant.Data.DepartureAirport] = struct{}{}
			md.airports[variant.Data.ArrivalAirport] = struct{}{}
			md.aircraft[variant.Data.AircraftType] = struct{}{}
		}
	}

	return md, nil
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
		md.airports = make(common.Set[string])
	}

	if md.airlines == nil {
		md.airlines = make(common.Set[common.AirlineIdentifier])
	}

	if md.flightNumbers == nil {
		md.flightNumbers = make(map[common.FlightNumber]time.Time)
	}

	if md.aircraft == nil {
		md.aircraft = make(common.Set[string])
	}

	return md
}

func (a *umdAction) updateMetadata(ctx context.Context, bucket, prefix string, md metadata) (UpdateMetadataOutput, error) {
	var output UpdateMetadataOutput

	g, ctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		output.Airports.Added, output.Airports.Removed, err = updateMetadata(ctx, a.s3c, bucket, prefix, "airports", md.airports)
		return err
	})

	g.Go(func() error {
		var err error
		output.Airlines.Added, output.Airlines.Removed, err = updateMetadata(ctx, a.s3c, bucket, prefix, "airlines", md.airlines)
		return err
	})

	g.Go(func() error {
		key := prefix + "flightNumbers.json"
		{
			var existing map[common.FlightNumber]time.Time
			if err := adapt.S3GetJson(ctx, a.s3c, bucket, key, &existing); err != nil && !adapt.IsS3NotFound(err) {
				return err
			}

			if existing != nil {
				for fn := range md.flightNumbers {
					_, ok := existing[fn]
					delete(existing, fn)

					if !ok {
						output.FlightNumbers.Added += 1
					}
				}

				output.FlightNumbers.Removed = len(existing)
			} else {
				output.FlightNumbers.Added = len(md.flightNumbers)
				output.FlightNumbers.Removed = 0
			}
		}

		return adapt.S3PutJson(ctx, a.s3c, bucket, key, md.flightNumbers)
	})

	g.Go(func() error {
		var err error
		output.Aircraft.Added, output.Aircraft.Removed, err = updateMetadata(ctx, a.s3c, bucket, prefix, "aircraft", md.aircraft)
		return err
	})

	return output, g.Wait()
}

func updateMetadata[T comparable](ctx context.Context, s3c MinimalS3Client, bucket, prefix, name string, newValues common.Set[T]) (int, int, error) {
	key := prefix + name + ".json"
	existingValues, err := loadExisting[T](ctx, s3c, bucket, key)
	if err != nil {
		return 0, 0, err
	}

	result := make([]T, 0, len(newValues))
	added := 0

	for value := range newValues {
		result = append(result, value)

		if !existingValues.Remove(value) {
			// added are all those that were not present before
			added += 1
		}
	}

	// removed are all those that are not present anymore
	removed := len(existingValues)

	return added, removed, adapt.S3PutJson(ctx, s3c, bucket, key, result)
}

func loadExisting[T comparable](ctx context.Context, s3c MinimalS3Client, bucket, key string) (common.Set[T], error) {
	var existingValues []T
	err := adapt.S3GetJson(ctx, s3c, bucket, key, &existingValues)
	if err != nil {
		if adapt.IsS3NotFound(err) {
			return make(common.Set[T]), nil
		} else {
			return nil, err
		}
	}

	values := make(common.Set[T])
	for _, v := range existingValues {
		values[v] = struct{}{}
	}

	return values, nil
}
