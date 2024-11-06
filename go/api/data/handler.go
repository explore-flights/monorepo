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
	"github.com/bcicen/jstream"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"io"
	"iter"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
)

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
	Code      string `json:"code"`
	EquipCode string `json:"equipCode"`
	Name      string `json:"name"`
}

type RouteAndRange struct {
	DepartureAirport string               `json:"departureAirport"`
	ArrivalAirport   string               `json:"arrivalAirport"`
	Range            xtime.LocalDateRange `json:"range"`
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

	r, err := h.loadCsv(ctx, "airports")
	if err != nil {
		return AirportsResponse{}, err
	}

	defer r.Close()

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

	for {
		row, err := r.Read()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}

			return AirportsResponse{}, err
		}

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
	relevantAircraftCodes := make(map[string]struct{})
	{
		var aircraft []string
		if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/aircraft.json", &aircraft); err != nil {
			return nil, err
		}

		for _, code := range aircraft {
			relevantAircraftCodes[code] = struct{}{}
		}
	}

	var aircraft []lufthansa.Aircraft
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "raw/LH_Public_Data/aircraft.json", &aircraft); err != nil {
		return nil, err
	}

	result := make([]Aircraft, 0, len(aircraft))
	for _, a := range aircraft {
		if _, ok := relevantAircraftCodes[a.AircraftCode]; !ok {
			continue
		}

		delete(relevantAircraftCodes, a.AircraftCode)

		result = append(result, Aircraft{
			Code:      a.AircraftCode,
			EquipCode: a.AirlineEquipCode,
			Name:      findName(a.Names, "EN"),
		})
	}

	for code := range relevantAircraftCodes {
		slog.WarnContext(ctx, "no data found for aircraft", slog.String("code", code))

		result = append(result, Aircraft{
			Code:      code,
			EquipCode: "",
			Name:      code,
		})
	}

	return result, nil
}

func (h *Handler) FlightSchedule(ctx context.Context, fn common.FlightNumber) (*common.FlightSchedule, error) {
	var fs *common.FlightSchedule
	return fs, h.flightSchedules(ctx, fn.Airline, func(seq iter.Seq[jstream.KV]) error {
		for kv := range seq {
			if kv.Key == fn.String() {
				b, err := json.Marshal(kv.Value)
				if err != nil {
					return err
				}

				if err = json.Unmarshal(b, &fs); err != nil {
					return err
				}

				return nil
			}
		}

		return nil
	})
}

func (h *Handler) Flight(ctx context.Context, fn common.FlightNumber, departureDateUTC xtime.LocalDate, departureAirport string, allowCodeShare bool) (*common.Flight, error) {
	var flights []*common.Flight
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/flights/"+departureDateUTC.Time(nil).Format("2006/01/02")+".json", &flights); err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, nil
		} else {
			return nil, err
		}
	}

	for _, f := range flights {
		if f.DepartureAirport == departureAirport {
			if f.Number() == fn {
				return f, nil
			} else if _, ok := f.CodeShares[fn]; allowCodeShare && ok {
				return f, nil
			}
		}
	}

	return nil, nil
}

func (h *Handler) FlightNumbers(ctx context.Context, prefix string, limit int) ([]common.FlightNumber, error) {
	var fns []common.FlightNumber
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/flightNumbers.json", &fns); err != nil {
		return nil, err
	}

	if prefix != "" {
		fns = slices.DeleteFunc(fns, func(fn common.FlightNumber) bool {
			return !strings.HasPrefix(fn.String(), prefix)
		})
	}

	slices.SortFunc(fns, func(a, b common.FlightNumber) int {
		return cmp.Or(
			cmp.Compare(a.Airline, b.Airline),
			cmp.Compare(a.Number, b.Number),
			cmp.Compare(a.Suffix, b.Suffix),
		)
	})

	if limit < 1 {
		limit = len(fns)
	}

	return fns[:min(limit, len(fns))], nil
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

func (h *Handler) SeatMap(ctx context.Context, fn common.FlightNumber, departureAirport, arrivalAirport string, departureDate xtime.LocalDate, cabinClass lufthansa.RequestCabinClass, aircraftType, aircraftConfigurationVersion string) (*lufthansa.SeatAvailability, error) {
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

func (h *Handler) QuerySchedules(ctx context.Context, airline common.AirlineIdentifier, aircraftType, aircraftConfigurationVersion string) (map[common.FlightNumber][]RouteAndRange, error) {
	result := make(map[common.FlightNumber][]RouteAndRange)
	return result, h.flightSchedules(ctx, airline, func(seq iter.Seq[jstream.KV]) error {
		for kv := range seq {
			b, err := json.Marshal(kv.Value)
			if err != nil {
				return err
			}

			var fs *common.FlightSchedule
			if err = json.Unmarshal(b, &fs); err != nil {
				return err
			}

			for _, variant := range fs.Variants {
				fn := fs.Number()

				if variant.Data.ServiceType == "J" && variant.Data.AircraftType == aircraftType && variant.Data.AircraftConfigurationVersion == aircraftConfigurationVersion && variant.Data.OperatedAs == fn {
					if span, ok := variant.Ranges.Span(); ok {
						idx := slices.IndexFunc(result[fn], func(rr RouteAndRange) bool {
							return rr.DepartureAirport == variant.Data.DepartureAirport && rr.ArrivalAirport == variant.Data.ArrivalAirport
						})

						if idx == -1 {
							result[fn] = append(result[fn], RouteAndRange{
								DepartureAirport: variant.Data.DepartureAirport,
								ArrivalAirport:   variant.Data.ArrivalAirport,
								Range:            span,
							})
						} else {
							if result[fn][idx].Range[0].Compare(span[0]) > 0 {
								result[fn][idx].Range[0] = span[0]
							}

							if result[fn][idx].Range[1].Compare(span[1]) < 0 {
								result[fn][idx].Range[1] = span[1]
							}
						}
					}
				}
			}
		}

		return nil
	})
}

func (h *Handler) flightSchedules(ctx context.Context, airline common.AirlineIdentifier, fn func(seq iter.Seq[jstream.KV]) error) error {
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

	decoder := jstream.NewDecoder(r, 1).EmitKV()
	err = fn(func(yield func(jstream.KV) bool) {
		for mv := range decoder.Stream() {
			if !yield(mv.Value.(jstream.KV)) {
				return
			}
		}
	})

	if err != nil {
		return err
	}

	if err = decoder.Err(); err != nil {
		return err
	}

	return nil
}

func (h *Handler) loadCsv(ctx context.Context, name string) (*csvReader, error) {
	resp, err := h.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.bucket),
		Key:    aws.String("raw/ourairports_data/" + name + ".csv"),
	})

	if err != nil {
		return nil, err
	}

	return &csvReader{
		r: csv.NewReader(resp.Body),
		c: resp.Body,
	}, nil
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

type csvReader struct {
	r      *csv.Reader
	c      io.Closer
	header []string
}

func (r *csvReader) Read() (map[string]string, error) {
	row, err := r.r.Read()
	if err != nil {
		return nil, err
	}

	if r.header == nil {
		r.header = make([]string, 0)
		for _, v := range row {
			r.header = append(r.header, v)
		}

		row, err = r.r.Read()
		if err != nil {
			return nil, err
		}
	}

	result := make(map[string]string, len(r.header))
	for i, v := range row {
		result[r.header[i]] = v
	}

	return result, nil
}

func (r *csvReader) Close() error {
	return r.c.Close()
}

func compareBool(a, b bool) int {
	if a == b {
		return 0
	} else if a {
		return 1
	} else {
		return -1
	}
}
