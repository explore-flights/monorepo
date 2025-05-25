package web

import (
	"bytes"
	"cmp"
	"context"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/pb"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"google.golang.org/protobuf/proto"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

//go:embed share.gohtml
var shareTemplateHtml string

type connectionsHandlerFlightRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	Airports(ctx context.Context) (map[uuid.UUID]db.Airport, error)
	Aircraft(ctx context.Context) (map[uuid.UUID]db.Aircraft, error)
}

type ConnectionsHandler struct {
	repo connectionsHandlerFlightRepo
	ch   *search.ConnectionsHandler
}

func NewConnectionsHandler(repo connectionsHandlerFlightRepo, ch *search.ConnectionsHandler) *ConnectionsHandler {
	return &ConnectionsHandler{
		repo: repo,
		ch:   ch,
	}
}

func (ch *ConnectionsHandler) ConnectionsJSON(c echo.Context) error {
	return ch.connections(c, "json")
}

func (ch *ConnectionsHandler) ConnectionsPNG(c echo.Context) error {
	return ch.connections(c, "png")
}

func (ch *ConnectionsHandler) connections(c echo.Context, export string) error {
	ctx := c.Request().Context()
	airports, err := ch.repo.Airports(ctx)
	if err != nil {
		return err
	}

	req, err := ch.parseAndValidateRequest(c, airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	minLayover := time.Duration(req.MinLayoverMS) * time.Millisecond
	maxLayover := time.Duration(req.MaxLayoverMS) * time.Millisecond
	maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

	options := make([]search.ConnectionSearchOption, 0)
	options = append(options, search.WithCountMultiLeg(req.CountMultiLeg))
	options = appendStringOptions[search.WithIncludeAirport, search.WithIncludeAirportGlob](options, req.IncludeAirport)
	options = appendSliceOptions[search.WithExcludeAirport, search.WithExcludeAirportGlob](options, req.ExcludeAirport)
	options = appendRegularStringOptions[search.WithIncludeFlightNumber, search.WithIncludeFlightNumberGlob](options, req.IncludeFlightNumber)
	options = appendRegularSliceOptions[search.WithExcludeFlightNumber, search.WithExcludeFlightNumberGlob](options, req.ExcludeFlightNumber)
	options = appendStringOptions[search.WithIncludeAircraft, search.WithIncludeAircraftGlob](options, req.IncludeAircraft)
	options = appendSliceOptions[search.WithExcludeAircraft, search.WithExcludeAircraftGlob](options, req.ExcludeAircraft)

	conns, err := ch.ch.FindConnections(
		ctx,
		ch.mapAirports(req.Origins),
		ch.mapAirports(req.Destinations),
		req.MinDeparture,
		req.MaxDeparture,
		req.MaxFlights,
		minLayover,
		maxLayover,
		maxDuration,
		options...,
	)

	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return NewHTTPError(http.StatusRequestTimeout, WithCause(err))
		}

		return err
	}

	switch export {
	case "json":
		data, err := ch.exportConnectionsJSON(ctx, conns, airports)
		if err != nil {
			return err
		}

		res := model.ConnectionsSearchResponse{
			Data: data,
		}

		if c.QueryParams().Has("includeSearch") {
			res.Search = &req
		}

		return c.JSON(http.StatusOK, res)

	case "png":
		c.Response().Header().Set(echo.HeaderContentType, "image/png")
		c.Response().WriteHeader(http.StatusOK)
		return ch.exportConnectionsImage(ctx, airports, conns, c.Response())

	default:
		return NewHTTPError(http.StatusBadRequest, WithMessage("invalid export type"))
	}
}

