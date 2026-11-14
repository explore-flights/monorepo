package web

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"iter"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path"
	"testing"
	"time"

	"github.com/explore-flights/monorepo/go/api/business/connections"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/pb"
	pbv2 "github.com/explore-flights/monorepo/go/api/pb/v2"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/labstack/echo/v5"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

var connectionTestStart = time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)

type connectionsRepoStub struct{}

func (*connectionsRepoStub) Airlines(context.Context) (map[string]db.Airline, error) {
	return map[string]db.Airline{"LH": {IataCode: "LH"}}, nil
}
func (*connectionsRepoStub) Airports(context.Context) (map[string]db.Airport, error) {
	return map[string]db.Airport{"A": {IataCode: "A", CountryCode: "DE"}, "B": {IataCode: "B", CountryCode: "DE"}, "C": {IataCode: "C", CountryCode: "US"}}, nil
}
func (*connectionsRepoStub) Aircraft(context.Context) (map[string]db.Aircraft, error) {
	return map[string]db.Aircraft{"359": {IataCode: "359"}}, nil
}
func (*connectionsRepoStub) IterFlights(_ context.Context, date xtime.LocalDate, _ *error) iter.Seq[db.Flight] {
	return func(yield func(db.Flight) bool) {
		if date != xtime.NewLocalDate(connectionTestStart) {
			return
		}
		for _, v := range []struct {
			number   int
			from, to string
			hour     int
		}{{1, "A", "B", 8}, {2, "B", "C", 10}, {3, "A", "B", 12}} {
			dep := connectionTestStart.Add(time.Duration(v.hour) * time.Hour)
			if !yield(db.Flight{FlightNumber: db.FlightNumber{AirlineIataCode: "LH", Number: v.number}, DepartureAirportIataCode: v.from, ArrivalAirportIataCode: v.to, DepartureTime: dep, ArrivalTime: dep.Add(time.Hour), ServiceType: "J", AircraftIataCode: "359"}) {
				return
			}
		}
	}
}
func connectionsHandlerTest() *ConnectionsHandler {
	repo := &connectionsRepoStub{}
	return NewConnectionsHandler(repo, connections.NewSearch(repo))
}
func oldProtobufRequest() *pb.ConnectionsSearchRequest {
	return &pb.ConnectionsSearchRequest{Origins: []string{"A"}, Destinations: []string{"C"}, MinDeparture: timestamppb.New(connectionTestStart), MaxDeparture: timestamppb.New(connectionTestStart.Add(12 * time.Hour)), MaxFlights: 2, MinLayover: durationpb.New(45 * time.Minute), MaxLayover: durationpb.New(6 * time.Hour), MaxDuration: durationpb.New(12 * time.Hour)}
}
func TestLegacyProtobufDecodingDefaultsAndVersionDispatch(t *testing.T) {
	old := oldProtobufRequest()
	data, err := proto.Marshal(old)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeConnectionsProtobuf(data)
	if err != nil || !decoded.CountMultiLeg || decoded.APIVersion != nil {
		t.Fatalf("%+v %v", decoded, err)
	}
	old.CountMultiLeg = proto.Bool(false)
	data, _ = proto.Marshal(old)
	decoded, err = decodeConnectionsProtobuf(data)
	if err != nil || decoded.CountMultiLeg {
		t.Fatalf("explicit false lost: %+v %v", decoded, err)
	}
	for _, version := range []uint32{0, 3} {
		old.ApiVersion = &version
		data, _ = proto.Marshal(old)
		if _, err = decodeConnectionsProtobuf(data); err == nil {
			t.Fatalf("accepted version %d", version)
		}
	}
	old.ApiVersion = nil
	data, _ = proto.Marshal(old)
	duplicate := protowire.AppendTag(data, 100, protowire.VarintType)
	duplicate = protowire.AppendVarint(duplicate, 1)
	duplicate = protowire.AppendTag(duplicate, 100, protowire.VarintType)
	duplicate = protowire.AppendVarint(duplicate, 2)
	if _, err = decodeConnectionsProtobuf(duplicate); err == nil {
		t.Fatal("accepted duplicate version")
	}
	old.MinLayover = durationpb.New(-time.Second)
	old.ApiVersion = nil
	data, _ = proto.Marshal(old)
	if _, err = decodeConnectionsProtobuf(data); err == nil {
		t.Fatal("accepted negative duration")
	}
}
func TestVersionedJSONRejectsAmbiguousContracts(t *testing.T) {
	for _, body := range []string{
		`{"apiVersion":0}`, `{"apiVersion":3}`, `{"apiVersion":2}`, `{"v2":{}}`,
		`{"apiVersion":2,"v2":{},"origins":[]}`, `{"apiVersion":2,"apiVersion":1,"v2":{}}`,
		`{"apiVersion":null}`, `{"apiVersion":2,"v2":null}`, `{"apiVersion":2,"v2":{"query":{"origins":{"sources":[{"country":{"countryCode":"DE"},"airports":{"iataCodes":["A"]}}]}}}}`,
	} {
		if _, err := decodeConnectionsJSON([]byte(body)); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
	if req, err := decodeConnectionsJSON([]byte(`{"origins":["A"]}`)); err != nil || req.CountMultiLeg {
		t.Fatalf("JSON legacy bool default: %+v %v", req, err)
	}
}
func v2ProtobufRequest(size uint32) *pb.ConnectionsSearchRequest {
	return &pb.ConnectionsSearchRequest{ApiVersion: proto.Uint32(2), V2: &pbv2.ConnectionsSearchRequest{
		Query: &pbv2.ConnectionQuery{
			MinDeparture: timestamppb.New(connectionTestStart),
			MaxDeparture: timestamppb.New(connectionTestStart.Add(24 * time.Hour)),
			Expressions: &pbv2.Expressions{
				DepartureAirportFilter: "airport.IataCode == 'A'",

				ConnectionEvaluation: "connection.size() < 2 ? yield() + proceed(LayoverWindow{Max: duration('6h')}) : yield()",
			},
		},
		Page: &pbv2.PageRequest{Size: size},
	}}
}

func connectionHTTPRequest(t *testing.T, handler *ConnectionsHandler, value *pb.ConnectionsSearchRequest, token string, useJSON bool) (model.ConnectionsSearchResponse, error) {
	t.Helper()
	data, err := proto.Marshal(value)
	contentType := "application/x-protobuf"
	if useJSON {
		decoded, decodeErr := decodeConnectionsProtobuf(data)
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		data, err = json.Marshal(decoded)
		contentType = echo.MIMEApplicationJSON
	}
	if err != nil {
		t.Fatal(err)
	}
	url := "/api/connections/json"
	if token != "" {
		url += "?continuation=" + token
	}
	req := httptest.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	req.Header.Set(echo.HeaderContentType, contentType)
	rec := httptest.NewRecorder()
	if err := handler.ConnectionsJSON(echo.New().NewContext(req, rec)); err != nil {
		return model.ConnectionsSearchResponse{}, err
	}
	var response model.ConnectionsSearchResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("%s: %v", rec.Body, err)
	}
	return response, nil
}

