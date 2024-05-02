package search

import (
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"golang.org/x/sync/errgroup"
	"sync"
)

type concurrentMap[K comparable, V any] struct {
	m   map[K]V
	mtx *sync.RWMutex
}

func (cm concurrentMap[K, V]) Get(k K) (V, bool) {
	cm.mtx.RLock()
	defer cm.mtx.RUnlock()

	v, ok := cm.m[k]
	return v, ok
}

func (cm concurrentMap[K, V]) Set(k K, v V) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	cm.m[k] = v
}

func (cm concurrentMap[K, V]) Del(k K) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	delete(cm.m, k)
}

type FlightRepo struct {
	s3c    *s3.Client
	bucket string
	cache  concurrentMap[common.LocalDate, []*common.Flight]
}

func NewFlightRepo(s3c *s3.Client, bucket string) *FlightRepo {
	return &FlightRepo{
		s3c:    s3c,
		bucket: bucket,
		cache: concurrentMap[common.LocalDate, []*common.Flight]{
			m:   make(map[common.LocalDate][]*common.Flight),
			mtx: new(sync.RWMutex),
		},
	}
}

func (fr *FlightRepo) Flights(ctx context.Context, start, end common.LocalDate) (map[common.LocalDate][]*common.Flight, error) {
	var mtx sync.Mutex
	result := make(map[common.LocalDate][]*common.Flight)

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

func (fr *FlightRepo) flightsInternal(ctx context.Context, d common.LocalDate) ([]*common.Flight, error) {
	if flights, ok := fr.cache.Get(d); ok {
		return flights, nil
	}

	flights, err := fr.loadFlights(ctx, d)
	if err != nil {
		return nil, err
	}

	fr.cache.Set(d, flights)
	return flights, nil
}

func (fr *FlightRepo) loadFlights(ctx context.Context, d common.LocalDate) ([]*common.Flight, error) {
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
