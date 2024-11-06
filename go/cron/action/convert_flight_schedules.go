package action

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"strings"
	"sync"
	"time"
)

const (
	codeShareChildId  int = 10
	codeShareParentId int = 50
)

type Pair[T1, T2 any] struct {
	_1 T1
	_2 T2
}

type ConvertFlightSchedulesParams struct {
	InputBucket  string                `json:"inputBucket"`
	InputPrefix  string                `json:"inputPrefix"`
	OutputBucket string                `json:"outputBucket"`
	OutputPrefix string                `json:"outputPrefix"`
	DateRanges   xtime.LocalDateRanges `json:"dateRanges"`
}

type ConvertFlightSchedulesOutput struct {
	DateRanges xtime.LocalDateRanges `json:"dateRanges"`
}

type cfsAction struct {
	s3c MinimalS3Client
}

func NewConvertFlightSchedulesAction(s3c MinimalS3Client) Action[ConvertFlightSchedulesParams, ConvertFlightSchedulesOutput] {
	return &cfsAction{s3c}
}

func (a *cfsAction) Handle(ctx context.Context, params ConvertFlightSchedulesParams) (ConvertFlightSchedulesOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var output ConvertFlightSchedulesOutput
	var err error

	output.DateRanges, err = a.convertAndUpsertAll(
		ctx,
		params.InputBucket,
		params.InputPrefix,
		params.OutputBucket,
		params.OutputPrefix,
		params.DateRanges,
	)

	return output, err
}

func (a *cfsAction) convertAndUpsertAll(ctx context.Context, inputBucket, inputPrefix, outputBucket, outputPrefix string, ldrs xtime.LocalDateRanges) (xtime.LocalDateRanges, error) {
	locks := concurrent.NewMap[xtime.LocalDate, *sync.Mutex]()
	wg := concurrent.WorkGroup[xtime.LocalDate, xtime.LocalDateRanges, xtime.LocalDateRanges]{
		Parallelism: 10,
		Worker: func(ctx context.Context, queryDate xtime.LocalDate, acc xtime.LocalDateRanges) (xtime.LocalDateRanges, error) {
			fmt.Printf("loading and converting %v\n", queryDate)

			flights, err := a.convertSingle(ctx, inputBucket, inputPrefix, queryDate)
			if err != nil {
				return acc, err
			}

			flightsByDepartureDateUTC := make(map[xtime.LocalDate][]*common.Flight)
			for _, f := range flights {
				flightsByDepartureDateUTC[f.DepartureDateUTC()] = append(flightsByDepartureDateUTC[f.DepartureDateUTC()], f)
			}

			for departureDateUTC, flights := range flightsByDepartureDateUTC {
				acc = acc.Add(departureDateUTC)

				err = func() error {
					mtx := locks.Compute(departureDateUTC, func(v *sync.Mutex, exists bool) *sync.Mutex {
						if !exists {
							v = new(sync.Mutex)
						}

						return v
					})

					mtx.Lock()
					defer mtx.Unlock()

					fmt.Printf("upserting %v\n", departureDateUTC)

					return a.upsertFlights(ctx, outputBucket, outputPrefix, departureDateUTC, queryDate, flights)
				}()

				if err != nil {
					return acc, err
				}
			}

			return acc, nil
		},
		Combiner: func(ctx context.Context, a, b xtime.LocalDateRanges) (xtime.LocalDateRanges, error) {
			return a.ExpandAll(b), nil
		},
		Finisher: func(ctx context.Context, acc xtime.LocalDateRanges) (xtime.LocalDateRanges, error) {
			return acc, nil
		},
	}

	return wg.RunSeq(ctx, ldrs.Compact().Iter())
}

func (a *cfsAction) convertSingle(ctx context.Context, inputBucket, inputPrefix string, d xtime.LocalDate) ([]*common.Flight, error) {
	lastModified, schedules, err := a.loadFlightSchedules(ctx, inputBucket, inputPrefix, d)
	if err != nil {
		return nil, err
	}

	return convertFlightSchedulesToFlights(d, lastModified, schedules)
}

func (a *cfsAction) loadFlightSchedules(ctx context.Context, bucket, prefix string, d xtime.LocalDate) (time.Time, []lufthansa.FlightSchedule, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(prefix + d.Time(nil).Format("2006/01/02") + ".json"),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			err = nil
		}

		return time.Time{}, nil, err
	}

	defer resp.Body.Close()

	var schedules []lufthansa.FlightSchedule
	return *resp.LastModified, schedules, json.NewDecoder(resp.Body).Decode(&schedules)
}