type connectionsDeadlineRepo struct {
	connectionsRepoStub
	deadline time.Time
	stop     error
}

func (r *connectionsDeadlineRepo) IterFlights(ctx context.Context, _ xtime.LocalDate, outErr *error) iter.Seq[db.Flight] {
	return func(func(db.Flight) bool) {
		r.deadline, _ = ctx.Deadline()
		*outErr = r.stop
	}
}

func TestConnectionSearchEndpointsSetDeadline(t *testing.T) {
	body, err := proto.Marshal(oldProtobufRequest())
	if err != nil {
		t.Fatal(err)
	}
	for _, export := range []string{"json", "png"} {
		t.Run(export, func(t *testing.T) {
			repo := &connectionsDeadlineRepo{stop: errors.New("stop after observing search deadline")}
			handler := NewConnectionsHandler(repo, connections.NewSearch(repo))
			request := httptest.NewRequest(http.MethodPost, "/api/connections/"+export, bytes.NewReader(body))
			request.Header.Set(echo.HeaderContentType, "application/x-protobuf")
			c := echo.New().NewContext(request, httptest.NewRecorder())
			started := time.Now()
			run := handler.ConnectionsJSON
			if export == "png" {
				run = handler.ConnectionsPNG
			}
			if err := run(c); !errors.Is(err, repo.stop) {
				t.Fatalf("error=%v", err)
			}
			if repo.deadline.Before(started.Add(25*time.Second)) || repo.deadline.After(time.Now().Add(25*time.Second)) {
				t.Fatalf("unexpected search deadline: %v", repo.deadline)
			}
		})
	}
}

