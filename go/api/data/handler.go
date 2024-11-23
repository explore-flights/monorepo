package data

import (
	"cmp"
	"compress/gzip"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	jsoniter "github.com/json-iterator/go"
	"io"
	"iter"
	"log/slog"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

var ErrSeatMapFreshFetchRequired = errors.New("fresh fetch required but not allowed")

var metroAreaMapping = map[string][2]string{
	// region Asia
	"PEK": {"BJS", "Beijing, China"},
	"PKX": {"BJS", "Beijing, China"},

	"CGK": {"JKT", "Jakarta, Indonesia"},
	"HLP": {"JKT", "Jakarta, Indonesia"},

	"KIX": {"OSA", "Osaka, Japan"},
	"ITM": {"OSA", "Osaka, Japan"},

	"CTS": {"SPK", "Sapporo, Japan"},
	"OKD": {"SPK", "Sapporo, Japan"},

	"ICN": {"SEL", "Seoul, South Korea"},
	"GMP": {"SEL", "Seoul, South Korea"},

	"NRT": {"TYO", "Tokyo, Japan"},
	"HND": {"TYO", "Tokyo, Japan"},
	// endregion
	// region Europe
	"BER": {"BER", "Berlin, Germany"},

	"OTP": {"BUH", "Bucharest, Romania"},
	"BBU": {"BUH", "Bucharest, Romania"},

	"BSL": {"EAP", "Basel, Switzerland & Mulhouse, France"},
	"MLH": {"EAP", "Basel, Switzerland & Mulhouse, France"},

	"BQH": {"LON", "London, United Kingdom"},
	"LCY": {"LON", "London, United Kingdom"},
	"LGW": {"LON", "London, United Kingdom"},
	"LTN": {"LON", "London, United Kingdom"},
	"LHR": {"LON", "London, United Kingdom"},
	"ZLS": {"LON", "London, United Kingdom"},
	"QQP": {"LON", "London, United Kingdom"},
	"QQS": {"LON", "London, United Kingdom"},
	"SEN": {"LON", "London, United Kingdom"},
	"STN": {"LON", "London, United Kingdom"},
	"ZEP": {"LON", "London, United Kingdom"},
	"QQW": {"LON", "London, United Kingdom"},

	"MXP": {"MIL", "Milan, Italy"},
	"LIN": {"MIL", "Milan, Italy"},

	"SVO": {"MOW", "Moscow, Russia"},
	"DME": {"MOW", "Moscow, Russia"},
	"VKO": {"MOW", "Moscow, Russia"},

	"CDG": {"PAR", "Paris, France"},
	"ORY": {"PAR", "Paris, France"},
	"LBG": {"PAR", "Paris, France"},

	"FCO": {"ROM", "Rome, Italy"},
	"CIA": {"ROM", "Rome, Italy"},

	"ARN": {"STO", "Stockholm, Sweden"},
	"NYO": {"STO", "Stockholm, Sweden"},
	"BMA": {"STO", "Stockholm, Sweden"},
	// endregion
	// region NA
	"ORD": {"CHI", "Chicago, USA"},
	"MDW": {"CHI", "Chicago, USA"},

	"DTW": {"DTT", "Detroit, USA"},
	"YIP": {"DTT", "Detroit, USA"},

	"IAH": {"QHO", "Houston, USA"},
	"HOU": {"QHO", "Houston, USA"},

	"LAX": {"QLA", "Los Angeles, USA"},
	"ONT": {"QLA", "Los Angeles, USA"},
	"SNA": {"QLA", "Los Angeles, USA"},
	"BUR": {"QLA", "Los Angeles, USA"},

	"MIA": {"QMI", "Miami, USA"},
	"FLL": {"QMI", "Miami, USA"},
	"PBI": {"QMI", "Miami, USA"},

	"YUL": {"YMQ", "Montreal, Canada"},
	"YMY": {"YMQ", "Montreal, Canada"},

	"JFK": {"NYC", "New York City, USA"},
	"EWR": {"NYC", "New York City, USA"},
	"LGA": {"NYC", "New York City, USA"},
	"HPN": {"NYC", "New York City, USA"},

	"SFO": {"QSF", "San Francisco Bay Area, USA"},
	"OAK": {"QSF", "San Francisco Bay Area, USA"},
	"SJC": {"QSF", "San Francisco Bay Area, USA"},

	"YYZ": {"YTO", "Toronto, Canada"},
	"YTZ": {"YTO", "Toronto, Canada"},

	"IAD": {"WAS", "Washington DC, USA"},
	"DCA": {"WAS", "Washington DC, USA"},
	"BWI": {"WAS", "Washington DC, USA"},
	// endregion
	// region SA
	"EZE": {"BUE", "Buenos Aires, Argentina"},
	"AEP": {"BUE", "Buenos Aires, Argentina"},

	"GIG": {"RIO", "Rio de Janeiro, Brazil"},
	"SDU": {"RIO", "Rio de Janeiro, Brazil"},

	"GRU": {"SAO", "São Paulo, Brazil"},
	"CGH": {"SAO", "São Paulo, Brazil"},
	"VCP": {"SAO", "São Paulo, Brazil"},
	// endregion
}

type AirportsResponse struct {
	Airports          []Airport          `json:"airports"`
	MetropolitanAreas []MetropolitanArea `json:"metropolitanAreas"`
}

type MetropolitanArea struct {
	Code     string    `json:"code"`
	Name     string    `json:"name"`
	Airports []Airport `json:"airports"`
}

type Airport struct {
	Code string  `json:"code"`
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lng  float64 `json:"lng"`
}

type Aircraft struct {
	Code           string             `json:"code"`
	EquipCode      string             `json:"equipCode"`
	Name           string             `json:"name"`
	Configurations common.Set[string] `json:"configurations"`
}

type MinimalS3Client interface {
	adapt.S3Getter
	adapt.S3Lister
	adapt.S3Putter
}

type Handler struct {
	s3c    MinimalS3Client
	lhc    *lufthansa.Client
	bucket string
}

func NewHandler(s3c MinimalS3Client, lhc *lufthansa.Client, bucket string) *Handler {
	return &Handler{
		s3c:    s3c,
		lhc:    lhc,
		bucket: bucket,
	}
}

func (h *Handler) Airports(ctx context.Context) (AirportsResponse, error) {
	relevantAirportCodes := make(map[string]struct{})
	{
		var airports []string
		if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/airports.json", &airports); err != nil {
			return AirportsResponse{}, err
		}

		for _, airport := range airports {
			relevantAirportCodes[airport] = struct{}{}
		}
	}

	metroAreas := make(map[string]MetropolitanArea)
	resp := AirportsResponse{
		Airports:          make([]Airport, 0),
		MetropolitanAreas: make([]MetropolitanArea, 0),
	}

	addAirport := func(airport Airport) {
		if metroAreaValues, ok := metroAreaMapping[airport.Code]; ok {
			metroArea := metroAreas[metroAreaValues[0]]
			metroArea.Code = metroAreaValues[0]
			metroArea.Name = metroAreaValues[1]
			metroArea.Airports = append(metroArea.Airports, airport)

			metroAreas[metroArea.Code] = metroArea
		} else {
			resp.Airports = append(resp.Airports, airport)
		}
	}

	var err error
	for row := range h.readCSV(ctx, "airports", &err) {
		code := strings.TrimSpace(row["iata_code"])
		if _, ok := relevantAirportCodes[code]; !ok {
			continue
		}

		delete(relevantAirportCodes, code)

		var airport Airport
		airport.Code = code
		airport.Name = cmp.Or(strings.TrimSpace(row["name"]), airport.Code)
		airport.Lat, err = strconv.ParseFloat(row["latitude_deg"], 64)
		if err != nil {
			return AirportsResponse{}, fmt.Errorf("failed to parse latitude for %q: %w", airport.Name, err)
		}

		airport.Lng, err = strconv.ParseFloat(row["longitude_deg"], 64)
		if err != nil {
			return AirportsResponse{}, fmt.Errorf("failed to parse longitude for %q: %w", airport.Name, err)
		}

		addAirport(airport)
	}

	if err != nil {
		return AirportsResponse{}, err
	}

	if len(relevantAirportCodes) > 0 {
		var airports []lufthansa.Airport
		if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "raw/LH_Public_Data/airports.json", &airports); err != nil {
			return AirportsResponse{}, err
		}

		for code := range relevantAirportCodes {
			idx := slices.IndexFunc(airports, func(airport lufthansa.Airport) bool {
				return airport.Code == code
			})

			if idx == -1 {
				slog.WarnContext(ctx, "no data found for airport", slog.String("code", code))

				addAirport(Airport{
					Code: code,
					Name: code,
					Lat:  0.0,
					Lng:  0.0,
				})
			} else {
				slog.WarnContext(ctx, "only secondary data found for airport", slog.String("code", code))

				airport := airports[idx]
				addAirport(Airport{
					Code: code,
					Name: findName(airport.Names, "EN"),
					Lat:  airport.Position.Coordinate.Latitude,
					Lng:  airport.Position.Coordinate.Longitude,
				})
			}
		}
	}

	for _, v := range metroAreas {
		resp.MetropolitanAreas = append(resp.MetropolitanAreas, v)
	}

	return resp, nil
}