func (ch *ConnectionsHandler) ConnectionsShareCreate(c echo.Context) error {
	ctx := c.Request().Context()
	airports, err := ch.repo.Airports(ctx)
	if err != nil {
		return err
	}

	req, err := ch.parseAndValidateRequest(c, airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	b, err := proto.Marshal(req.ToPb())
	if err != nil {
		return err
	}

	scheme, host := contextSchemeAndHost(c)
	payload := base64.RawURLEncoding.EncodeToString(b)

	return c.JSON(http.StatusOK, map[string]string{
		"htmlUrl":  ch.shareHtmlUrl(scheme, host, payload),
		"imageUrl": ch.shareImageUrl(scheme, host, payload),
	})
}

func (ch *ConnectionsHandler) ConnectionsShareHTML(c echo.Context) error {
	ctx := c.Request().Context()
	airports, err := ch.repo.Airports(ctx)
	if err != nil {
		return err
	}

	req, err := ch.parseAndValidateRequest(c, airports)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	scheme, host := contextSchemeAndHost(c)
	payload := c.Param("payload")

	tmpl, err := template.New("share").Parse(shareTemplateHtml)
	if err != nil {
		return err
	}

	origins := make([]string, 0, len(req.Origins))
	destinations := make([]string, 0, len(req.Destinations))

	for _, o := range req.Origins {
		if airport, ok := airports[uuid.UUID(o)]; ok {
			origins = append(origins, cmp.Or(airport.IataCode.String, airport.IcaoCode.String, airport.Name.String))
		}
	}

	for _, d := range req.Destinations {
		if airport, ok := airports[uuid.UUID(d)]; ok {
			destinations = append(destinations, cmp.Or(airport.IataCode.String, airport.IcaoCode.String, airport.Name.String))
		}
	}

	originsStr := strings.Join(origins, " | ")
	destinationsStr := strings.Join(destinations, " | ")

	data := map[string]string{
		"scheme":     scheme,
		"host":       host,
		"contentUrl": ch.shareContentUrl(scheme, host, payload),
		"imageUrl":   ch.shareImageUrl(scheme, host, payload),
		"title":      fmt.Sprintf("Connections from %v to %v • explore.flights", originsStr, destinationsStr),
		"description": fmt.Sprintf(
			"Explore connections from from %v to %v between %v and %v",
			originsStr,
			destinationsStr,
			req.MinDeparture.Format(time.RFC3339),
			req.MaxDeparture.Format(time.RFC3339),
		),
	}

	var buf bytes.Buffer
	if err = tmpl.Execute(&buf, data); err != nil {
		return err
	}

	return c.HTMLBlob(http.StatusOK, buf.Bytes())
}

func (ch *ConnectionsHandler) shareHtmlUrl(scheme, host, payload string) string {
	return scheme + "://" + host + "/api/connections/share/" + url.PathEscape(payload)
}

func (ch *ConnectionsHandler) shareContentUrl(scheme, host, payload string) string {
	return scheme + "://" + host + "/?search=" + url.QueryEscape(payload)
}

func (ch *ConnectionsHandler) shareImageUrl(scheme, host, payload string) string {
	return scheme + "://" + host + "/api/connections/png/" + url.PathEscape(payload) + "/c.png"
}

func (ch *ConnectionsHandler) parseAndValidateRequest(c echo.Context, airports map[uuid.UUID]db.Airport) (model.ConnectionsSearchRequest, error) {
	req, err := ch.parseRequest(c, airports)
	if err != nil {
		return model.ConnectionsSearchRequest{}, err
	}

	if err = ch.validateRequest(req); err != nil {
		return model.ConnectionsSearchRequest{}, err
	}

	return req, nil
}

func (ch *ConnectionsHandler) parseRequest(c echo.Context, airports map[uuid.UUID]db.Airport) (model.ConnectionsSearchRequest, error) {
	payloadB64 := c.Param("payload")

	var req model.ConnectionsSearchRequest
	if payloadB64 == "" {
		if err := c.Bind(&req); err != nil {
			return model.ConnectionsSearchRequest{}, err
		}
	} else {
		b, err := base64.RawURLEncoding.DecodeString(payloadB64)
		if err != nil {
			return model.ConnectionsSearchRequest{}, err
		}

		var pbReq pb.ConnectionsSearchRequest
		if err = proto.Unmarshal(b, &pbReq); err != nil {
			return model.ConnectionsSearchRequest{}, err
		}

		countMultiLeg := true // multi-leg flights were counted before this option was added
		if pbReq.CountMultiLeg != nil {
			countMultiLeg = *pbReq.CountMultiLeg
		}

		req = model.ConnectionsSearchRequest{
			Origins:             ch.mapAirportsFromPB(airports, pbReq.Origins),
			Destinations:        ch.mapAirportsFromPB(airports, pbReq.Destinations),
			MinDeparture:        pbReq.MinDeparture.AsTime(),
			MaxDeparture:        pbReq.MaxDeparture.AsTime(),
			MaxFlights:          pbReq.MaxFlights,
			MinLayoverMS:        uint64(pbReq.MinLayover.AsDuration().Milliseconds()),
			MaxLayoverMS:        uint64(pbReq.MaxLayover.AsDuration().Milliseconds()),
			MaxDurationMS:       uint64(pbReq.MaxDuration.AsDuration().Milliseconds()),
			CountMultiLeg:       countMultiLeg,
			IncludeAirport:      pbReq.IncludeAirport,
			ExcludeAirport:      pbReq.ExcludeAirport,
			IncludeFlightNumber: pbReq.IncludeFlightNumber,
			ExcludeFlightNumber: pbReq.ExcludeFlightNumber,
			IncludeAircraft:     pbReq.IncludeAircraft,
			ExcludeAircraft:     pbReq.ExcludeAircraft,
		}
	}

	return req, nil
}

func (ch *ConnectionsHandler) exportConnectionsJSON(ctx context.Context, conns []search.Connection, airports map[uuid.UUID]db.Airport) (model.ConnectionsResponse, error) {
	flights := make(map[model.UUID]model.ConnectionFlightResponse)
	referencedAirlines := make(common.Set[uuid.UUID])
	referencedAirports := make(common.Set[uuid.UUID])
	referencedAircraft := make(common.Set[uuid.UUID])
	connections, err := ch.buildConnectionsResponse(conns, flights, make(map[*search.Flight]model.UUID), referencedAirlines, referencedAirports, referencedAircraft)
	if err != nil {
		return model.ConnectionsResponse{}, err
	}

	r := model.ConnectionsResponse{
		Connections: connections,
		Flights:     flights,
		Airlines:    make(map[model.UUID]model.Airline),
		Airports:    make(map[model.UUID]model.Airport),
		Aircraft:    make(map[model.UUID]model.Aircraft),
	}

	airlines, err := ch.repo.Airlines(ctx)
	if err != nil {
		return model.ConnectionsResponse{}, err
	}

	aircraft, err := ch.repo.Aircraft(ctx)
	if err != nil {
		return model.ConnectionsResponse{}, err
	}

	for id := range referencedAirlines {
		r.Airlines[model.UUID(id)] = model.AirlineFromDb(airlines[id])
	}

	for id := range referencedAirports {
		r.Airports[model.UUID(id)] = model.AirportFromDb(airports[id])
	}

	for id := range aircraft {
		r.Aircraft[model.UUID(id)] = model.AircraftFromDb(aircraft[id])
	}

	return r, nil
}

func (ch *ConnectionsHandler) buildConnectionsResponse(conns []search.Connection, flights map[model.UUID]model.ConnectionFlightResponse, uuidByFlight map[*search.Flight]model.UUID, referencedAirlines, referencedAirports, referencedAircraft common.Set[uuid.UUID]) ([]model.ConnectionResponse, error) {
	r := make([]model.ConnectionResponse, 0, len(conns))

	for _, conn := range conns {
		fid, ok := uuidByFlight[conn.Flight]
		if !ok {
			var u uuid.UUID
			for {
				var err error
				if u, err = uuid.NewV4(); err != nil {
					return nil, err
				}

				if _, exists := flights[model.UUID(u)]; !exists {
					break
				}
			}

			fid = model.UUID(u)
			uuidByFlight[conn.Flight] = fid
		}

		if _, ok := flights[fid]; !ok {
			referencedAirlines.Add(conn.Flight.AirlineId)
			referencedAirports.Add(conn.Flight.DepartureAirportId)
			referencedAirports.Add(conn.Flight.ArrivalAirportId)
			referencedAircraft.Add(conn.Flight.AircraftId)

			flights[fid] = model.ConnectionFlightResponse{
				FlightNumber:          model.FlightNumberFromDb(conn.Flight.FlightNumber),
				DepartureTime:         conn.Flight.DepartureTime,
				DepartureAirportId:    model.UUID(conn.Flight.DepartureAirportId),
				ArrivalTime:           conn.Flight.ArrivalTime,
				ArrivalAirportId:      model.UUID(conn.Flight.ArrivalAirportId),
				AircraftOwner:         conn.Flight.AircraftOwner,
				AircraftId:            model.UUID(conn.Flight.AircraftId),
				AircraftConfiguration: conn.Flight.AircraftConfigurationVersion,
				AircraftRegistration:  conn.Flight.AircraftRegistration,
				CodeShares:            ch.convertCodeShares(conn.Flight.CodeShares, referencedAirlines),
			}
		}

		outgoing, err := ch.buildConnectionsResponse(conn.Outgoing, flights, uuidByFlight, referencedAirlines, referencedAirports, referencedAircraft)
		if err != nil {
			return nil, err
		}

		r = append(r, model.ConnectionResponse{
			FlightId: fid,
			Outgoing: outgoing,
		})
	}

	return r, nil
}

func (ch *ConnectionsHandler) convertCodeShares(inp common.Set[db.FlightNumber], referencedAirlines common.Set[uuid.UUID]) []model.FlightNumber {
	r := make([]model.FlightNumber, 0, len(inp))
	for fn := range inp {
		referencedAirlines.Add(fn.AirlineId)
		r = append(r, model.FlightNumberFromDb(fn))
	}

	return r
}

func (ch *ConnectionsHandler) exportConnectionsImage(ctx context.Context, airports map[uuid.UUID]db.Airport, conns []search.Connection, w io.Writer) error {
	airlines, err := ch.repo.Airlines(ctx)
	if err != nil {
		return err
	}

	aircraft, err := ch.repo.Aircraft(ctx)
	if err != nil {
		return err
	}

	g, err := graphviz.New(ctx)
	if err != nil {
		return err
	}

	defer g.Close()

	graph, err := g.Graph()
	if err != nil {
		return err
	}

	var nodeId, edgeId graphviz.ID
	if err = ch.buildGraph(nil, airlines, airports, aircraft, conns, graph, make(map[*search.Flight]*cgraph.Node), &nodeId, &edgeId); err != nil {
		return err
	}

	return g.Render(ctx, graph, graphviz.PNG, w)
}

func (ch *ConnectionsHandler) buildGraph(parent *search.Flight, airlines map[uuid.UUID]db.Airline, airports map[uuid.UUID]db.Airport, aircraft map[uuid.UUID]db.Aircraft, conns []search.Connection, graph *cgraph.Graph, lookup map[*search.Flight]*cgraph.Node, nodeId *graphviz.ID, edgeId *graphviz.ID) error {
	var err error
	for _, conn := range conns {
		airline, ok := airlines[conn.Flight.AirlineId]
		if !ok {
			return fmt.Errorf("could not find airline for id %s", conn.Flight.AirlineId)
		}

		departureAirport, ok := airports[conn.Flight.DepartureAirportId]
		if !ok {
			return fmt.Errorf("could not find departure airport for id %s", conn.Flight.DepartureAirportId)
		}

		arrivalAirport, ok := airports[conn.Flight.ArrivalAirportId]
		if !ok {
			return fmt.Errorf("could not find arrival airport for id %s", conn.Flight.ArrivalAirportId)
		}

		ac, ok := aircraft[conn.Flight.AircraftId]
		if !ok {
			return fmt.Errorf("could not find aircraft for id %s", conn.Flight.AircraftId)
		}

		var node *cgraph.Node
		if node, ok = lookup[conn.Flight]; !ok {
			*nodeId++
			node, err = graph.CreateNodeByName(strconv.FormatUint(uint64(*nodeId), 16))
			if err != nil {
				return err
			}

			node.SetLabel(ch.buildNodeLabel(conn.Flight, airline, departureAirport, arrivalAirport, ac))
			lookup[conn.Flight] = node
		}

		if parentNode, ok := lookup[parent]; ok {
			*edgeId++

			var edge *cgraph.Edge
			edge, err = graph.CreateEdgeByName(strconv.FormatUint(uint64(*edgeId), 16), parentNode, node)
			if err != nil {
				return err
			}

			edge.SetLabel(conn.Flight.DepartureTime.Sub(parent.ArrivalTime).String())
		}

		if err = ch.buildGraph(conn.Flight, airlines, airports, aircraft, conn.Outgoing, graph, lookup, nodeId, edgeId); err != nil {
			return err
		}
	}

	return nil
}

func (ch *ConnectionsHandler) buildNodeLabel(f *search.Flight, airline db.Airline, departureAirport, arrivalAirport db.Airport, aircraft db.Aircraft) string {
	var fnStr string
	{
		var fnPrefix string
		if airline.IataCode.Valid {
			fnPrefix = airline.IataCode.String
		} else if airline.IcaoCode.Valid {
			fnPrefix = airline.IcaoCode.String
		} else {
			fnPrefix = model.UUID(airline.Id).String() + "-"
		}

		fnStr = fmt.Sprintf("%s%d%s", fnPrefix, f.Number, f.Suffix)
	}

	var depAirportStr string
	if departureAirport.IataCode.Valid {
		depAirportStr = departureAirport.IataCode.String
	} else if departureAirport.IcaoCode.Valid {
		depAirportStr = departureAirport.IcaoCode.String
	} else if departureAirport.Name.Valid {
		depAirportStr = departureAirport.Name.String
	} else {
		depAirportStr = departureAirport.Id.String()
	}

	var arrivalAirportStr string
	if arrivalAirport.IataCode.Valid {
		arrivalAirportStr = arrivalAirport.IataCode.String
	} else if arrivalAirport.IcaoCode.Valid {
		arrivalAirportStr = arrivalAirport.IcaoCode.String
	} else if arrivalAirport.Name.Valid {
		arrivalAirportStr = arrivalAirport.Name.String
	} else {
		arrivalAirportStr = model.UUID(arrivalAirport.Id).String()
	}

	var aircraftStr string
	if aircraft.EquipCode.Valid {
		aircraftStr = aircraft.EquipCode.String
	} else if aircraft.IataCode.Valid {
		aircraftStr = aircraft.IataCode.String
	} else if aircraft.IcaoCode.Valid {
		aircraftStr = aircraft.IcaoCode.String
	} else if aircraft.Name.Valid {
		aircraftStr = aircraft.Name.String
	} else {
		aircraftStr = model.UUID(aircraft.Id).String()
	}

	return fmt.Sprintf("%s\n%s\u2014%s\n%s", fnStr, depAirportStr, arrivalAirportStr, aircraftStr)
}

func (ch *ConnectionsHandler) mapAirports(base []model.UUID) []uuid.UUID {
	result := make([]uuid.UUID, len(base))
	for i, a := range base {
		result[i] = uuid.UUID(a)
	}

	return result
}

func (ch *ConnectionsHandler) mapAirportsFromPB(airports map[uuid.UUID]db.Airport, base []string) []model.UUID {
	result := make([]model.UUID, 0, len(base))
	for _, v := range base {
		// new protobuf always contains idv1: prefix with the internal airport id
		if idRaw, ok := strings.CutPrefix(v, "idv1:"); ok {
			var u model.UUID
			if err := u.FromString(idRaw); err == nil {
				result = append(result, u)
			}
		}

		// old protobuf messages: convert from iata code
		for _, airport := range airports {
			if airport.IataCode.Valid && airport.IataCode.String == v {
				result = append(result, model.UUID(airport.Id))
			}
		}
	}

	return result
}

func (ch *ConnectionsHandler) validateRequest(req model.ConnectionsSearchRequest) error {
	maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

	if len(req.Origins) < 1 || len(req.Origins) > 10 {
		return errors.New("len(origins) must be between 1 and 10")
	} else if len(req.Destinations) < 1 || len(req.Destinations) > 10 {
		return errors.New("len(destinations) must be between 1 and 10")
	} else if req.MaxFlights > 4 {
		return errors.New("maxFlights must be <=4")
	} else if req.MaxDeparture.Add(maxDuration).Sub(req.MinDeparture) > time.Hour*24*14 {
		return errors.New("range must be <=14d")
	} else if req.IncludeAirport != nil && len(req.IncludeAirport) > 100 {
		return errors.New("len(IncludeAirport) must be <= 100")
	} else if req.ExcludeAirport != nil && len(req.ExcludeAirport) > 100 {
		return errors.New("len(ExcludeAirport) must be <= 100")
	} else if req.IncludeFlightNumber != nil && len(req.IncludeFlightNumber) > 100 {
		return errors.New("len(IncludeFlightNumber) must be <= 100")
	} else if req.ExcludeFlightNumber != nil && len(req.ExcludeFlightNumber) > 100 {
		return errors.New("len(ExcludeFlightNumber) must be <= 100")
	} else if req.IncludeAircraft != nil && len(req.IncludeAircraft) > 100 {
		return errors.New("len(IncludeAircraft) must be <= 100")
	} else if req.ExcludeAircraft != nil && len(req.ExcludeAircraft) > 100 {
		return errors.New("len(ExcludeAircraft) must be <= 100")
	}

	return nil
}

type uuidSliceRestr interface {
	~[]uuid.UUID
	search.ConnectionSearchOption
}

type stringSliceRestr interface {
	~[]string
	search.ConnectionSearchOption
}

func appendSliceOptions[Reg uuidSliceRestr, Glob stringSliceRestr](options []search.ConnectionSearchOption, values []string) []search.ConnectionSearchOption {
	unique := make(map[string]struct{})
	regular := make(Reg, 0)
	glob := make(Glob, 0)

	for _, v := range values {
		if _, ok := unique[v]; ok {
			continue
		}

		if hasMeta(v) && isValidGlob(v) {
			glob = append(glob, v)
		} else {
			var u model.UUID
			if err := u.FromString(v); err == nil {
				regular = append(regular, uuid.UUID(u))
			}
		}

		unique[v] = struct{}{}
	}

	if len(regular) > 0 {
		options = append(options, regular)
	}

	if len(glob) > 0 {
		options = append(options, glob)
	}

	return options
}

func appendRegularSliceOptions[Reg stringSliceRestr, Glob stringSliceRestr](options []search.ConnectionSearchOption, values []string) []search.ConnectionSearchOption {
	unique := make(map[string]struct{})
	regular := make(Reg, 0)
	glob := make(Glob, 0)

	for _, v := range values {
		if _, ok := unique[v]; ok {
			continue
		}

		if hasMeta(v) && isValidGlob(v) {
			glob = append(glob, v)
		} else {
			regular = append(regular, v)
		}

		unique[v] = struct{}{}
	}

	if len(regular) > 0 {
		options = append(options, regular)
	}

	if len(glob) > 0 {
		options = append(options, glob)
	}

	return options
}

type uuidRestr interface {
	~[16]byte
	search.ConnectionSearchOption
}

type stringRestr interface {
	~string
	search.ConnectionSearchOption
}

func appendStringOptions[Reg uuidRestr, Glob stringRestr](options []search.ConnectionSearchOption, values []string) []search.ConnectionSearchOption {
	unique := make(map[string]struct{})

	for _, v := range values {
		if _, ok := unique[v]; ok {
			continue
		}

		if hasMeta(v) && isValidGlob(v) {
			options = append(options, Glob(v))
		} else {
			var u model.UUID
			if err := u.FromString(v); err == nil {
				options = append(options, Reg(u))
			}
		}

		unique[v] = struct{}{}
	}

	return options
}

func appendRegularStringOptions[Reg stringRestr, Glob stringRestr](options []search.ConnectionSearchOption, values []string) []search.ConnectionSearchOption {
	unique := make(map[string]struct{})

	for _, v := range values {
		if _, ok := unique[v]; ok {
			continue
		}

		if hasMeta(v) && isValidGlob(v) {
			options = append(options, Glob(v))
		} else {
			options = append(options, Reg(v))
		}

		unique[v] = struct{}{}
	}

	return options
}

func hasMeta(pattern string) bool {
	return strings.ContainsAny(pattern, "*?[\\")
}

func isValidGlob(pattern string) bool {
	_, err := path.Match(pattern, "")
	return err == nil
}