func TestConnectionsHTTPPagination(t *testing.T) {
	for _, useJSON := range []bool{false, true} {
		handler := connectionsHandlerTest()
		value := v2ProtobufRequest(1)
		first, err := connectionHTTPRequest(t, handler, value, "", useJSON)
		if err != nil || first.Continuation == nil || len(first.Data.Connections) != 1 || len(first.Data.Connections[0].Outgoing) != 0 {
			t.Fatalf("first=%+v error=%v", first, err)
		}
		second, err := connectionHTTPRequest(t, handler, value, first.Continuation.String(), useJSON)
		if err != nil || second.Continuation == nil || second.Continuation.Consumed != 2 || len(second.Data.Connections) != 1 || len(second.Data.Connections[0].Outgoing) != 1 {
			t.Fatalf("second=%+v error=%v", second, err)
		}
		third, err := connectionHTTPRequest(t, handler, value, second.Continuation.String(), useJSON)
		if err != nil || len(third.Data.Connections) != 1 || third.Continuation == nil {
			t.Fatalf("third=%+v error=%v", third, err)
		}
		last, err := connectionHTTPRequest(t, handler, value, third.Continuation.String(), useJSON)
		if err != nil || len(last.Data.Connections) != 0 || last.Continuation != nil {
			t.Fatalf("last=%+v error=%v", last, err)
		}
	}
}

func TestConnectionsResponsePreservesYieldedPrefix(t *testing.T) {
	response, err := connectionHTTPRequest(t, connectionsHandlerTest(), v2ProtobufRequest(2), "", true)
	if err != nil || len(response.Data.Connections) != 2 || len(response.Data.Flights) != 2 || len(response.Data.Connections[0].Outgoing) != 0 || len(response.Data.Connections[1].Outgoing) != 1 {
		t.Fatalf("response=%+v error=%v", response, err)
	}
}

func TestLegacySharePayloadStillRuns(t *testing.T) {
	// Fixed fields 1–8 from the unversioned schema, independent of regenerated types.
	payload := "CgFBEgFDGgYIgKbZ1wYiBgjA99vXBigCMgMIjBU6BAjgqAFCBAjA0QI"
	handler := connectionsHandlerTest()
	e := echo.New()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/connections/json/"+payload+"?includeSearch=true", nil)
	c := e.NewContext(req, rec)
	c.SetPathValues(echo.PathValues{{Name: "payload", Value: payload}})
	if err := handler.ConnectionsJSON(c); err != nil {
		t.Fatal(err)
	}
	var response model.ConnectionsSearchResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Data.Connections) != 1 || len(response.Data.Connections[0].Outgoing) != 1 || response.Search == nil || !response.Search.CountMultiLeg {
		t.Fatalf("legacy response: %s", rec.Body)
	}
}
func TestV2ProtobufRoundTripAndInvalidExpressionHTTP(t *testing.T) {
	value := v2ProtobufRequest(50)
	data, _ := proto.Marshal(value)
	req, err := decodeConnectionsProtobuf(data)
	if err != nil || !proto.Equal(req.ToPb(), value) {
		t.Fatalf("v2 roundtrip %v", err)
	}
	req.V2.Query.Expressions.ConnectionEvaluation = "0"
	data, _ = proto.Marshal(req.ToPb())
	request := httptest.NewRequest(http.MethodPost, "/api/connections/json", bytes.NewReader(data))
	request.Header.Set(echo.HeaderContentType, "application/x-protobuf")
	rec := httptest.NewRecorder()
	err = connectionsHandlerTest().ConnectionsJSON(echo.New().NewContext(request, rec))
	var httpError *HTTPError
	if !errors.As(err, &httpError) || httpError.code != http.StatusBadRequest {
		t.Fatalf("error=%v", err)
	}
}

type connectionsPagingRepo struct {
	connectionsRepoStub
}

