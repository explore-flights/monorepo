package web

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"html/template"
	"io"
	"maps"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/explore-flights/monorepo/go/api/business/connections"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/pb"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/goccy/go-graphviz"
	"github.com/goccy/go-graphviz/cgraph"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"google.golang.org/protobuf/proto"
)

//go:embed share.gohtml
var shareTemplateHtml string

type connectionsHandlerFlightRepo interface {
	Airlines(ctx context.Context) (map[string]db.Airline, error)
	Airports(ctx context.Context) (map[string]db.Airport, error)
	Aircraft(ctx context.Context) (map[string]db.Aircraft, error)
}

type ConnectionsHandler struct {
	repo   connectionsHandlerFlightRepo
	search *connections.Search
}

func NewConnectionsHandler(repo connectionsHandlerFlightRepo, search *connections.Search) *ConnectionsHandler {
	return &ConnectionsHandler{
		repo:   repo,
		search: search,
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

	req, err := ch.parseAndValidateRequest(c)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	minLayover := time.Duration(req.MinLayoverMS) * time.Millisecond
	maxLayover := time.Duration(req.MaxLayoverMS) * time.Millisecond
	maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

	options := make([]connections.SearchOption, 0)
	options = append(options, connections.WithCountMultiLeg(req.CountMultiLeg))
	options = appendStringOptions[connections.WithIncludeAirport, connections.WithIncludeAirportGlob](options, req.IncludeAirport)
	options = appendSliceOptions[connections.WithExcludeAirport, connections.WithExcludeAirportGlob](options, req.ExcludeAirport)
	options = appendStringOptions[connections.WithIncludeFlightNumber, connections.WithIncludeFlightNumberGlob](options, req.IncludeFlightNumber)
	options = appendSliceOptions[connections.WithExcludeFlightNumber, connections.WithExcludeFlightNumberGlob](options, req.ExcludeFlightNumber)
	options = appendStringOptions[connections.WithIncludeAircraft, connections.WithIncludeAircraftGlob](options, req.IncludeAircraft)
	options = appendSliceOptions[connections.WithExcludeAircraft, connections.WithExcludeAircraftGlob](options, req.ExcludeAircraft)

	conns, err := ch.search.FindConnections(
		ctx,
		req.Origins,
		req.Destinations,
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
	req, err := ch.parseAndValidateRequest(c)
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
	req, err := ch.parseAndValidateRequest(c)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
	}

	scheme, host := contextSchemeAndHost(c)
	payload := c.Param("payload")

	tmpl, err := template.New("share").Parse(shareTemplateHtml)
	if err != nil {
		return err
	}

	originsStr := strings.Join(req.Origins, " | ")
	destinationsStr := strings.Join(req.Destinations, " | ")

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

func (ch *ConnectionsHandler) parseAndValidateRequest(c echo.Context) (model.ConnectionsSearchRequest, error) {
	req, err := ch.parseRequest(c)
	if err != nil {
		return model.ConnectionsSearchRequest{}, err
	}

	if err = ch.validateRequest(req); err != nil {
		return model.ConnectionsSearchRequest{}, err
	}

	return req, nil
}

func (ch *ConnectionsHandler) parseRequest(c echo.Context) (model.ConnectionsSearchRequest, error) {
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
			Origins:             pbReq.Origins,
			Destinations:        pbReq.Destinations,
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

func (ch *ConnectionsHandler) exportConnectionsJSON(ctx context.Context, conns []connections.Connection, airports map[string]db.Airport) (model.ConnectionsResponse, error) {
	flights := make(map[model.UUID]model.ConnectionFlightResponse)
	referencedAirlines := make(common.Set[string])
	referencedAirports := make(common.Set[string])
	referencedAircraft := make(common.Set[string])
	connections, err := ch.buildConnectionsResponse(conns, flights, make(map[*connections.Flight]model.UUID), referencedAirlines, referencedAirports, referencedAircraft)
	if err != nil {
		return model.ConnectionsResponse{}, err
	}

	r := model.ConnectionsResponse{
		Connections: connections,
		Flights:     flights,
		Airlines:    make(map[string]model.Airline),
		Airports:    make(map[string]model.Airport),
		Aircraft:    make(map[string]model.Aircraft),
	}

	airlines, err := ch.repo.Airlines(ctx)
	if err != nil {
		return model.ConnectionsResponse{}, err
	}

	aircraft, err := ch.repo.Aircraft(ctx)
	if err != nil {
		return model.ConnectionsResponse{}, err
	}

	for iataCode := range referencedAirlines {
		r.Airlines[iataCode] = model.AirlineFromDb(airlines[iataCode])
	}

	for iataCode := range referencedAirports {
		r.Airports[iataCode] = model.AirportFromDb(airports[iataCode])
	}

	model.AddReferencedAircraft(maps.Keys(referencedAircraft), aircraft, r.Aircraft)

	return r, nil
}

func (ch *ConnectionsHandler) buildConnectionsResponse(conns []connections.Connection, flights map[model.UUID]model.ConnectionFlightResponse, uuidByFlight map[*connections.Flight]model.UUID, referencedAirlines, referencedAirports, referencedAircraft common.Set[string]) ([]model.ConnectionResponse, error) {
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
			referencedAirlines.Add(conn.Flight.AirlineIataCode)
			referencedAirports.Add(conn.Flight.DepartureAirportIataCode)
			referencedAirports.Add(conn.Flight.ArrivalAirportIataCode)
			referencedAircraft.Add(conn.Flight.AircraftIataCode)

			flights[fid] = model.ConnectionFlightResponse{
				FlightNumber:             model.FlightNumberFromDb(conn.Flight.FlightNumber),
				DepartureTime:            conn.Flight.DepartureTime,
				DepartureAirportIataCode: conn.Flight.DepartureAirportIataCode,
				ArrivalTime:              conn.Flight.ArrivalTime,
				ArrivalAirportIataCode:   conn.Flight.ArrivalAirportIataCode,
				AircraftOwner:            conn.Flight.AircraftOwner,
				AircraftIataCode:         conn.Flight.AircraftIataCode,
				AircraftConfiguration:    conn.Flight.AircraftConfigurationVersion,
				CodeShares:               ch.convertCodeShares(conn.Flight.CodeShares, referencedAirlines),
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

func (ch *ConnectionsHandler) convertCodeShares(inp common.Set[db.FlightNumber], referencedAirlines common.Set[string]) []model.FlightNumber {
	r := make([]model.FlightNumber, 0, len(inp))
	for fn := range inp {
		referencedAirlines.Add(fn.AirlineIataCode)
		r = append(r, model.FlightNumberFromDb(fn))
	}

	return r
}

func (ch *ConnectionsHandler) exportConnectionsImage(ctx context.Context, airports map[string]db.Airport, conns []connections.Connection, w io.Writer) error {
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
	if err = ch.buildGraph(nil, airlines, airports, aircraft, conns, graph, make(map[*connections.Flight]*cgraph.Node), &nodeId, &edgeId); err != nil {
		return err
	}

	return g.Render(ctx, graph, graphviz.PNG, w)
}

func (ch *ConnectionsHandler) buildGraph(parent *connections.Flight, airlines map[string]db.Airline, airports map[string]db.Airport, aircraft map[string]db.Aircraft, conns []connections.Connection, graph *cgraph.Graph, lookup map[*connections.Flight]*cgraph.Node, nodeId *graphviz.ID, edgeId *graphviz.ID) error {
	var err error
	for _, conn := range conns {
		airline, ok := airlines[conn.Flight.AirlineIataCode]
		if !ok {
			return fmt.Errorf("could not find airline for id %s", conn.Flight.AirlineIataCode)
		}

		departureAirport, ok := airports[conn.Flight.DepartureAirportIataCode]
		if !ok {
			return fmt.Errorf("could not find departure airport for id %s", conn.Flight.DepartureAirportIataCode)
		}

		arrivalAirport, ok := airports[conn.Flight.ArrivalAirportIataCode]
		if !ok {
			return fmt.Errorf("could not find arrival airport for id %s", conn.Flight.ArrivalAirportIataCode)
		}

		ac, ok := aircraft[conn.Flight.AircraftIataCode]
		if !ok {
			return fmt.Errorf("could not find aircraft for id %s", conn.Flight.AircraftIataCode)
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

func (ch *ConnectionsHandler) buildNodeLabel(f *connections.Flight, airline db.Airline, departureAirport, arrivalAirport db.Airport, aircraft db.Aircraft) string {
	var aircraftStr string
	if aircraft.IcaoCode.Valid {
		aircraftStr = aircraft.IcaoCode.String
	} else {
		aircraftStr = aircraft.IataCode
	}

	return fmt.Sprintf("%s\n%s\u2014%s\n%s", f.FlightNumber.String(), departureAirport.IataCode, arrivalAirport.IataCode, aircraftStr)
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

type stringSliceRestr interface {
	~[]string
	connections.SearchOption
}

func appendSliceOptions[Reg stringSliceRestr, Glob stringSliceRestr](options []connections.SearchOption, values []string) []connections.SearchOption {
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

type stringRestr interface {
	~string
	connections.SearchOption
}

func appendStringOptions[Reg stringRestr, Glob stringRestr](options []connections.SearchOption, values []string) []connections.SearchOption {
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
