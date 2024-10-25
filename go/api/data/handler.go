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
	"io"
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

type MinimalS3Client interface {
	adapt.S3Getter
	adapt.S3Lister
}

type Handler struct {
	s3c    MinimalS3Client
	bucket string
}

func NewHandler(s3c MinimalS3Client, bucket string) *Handler {
	return &Handler{
		s3c:    s3c,
		bucket: bucket,
	}
}

func (h *Handler) Airports(ctx context.Context) (AirportsResponse, error) {
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

	for {
		row, err := r.Read()
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}

			return AirportsResponse{}, err
		}

		if !strings.HasSuffix(strings.TrimSpace(row["type"]), "_airport") {
			continue
		} else if strings.TrimSpace(row["scheduled_service"]) != "yes" {
			continue
		}

		var airport Airport
		airport.Code = strings.TrimSpace(row["iata_code"])
		airport.Name = cmp.Or(strings.TrimSpace(row["name"]), airport.Code)
		airport.Lat, err = strconv.ParseFloat(row["latitude_deg"], 64)
		if err != nil {
			return AirportsResponse{}, fmt.Errorf("failed to parse latitude for %q: %w", airport.Name, err)
		}

		airport.Lng, err = strconv.ParseFloat(row["longitude_deg"], 64)
		if err != nil {
			return AirportsResponse{}, fmt.Errorf("failed to parse longitude for %q: %w", airport.Name, err)
		}

		if airport.Code == "" {
			continue
		}

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

	for _, v := range metroAreas {
		resp.MetropolitanAreas = append(resp.MetropolitanAreas, v)
	}

	return resp, nil
}

func (h *Handler) Aircraft(ctx context.Context) ([]Aircraft, error) {
	excludeNames := []string{
		"freighter",
		"gulfstream",
		"cessna",
		"hawker",
		"fokker",
	}

	var aircraft []lufthansa.Aircraft
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "raw/LH_Public_Data/aircraft.json", &aircraft); err != nil {
		return nil, err
	}

	result := make([]Aircraft, 0, len(aircraft))
	for _, a := range aircraft {
		if a.AirlineEquipCode == "" || a.AirlineEquipCode == "*" || len(a.Names.Name) < 1 {
			continue
		}

		name := findName(a.Names, "EN")
		lName := strings.ToLower(name)
		if slices.ContainsFunc(excludeNames, func(s string) bool { return strings.Contains(lName, s) }) {
			continue
		}

		result = append(result, Aircraft{
			Code:      a.AircraftCode,
			EquipCode: a.AirlineEquipCode,
			Name:      name,
		})
	}

	return result, nil
}

func (h *Handler) FlightSchedule(ctx context.Context, fn common.FlightNumber) (*common.FlightSchedule, error) {
	resp, err := h.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.bucket),
		Key:    aws.String(fmt.Sprintf("processed/schedules/%s.json.gz", fn.Airline)),
	})

	if err != nil {
		if adapt.IsS3NotFound(err) {
			return nil, nil
		} else {
			return nil, err
		}
	}

	defer resp.Body.Close()

	r, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, err
	}

	decoder := jstream.NewDecoder(r, 1).EmitKV()
	for mv := range decoder.Stream() {
		if kv := mv.Value.(jstream.KV); kv.Key == fn.String() {
			b, err := json.Marshal(kv.Value)
			if err != nil {
				return nil, err
			}

			var fs *common.FlightSchedule
			if err = json.Unmarshal(b, &fs); err != nil {
				return nil, err
			}

			return fs, nil
		}
	}

	if err = decoder.Err(); err != nil {
		return nil, err
	}

	return nil, nil
}

func (h *Handler) FlightNumbers(ctx context.Context, prefix string, limit int) ([]common.FlightNumber, error) {
	var fns []common.FlightNumber
	if err := adapt.S3GetJson(ctx, h.s3c, h.bucket, "processed/metadata/flightNumbers.json", &fns); err != nil {
		return nil, err
	}

	slices.SortFunc(fns, func(a, b common.FlightNumber) int {
		return cmp.Or(
			cmp.Compare(a.Airline, b.Airline),
			cmp.Compare(a.Number, b.Number),
			cmp.Compare(a.Suffix, b.Suffix),
		)
	})

	firstIdx := slices.IndexFunc(fns, func(fn common.FlightNumber) bool {
		return strings.HasPrefix(fn.String(), prefix)
	})

	if firstIdx == -1 {
		return make([]common.FlightNumber, 0), nil
	}

	if limit < 1 {
		limit = len(fns)
	}

	return fns[firstIdx:min(firstIdx+limit, len(fns))], nil
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