func (*connectionsPagingRepo) IterFlights(ctx context.Context, date xtime.LocalDate, outErr *error) iter.Seq[db.Flight] {
	return func(yield func(db.Flight) bool) {
		if err := ctx.Err(); err != nil {
			*outErr = err
			return
		}
		if date != xtime.NewLocalDate(connectionTestStart) {
			return
		}
		departure := connectionTestStart.Add(8 * time.Hour)
		for number := range 501 {
			if !yield(db.Flight{
				FlightNumber:             db.FlightNumber{AirlineIataCode: "LH", Number: number + 1},
				DepartureAirportIataCode: "A", ArrivalAirportIataCode: "C",
				DepartureTime: departure, ArrivalTime: departure.Add(time.Hour),
				ServiceType: "J", AircraftIataCode: "359",
			}) {
				return
			}
		}
	}
}

func TestConnectionsPageSizesAndLegacyContinuation(t *testing.T) {
	repo := &connectionsPagingRepo{}
	handler := NewConnectionsHandler(repo, connections.NewSearch(repo))
	for _, useJSON := range []bool{false, true} {
		for _, value := range []*pb.ConnectionsSearchRequest{oldProtobufRequest(), v2ProtobufRequest(500), v2ProtobufRequest(0)} {
			first, err := connectionHTTPRequest(t, handler, value, "", useJSON)
			want := 500
			if value.V2 != nil && value.V2.Page.Size == 0 {
				want = 50
			}
			if err != nil || len(first.Data.Connections) != want || first.Continuation == nil || first.Continuation.Consumed != uint32(want) {
				t.Fatalf("page size=%d response count=%d continuation=%+v error=%v", want, len(first.Data.Connections), first.Continuation, err)
			}
			if want == 500 {
				second, err := connectionHTTPRequest(t, handler, value, first.Continuation.String(), useJSON)
				if err != nil || len(second.Data.Connections) != 1 || second.Continuation != nil {
					t.Fatalf("last page count=%d continuation=%v error=%v", len(second.Data.Connections), second.Continuation, err)
				}
			}
		}
		_, err := connectionHTTPRequest(t, handler, v2ProtobufRequest(501), "", useJSON)
		assertConnectionBadRequest(t, err)
	}
}

func assertConnectionBadRequest(t *testing.T, err error) {
	t.Helper()
	var httpError *HTTPError
	if !errors.As(err, &httpError) || httpError.code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %v", err)
	}
}

func TestConnectionsRejectInvalidContinuationAndExpressions(t *testing.T) {
	for _, value := range []*pb.ConnectionsSearchRequest{oldProtobufRequest(), v2ProtobufRequest(1)} {
		for _, token := range []string{"!", "1", (model.ConnectionsContinuation{Departure: connectionTestStart.Add(-time.Hour)}).String()} {
			_, err := connectionHTTPRequest(t, connectionsHandlerTest(), value, token, false)
			assertConnectionBadRequest(t, err)
		}
	}
	for _, expressions := range []*pbv2.Expressions{
		{DepartureAirportFilter: "airport.Unknown", ConnectionEvaluation: "yield()"},
		{DepartureAirportFilter: "true", ConnectionEvaluation: "true"},
		{DepartureAirportFilter: "true", ConnectionEvaluation: "connection.Unknown"},
		{DepartureAirportFilter: "true", ConnectionEvaluation: "0"},
		{DepartureAirportFilter: "true", ConnectionEvaluation: "yield() + proceed(LayoverWindow{Min: duration('2h'), Max: duration('1h')})"},
		{DepartureAirportFilter: "true", ConnectionEvaluation: "flight.DataElements[999] == 'missing' ? yield() : abort()"},
	} {
		value := v2ProtobufRequest(1)
		value.V2.Query.Expressions = expressions
		_, err := connectionHTTPRequest(t, connectionsHandlerTest(), value, "", true)
		assertConnectionBadRequest(t, err)
	}
}