func (h *Handler) Aircraft(ctx context.Context) ([]Aircraft, error) {
	var relevantAircraft map[string]common.Set[string]
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/aircraft.json", &relevantAircraft); err != nil {
		return nil, err
	}

	var aircraft []lufthansa.Aircraft
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "raw/LH_Public_Data/aircraft.json", &aircraft); err != nil {
		return nil, err
	}

	result := make([]Aircraft, 0, len(aircraft))
	for _, a := range aircraft {
		configurations, ok := relevantAircraft[a.AircraftCode]
		if !ok {
			continue
		}

		delete(relevantAircraft, a.AircraftCode)

		result = append(result, Aircraft{
			Code:           a.AircraftCode,
			EquipCode:      a.AirlineEquipCode,
			Name:           findName(a.Names, "EN"),
			Configurations: configurations,
		})
	}

	for code, configurations := range relevantAircraft {
		slog.WarnContext(ctx, "no data found for aircraft", slog.String("code", code))

		result = append(result, Aircraft{
			Code:           code,
			EquipCode:      "",
			Name:           code,
			Configurations: configurations,
		})
	}

	return result, nil
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

func (h *Handler) Flight(ctx context.Context, fn common.FlightNumber, departureDateUTC xtime.LocalDate, departureAirport string, allowCodeShare bool) (*common.Flight, time.Time, error) {
	var flights []*common.Flight
	lastModified, err := adapt.S3GetJsonWithLastModified(ctx, h.s3c, h.bucket, "processed/flights/"+departureDateUTC.Time(nil).Format("2006/01/02")+".json", &flights)
	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, lastModified, nil
		} else {
			return nil, lastModified, err
		}
	}

	for _, f := range flights {
		if f.DepartureAirport == departureAirport {
			if f.Number() == fn {
				return f, lastModified, nil
			} else if _, ok := f.CodeShares[fn]; allowCodeShare && ok {
				return f, lastModified, nil
			}
		}
	}

	return nil, lastModified, nil
}

