package data

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	jsoniter "github.com/json-iterator/go"
	"iter"
	"slices"
	"strings"
	"sync/atomic"
)

type MinimalS3Client interface {
	adapt.S3Getter
	adapt.S3Lister
	adapt.S3Putter
}

type Handler struct {
	s3c    MinimalS3Client
	lhc    *lufthansa.Client
	db     *db.Database
	bucket string
}

func NewHandler(s3c MinimalS3Client, lhc *lufthansa.Client, db *db.Database, bucket string) *Handler {
	return &Handler{
		s3c:    s3c,
		lhc:    lhc,
		db:     db,
		bucket: bucket,
	}
}

func (h *Handler) Airlines(ctx context.Context, prefix string) ([]common.AirlineIdentifier, error) {
	var airlines []common.AirlineIdentifier
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/airlines.json", &airlines); err != nil {
		return nil, err
	}

	return slices.DeleteFunc(airlines, func(airline common.AirlineIdentifier) bool {
		return !strings.HasPrefix(string(airline), prefix)
	}), nil
}

func (h *Handler) flightSchedulesStream(ctx context.Context, airline common.AirlineIdentifier, fn func(seq iter.Seq2[string, *onceIter[*common.FlightSchedule]]) error) error {
	resp, err := h.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.bucket),
		Key:    aws.String(fmt.Sprintf("processed/schedules/%s.json.gz", airline)),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil
		} else {
			return err
		}
	}

	defer resp.Body.Close()

	r, err := gzip.NewReader(resp.Body)
	if err != nil {
		return err
	}

	defer r.Close()

	it := jsoniter.Parse(jsoniter.ConfigCompatibleWithStandardLibrary, r, 8196)
	err = fn(func(yield func(string, *onceIter[*common.FlightSchedule]) bool) {
		it.ReadObjectCB(func(value *jsoniter.Iterator, key string) bool {
			oit := onceIter[*common.FlightSchedule]{it: value}
			defer oit.Consume()

			return yield(key, &oit)
		})
	})

	return errors.Join(err, it.Error)
}

type onceIter[T any] struct {
	it   *jsoniter.Iterator
	v    T
	read atomic.Bool
}

func (it *onceIter[T]) Read() (T, error) {
	if it.read.CompareAndSwap(false, true) {
		it.it.ReadVal(&it.v)
	}

	return it.v, it.it.Error
}

func (it *onceIter[T]) Consume() {
	if it.read.CompareAndSwap(false, true) {
		it.it.Skip()
	}
}
