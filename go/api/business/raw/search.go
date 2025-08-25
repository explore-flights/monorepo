package raw

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	jsoniter "github.com/json-iterator/go"
)

type Search struct {
	s3c    adapt.S3Getter
	bucket string
}

func NewSearch(s3c adapt.S3Getter, bucket string) *Search {
	return &Search{
		s3c:    s3c,
		bucket: bucket,
	}
}

func (s *Search) Search(ctx context.Context, version time.Time, fnRaw string, departureDateLocal xtime.LocalDate, departureAirportIata string) ([]lufthansa.FlightSchedule, error) {
	resp, err := s.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(fmt.Sprintf("raw/LH_Public_Data/flightschedules_history/%s.tar.gz", version.UTC().Format(time.RFC3339))),
	})
	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, nil
		} else {
			return nil, err
		}
	}

	defer resp.Body.Close()

	gzipR, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, err
	}

	defer gzipR.Close()

	tarR := tar.NewReader(gzipR)
	result := make([]lufthansa.FlightSchedule, 0)

	for {
		header, err := tarR.Next()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
		}

		if utcDateRaw, ok := strings.CutSuffix(header.Name, ".json"); ok {
			utcDate, err := time.Parse("2006/01/02", utcDateRaw)
			if err != nil {
				continue
			}

			utcLocalDate := xtime.NewLocalDate(utcDate)
			if utcLocalDate >= (departureDateLocal-1) && utcLocalDate <= (departureDateLocal+1) {
				it := jsoniter.Parse(jsoniter.ConfigCompatibleWithStandardLibrary, tarR, 8196)
				for it.ReadArray() {
					var fs lufthansa.FlightSchedule
					it.ReadVal(&fs)
					if it.Error != nil {
						break
					}

					if s.matchesFilter(fs, fnRaw, departureDateLocal, departureAirportIata) {
						result = append(result, fs)
					}
				}

				if it.Error != nil {
					return nil, fmt.Errorf("json parsing error: %v", it.Error)
				}
			}
		}
	}

	return result, nil
}

func (s *Search) matchesFilter(fs lufthansa.FlightSchedule, fnRaw string, departureDateLocal xtime.LocalDate, departureAirportIata string) bool {
	return s.matchesFlightNumber(fs, fnRaw) && s.matchesDepartureDateLocal(fs, departureDateLocal) && s.matchesDepartureAirport(fs, departureAirportIata)
}

func (s *Search) matchesFlightNumber(fs lufthansa.FlightSchedule, fnRaw string) bool {
	if fmt.Sprintf("%s%d%s", fs.Airline, fs.FlightNumber, fs.Suffix) == fnRaw {
		return true
	}

	for _, de := range fs.DataElements {
		if (de.Id == 10 || de.Id == 50) && slices.Contains(strings.Split(de.Value, "/"), fnRaw) {
			return true
		}
	}

	return false
}

func (s *Search) matchesDepartureDateLocal(fs lufthansa.FlightSchedule, departureDateLocal xtime.LocalDate) bool {
	for _, leg := range fs.Legs {
		if xtime.NewLocalDate(leg.DepartureTime(fs.PeriodOfOperationUTC.StartDate)) == departureDateLocal {
			return true
		}
	}

	return false
}

func (s *Search) matchesDepartureAirport(fs lufthansa.FlightSchedule, departureAirportIata string) bool {
	for _, leg := range fs.Legs {
		if leg.Origin == departureAirportIata {
			return true
		}
	}

	return false
}
