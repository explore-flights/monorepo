package search

import (
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"golang.org/x/sync/errgroup"
	"sync"
)

type MinimalS3Client adapt.S3Getter

type FlightRepo struct {
	s3c    MinimalS3Client
	bucket string
	cache  concurrent.Map[xtime.LocalDate, []*common.Flight]
}

func NewFlightRepo(s3c MinimalS3Client, bucket string) *FlightRepo {
	return &FlightRepo{
		s3c:    s3c,
		bucket: bucket,
		cache:  concurrent.NewMap[xtime.LocalDate, []*common.Flight](),
	}
}

func (fr *FlightRepo) Flights(ctx context.Context, start, end xtime.LocalDate) (map[xtime.LocalDate][]*common.Flight, error) {
	var mtx sync.Mutex
	result := make(map[xtime.LocalDate][]*common.Flight)

	g, ctx := errgroup.WithContext(ctx)
	curr := start

	for curr.Compare(end) <= 0 {
		d := curr
		g.Go(func() error {
			flights, err := fr.flightsInternal(ctx, d)
			if err != nil {
				return err
			}

			mtx.Lock()
			defer mtx.Unlock()

			result[d] = flights

			return nil
		})

		curr = curr.Next()
	}

	return result, g.Wait()
}

func (fr *FlightRepo) flightsInternal(ctx context.Context, d xtime.LocalDate) ([]*common.Flight, error) {
	if flights, ok := fr.cache.Load(d); ok {
		return flights, nil
	}

	flights, err := fr.loadFlights(ctx, d)
	if err != nil {
		return nil, err
	}

	fr.cache.Store(d, flights)
	return flights, nil
}

func (fr *FlightRepo) loadFlights(ctx context.Context, d xtime.LocalDate) ([]*common.Flight, error) {
	resp, err := fr.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(fr.bucket),
		Key:    aws.String("processed/flights/" + d.Time(nil).Format("2006/01/02") + ".json"),
	})

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	var flights []*common.Flight
	return flights, json.NewDecoder(resp.Body).Decode(&flights)
}