func (h *Handler) FlightNumbers(ctx context.Context, prefix string, limit int) ([]common.FlightNumber, error) {
	var fns []common.FlightNumber
	{
		fnsRaw, err := h.FlightNumbersRaw(ctx)
		if err != nil {
			return nil, err
		}

		if prefix != "" {
			maps.DeleteFunc(fnsRaw, func(fn common.FlightNumber, _ time.Time) bool {
				return !strings.HasPrefix(fn.String(), prefix)
			})
		}

		fns = slices.SortedFunc(maps.Keys(fnsRaw), func(a, b common.FlightNumber) int {
			return cmp.Or(
				cmp.Compare(a.Airline, b.Airline),
				cmp.Compare(a.Number, b.Number),
				cmp.Compare(a.Suffix, b.Suffix),
			)
		})
	}

	if limit < 1 {
		limit = len(fns)
	}

	return fns[:min(limit, len(fns))], nil
}

func (h *Handler) FlightNumbersRaw(ctx context.Context) (map[common.FlightNumber]time.Time, error) {
	var fns map[common.FlightNumber]time.Time
	return fns, adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/flightNumbers.json", &fns)
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

func (h *Handler) readCSV(ctx context.Context, name string, outErr *error) iter.Seq[map[string]string] {
	return func(yield func(map[string]string) bool) {
		resp, err := h.s3c.GetObject(ctx, &s3.GetObjectInput{
			Bucket: aws.String(h.bucket),
			Key:    aws.String("raw/ourairports_data/" + name + ".csv"),
		})

		if err != nil {
			*outErr = err
			return
		}

		defer resp.Body.Close()

		r := csv.NewReader(resp.Body)

		row, err := r.Read()
		if err != nil {
			*outErr = err
			return
		}

		headers := make(map[string]int)
		for i, v := range row {
			headers[v] = i
		}

		for {
			row, err = r.Read()
			if err != nil {
				if errors.Is(err, io.EOF) {
					return
				}

				*outErr = err
				return
			}

			values := make(map[string]string)
			for name, i := range headers {
				values[name] = row[i]
			}

			if !yield(values) {
				return
			}
		}
	}
}

func findName(names lufthansa.Names, lang string) string {
	if len(names.Name) < 1 {
		return ""
	}

	r := names.Name[0].Name
	for _, n := range names.Name {
		if n.LanguageCode == lang {
			return n.Name
		} else if n.LanguageCode == "EN" {
			r = n.Name
		}
	}

	return r
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