func TestV2SharesPreserveRequestAndOmitContinuation(t *testing.T) {
	value := v2ProtobufRequest(10)
	data, err := proto.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/connections/share?continuation=ignored", bytes.NewReader(data))
	req.Header.Set(echo.HeaderContentType, "application/x-protobuf")
	rec := httptest.NewRecorder()
	if err := connectionsHandlerTest().ConnectionsShareCreate(echo.New().NewContext(req, rec)); err != nil {
		t.Fatal(err)
	}
	var response map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	url, err := url.Parse(response["htmlUrl"])
	if err != nil {
		t.Fatal(err)
	}
	payload := path.Base(url.Path)
	binary, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeConnectionsProtobuf(binary)
	if err != nil || !proto.Equal(decoded.ToPb(), value) {
		t.Fatalf("share roundtrip: %+v error=%v", decoded, err)
	}
}

func TestConnectionsRejectInvalidRootDepartureWindow(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*pbv2.ConnectionQuery)
	}{
		{"missing minimum", func(q *pbv2.ConnectionQuery) { q.MinDeparture = nil }},
		{"missing maximum", func(q *pbv2.ConnectionQuery) { q.MaxDeparture = nil }},
		{"invalid minimum", func(q *pbv2.ConnectionQuery) { q.MinDeparture = &timestamppb.Timestamp{Seconds: 253402300800} }},
		{"invalid maximum", func(q *pbv2.ConnectionQuery) { q.MaxDeparture = &timestamppb.Timestamp{Seconds: 253402300800} }},
		{"inverted window", func(q *pbv2.ConnectionQuery) { q.MaxDeparture = timestamppb.New(connectionTestStart.Add(-time.Hour)) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := v2ProtobufRequest(1)
			test.change(request.V2.Query)
			_, err := connectionHTTPRequest(t, connectionsHandlerTest(), request, "", false)
			assertConnectionBadRequest(t, err)
		})
	}
}

func TestConnectionContinuationRootBounds(t *testing.T) {
	minimum := connectionTestStart
	maximum := minimum.Add(time.Hour)
	for _, test := range []struct {
		name      string
		departure time.Time
		valid     bool
	}{
		{"before minimum", minimum.Add(-time.Millisecond), false},
		{"at minimum", minimum, true},
		{"at maximum", maximum, true},
		{"after maximum", maximum.Add(time.Millisecond), false},
	} {
		t.Run(test.name, func(t *testing.T) {
			token := (model.ConnectionsContinuation{Departure: test.departure, Consumed: 3}).String()
			after, err := connectionContinuation(token, minimum, maximum)
			if !test.valid {
				if err == nil {
					t.Fatal("accepted continuation outside root departure window")
				}
				return
			}
			if err != nil || after == nil || !after.Departure.Equal(test.departure) || after.Consumed != 3 {
				t.Fatalf("continuation=%+v error=%v", after, err)
			}
		})
	}
	// Both wire contracts must reject an out-of-range token with HTTP 400.
	for _, request := range []*pb.ConnectionsSearchRequest{oldProtobufRequest(), v2ProtobufRequest(1)} {
		token := (model.ConnectionsContinuation{Departure: minimum.Add(48 * time.Hour), Consumed: 1}).String()
		_, err := connectionHTTPRequest(t, connectionsHandlerTest(), request, token, false)
		assertConnectionBadRequest(t, err)
	}
}

func TestConnectionsRootMaximumIsInclusive(t *testing.T) {
	for _, useJSON := range []bool{false, true} {
		for _, request := range []*pb.ConnectionsSearchRequest{oldProtobufRequest(), v2ProtobufRequest(10)} {
			maximum := connectionTestStart.Add(8 * time.Hour)
			if request.V2 == nil {
				request.MaxDeparture = timestamppb.New(maximum)
			} else {
				request.V2.Query.MaxDeparture = timestamppb.New(maximum)
				request.V2.Query.Expressions.ConnectionEvaluation = "flight.ArrivalAirport.IataCode == 'C' ? yield() : proceed(LayoverWindow{Max: duration('6h')})"
			}
			response, err := connectionHTTPRequest(t, connectionsHandlerTest(), request, "", useJSON)
			if err != nil || response.Continuation != nil || len(response.Data.Connections) != 1 || len(response.Data.Connections[0].Outgoing) != 1 || len(response.Data.Flights) != 2 {
				t.Fatalf("connections=%v continuation=%v error=%v", response.Data.Connections, response.Continuation, err)
			}
		}
	}
}