func (a *cfsAction) upsertFlights(ctx context.Context, bucket, prefix string, d xtime.LocalDate, queryDate xtime.LocalDate, flights []*common.Flight) error {
	s3Key := prefix + d.Time(nil).Format("2006/01/02") + ".json"
	existing, err := a.loadFlights(ctx, bucket, s3Key)
	if err != nil {
		return err
	}

	added := make(map[common.FlightId]*common.Flight)
	result := make([]*common.Flight, 0, max(len(flights), len(existing)))

	for _, f := range flights {
		if addedFlight, ok := added[f.Id()]; ok {
			combineFlights(addedFlight, f)
		} else {
			result = append(result, f)
			added[f.Id()] = f
		}
	}

	for _, f := range existing {
		if addedFlight, ok := added[f.Id()]; ok {
			combineFlights(addedFlight, f)
		} else {
			if queryDate != f.Metadata.QueryDate {
				result = append(result, f)
				added[f.Id()] = f
			}
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

func convertFlightSchedulesToFlights(queryDate xtime.LocalDate, lastModified time.Time, schedules []lufthansa.FlightSchedule) ([]*common.Flight, error) {
	lookup := make(map[common.FlightId]*common.Flight)
	codeShareIds := make(map[common.FlightId]struct{})
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
				CodeShares:                   make(map[common.FlightNumber]common.CodeShare),
				Metadata: common.FlightMetadata{
					QueryDate:    queryDate,
					CreationTime: lastModified,
					UpdateTime:   lastModified,
				},
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
						f.CodeShares[codeShareFn] = common.CodeShare{
							DataElements: make(map[int]string),
							Metadata: common.FlightMetadata{
								QueryDate:    queryDate,
								CreationTime: lastModified,
								UpdateTime:   lastModified,
							},
						}
					}

					// mark as codeshare
					codeShareIds[codeShareFn.Id(f.DepartureLocal())] = struct{}{}
				}
			}

			if codeShare := f.DataElements[codeShareParentId]; codeShare != "" {
				// this flight is a codeshare
				parentFn, err := common.ParseFlightNumber(codeShare)
				if err != nil {
					return nil, err
				}

				parentFid := parentFn.Id(f.DepartureLocal())

				if parent, ok := lookup[parentFid]; ok {
					parent.CodeShares[f.Number()] = common.CodeShare{
						DataElements: f.DataElements,
						Metadata:     f.Metadata,
					}
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
				CodeShares:                   make(map[common.FlightNumber]common.CodeShare),
				Metadata: common.FlightMetadata{
					QueryDate:    queryDate,
					CreationTime: lastModified,
					UpdateTime:   lastModified,
				},
			}

			lookup[fid] = f
		}

		for _, child := range codeShares {
			f.CodeShares[child.Number()] = common.CodeShare{
				DataElements: child.DataElements,
				Metadata:     child.Metadata,
			}
		}
	}

	result := make([]*common.Flight, 0, len(lookup))
	for fid, f := range lookup {
		if _, ok := codeShareIds[fid]; !ok {
			result = append(result, f)
		}
	}

	return result, nil
}

func combineFlights(f, other *common.Flight) {
	f.Metadata.CreationTime = xtime.Min(f.Metadata.CreationTime, other.Metadata.CreationTime)

	if f.DataEqual(other) {
		f.Metadata.UpdateTime = xtime.Min(f.Metadata.UpdateTime, other.Metadata.UpdateTime)

		for codeShareFn, codeShare := range f.CodeShares {
			f.CodeShares[codeShareFn] = combineCodeShares(codeShare, other.CodeShares[codeShareFn])
		}
	} else {
		otherIsNewer := f.Metadata.UpdateTime.Before(other.Metadata.UpdateTime)
		otherCodeShares := other.CodeShares

		if otherIsNewer {
			f.DepartureTime = other.DepartureTime
			f.DepartureAirport = other.DepartureAirport
			f.ArrivalTime = other.ArrivalTime
			f.ArrivalAirport = other.ArrivalAirport
			f.ServiceType = other.ServiceType
			f.AircraftOwner = other.AircraftOwner
			f.AircraftType = other.AircraftType
			f.AircraftConfigurationVersion = other.AircraftConfigurationVersion
			f.Registration = other.Registration
			f.DataElements = other.DataElements

			otherCodeShares = f.CodeShares
			f.CodeShares = other.CodeShares

			f.Metadata.QueryDate = other.Metadata.QueryDate
			f.Metadata.UpdateTime = other.Metadata.UpdateTime
		}

		for codeShareFn, otherCodeShare := range otherCodeShares {
			if codeShare, ok := f.CodeShares[codeShareFn]; ok {
				f.CodeShares[codeShareFn] = combineCodeShares(codeShare, otherCodeShare)
			} else {
				if f.Metadata.QueryDate != otherCodeShare.Metadata.QueryDate {
					f.CodeShares[codeShareFn] = otherCodeShare
				}
			}
		}
	}
}

func combineCodeShares(a, b common.CodeShare) common.CodeShare {
	a.Metadata.CreationTime = xtime.Min(a.Metadata.CreationTime, b.Metadata.CreationTime)

	if a.DataEqual(b) {
		a.Metadata.UpdateTime = xtime.Min(a.Metadata.UpdateTime, b.Metadata.UpdateTime)
	} else {
		bIsNewer := a.Metadata.UpdateTime.Before(b.Metadata.UpdateTime)
		if bIsNewer {
			a.Metadata.UpdateTime = b.Metadata.UpdateTime
		}

		for k, v := range b.DataElements {
			if _, ok := a.DataElements[k]; !ok || bIsNewer {
				a.DataElements[k] = v
			}
		}
	}

	return a
}
