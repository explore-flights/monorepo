package data

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	jsoniter "github.com/json-iterator/go"
	"iter"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync/atomic"
)

var ErrSeatMapFreshFetchRequired = errors.New("fresh fetch required but not allowed")

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

func (h *Handler) FlightSchedule(ctx context.Context, fn common.FlightNumber) (*common.FlightSchedule, error) {
	var fs *common.FlightSchedule
	err := h.flightSchedulesStream(ctx, fn.Airline, func(seq iter.Seq2[string, *onceIter[*common.FlightSchedule]]) error {
		for fnRaw, scheduleIt := range seq {
			if fnRaw == fn.String() {
				var err error
				fs, err = scheduleIt.Read()
				return err
			}
		}

		return nil
	})

	return fs, err
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

func (h *Handler) SeatMap(ctx context.Context, fn common.FlightNumber, departureAirport, arrivalAirport string, departureDate xtime.LocalDate, cabinClass lufthansa.RequestCabinClass, aircraftType, aircraftConfigurationVersion string, allowFetchFresh bool) (*lufthansa.SeatAvailability, error) {
	s3Key := h.seatMapS3Key(fn.Airline, aircraftType, aircraftConfigurationVersion, cabinClass)
	sm, found, err := h.loadSeatMapFromS3(ctx, s3Key)
	if err != nil {
		return nil, err
	}

	if found {
		slog.InfoContext(
			ctx,
			"loaded seatmap from s3 cache",
			slog.String("fn", fn.String()),
			slog.String("departureAirport", departureAirport),
			slog.String("arrivalAirport", arrivalAirport),
			slog.String("departureDate", departureDate.String()),
			slog.String("cabinClass", string(cabinClass)),
			slog.String("aircraftType", aircraftType),
			slog.String("aircraftConfigurationVersion", aircraftConfigurationVersion),
			slog.Bool("isNull", sm == nil),
		)

		return sm, nil
	}

	if !allowFetchFresh {
		return nil, ErrSeatMapFreshFetchRequired
	}

	sm, err = h.loadSeatMapFromLH(ctx, fn, departureAirport, arrivalAirport, departureDate, cabinClass)
	if err != nil {
		return nil, err
	}

	return sm, adapt.S3PutJson(ctx, h.s3c, h.bucket, s3Key, sm)
}

func (h *Handler) loadSeatMapFromLH(ctx context.Context, fn common.FlightNumber, departureAirport, arrivalAirport string, departureDate xtime.LocalDate, cabinClass lufthansa.RequestCabinClass) (*lufthansa.SeatAvailability, error) {
	sm, err := h.lhc.SeatMap(
		ctx,
		fn.String(),
		departureAirport,
		arrivalAirport,
		departureDate,
		cabinClass,
	)

	if err != nil {
		var rse lufthansa.ResponseStatusErr
		if errors.As(err, &rse) && rse.StatusCode == http.StatusNotFound {
			return nil, nil
		} else {
			return nil, err
		}
	}

	return &sm, nil
}

func (h *Handler) loadSeatMapFromS3(ctx context.Context, s3Key string) (*lufthansa.SeatAvailability, bool, error) {
	resp, err := h.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.bucket),
		Key:    aws.String(s3Key),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, false, nil
		} else {
			return nil, false, err
		}
	}

	defer resp.Body.Close()

	var sm *lufthansa.SeatAvailability
	if err := json.NewDecoder(resp.Body).Decode(&sm); err != nil {
		return nil, false, err
	}

	return sm, true, nil
}

func (h *Handler) seatMapS3Key(airline common.AirlineIdentifier, aircraftType, aircraftConfigurationVersion string, cabinClass lufthansa.RequestCabinClass) string {
	return fmt.Sprintf("tmp/seatmap/%s/%s/%s/%s.json", airline, aircraftType, aircraftConfigurationVersion, cabinClass)
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
