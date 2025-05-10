package web

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/pb"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/labstack/echo/v4"
	"google.golang.org/protobuf/proto"
	"html/template"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

//go:embed share.gohtml
var shareTemplateHtml string

type ConnectionsHandler struct {
	ch *search.ConnectionsHandler
}

func NewConnectionsHandler(ch *search.ConnectionsHandler) *ConnectionsHandler {
	return &ConnectionsHandler{ch: ch}
}

func (ch *ConnectionsHandler) ConnectionsJSON(c echo.Context) error {
	return ch.connections(c, "json")
}

func (ch *ConnectionsHandler) ConnectionsPNG(c echo.Context) error {
	return ch.connections(c, "png")
}

func (ch *ConnectionsHandler) connections(c echo.Context, export string) error {
	ctx := c.Request().Context()

	req, err := ch.parseAndValidateRequest(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err)
	}

	minLayover := time.Duration(req.MinLayoverMS) * time.Millisecond
	maxLayover := time.Duration(req.MaxLayoverMS) * time.Millisecond
	maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

	options := make([]search.ConnectionSearchOption, 0)
	options = append(options, search.WithCountMultiLeg(req.CountMultiLeg))
	options = appendStringOptions[search.WithIncludeAirport, search.WithIncludeAirportGlob](options, req.IncludeAirport)
	options = appendSliceOptions[search.WithExcludeAirport, search.WithExcludeAirportGlob](options, req.ExcludeAirport)
	options = appendStringOptions[search.WithIncludeFlightNumber, search.WithIncludeFlightNumberGlob](options, req.IncludeFlightNumber)
	options = appendSliceOptions[search.WithExcludeFlightNumber, search.WithExcludeFlightNumberGlob](options, req.ExcludeFlightNumber)
	options = appendStringOptions[search.WithIncludeAircraft, search.WithIncludeAircraftGlob](options, req.IncludeAircraft)
	options = appendSliceOptions[search.WithExcludeAircraft, search.WithExcludeAircraftGlob](options, req.ExcludeAircraft)

	conns, err := ch.ch.FindConnections(
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
			return echo.NewHTTPError(http.StatusRequestTimeout, err)
		}

		return echo.NewHTTPError(http.StatusInternalServerError)
	}

	switch export {
	case "json":
		res := model.ConnectionsSearchResponse{
			Data: search.ExportConnectionsJson(conns),
		}

		if c.QueryParams().Has("includeSearch") {
			res.Search = &req
		}

		return c.JSON(http.StatusOK, res)

	case "png":
		c.Response().Header().Set(echo.HeaderContentType, "image/png")
		c.Response().WriteHeader(http.StatusOK)
		return search.ExportConnectionsImage(ctx, c.Response(), conns)

	default:
		return echo.NewHTTPError(http.StatusBadRequest, "invalid export type")
	}
}

func (ch *ConnectionsHandler) ConnectionsShareCreate(c echo.Context) error {
	req, err := ch.parseAndValidateRequest(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err)
	}

	b, err := proto.Marshal(req.ToPb())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err)
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
		return echo.NewHTTPError(http.StatusBadRequest, err)
	}

	scheme, host := contextSchemeAndHost(c)
	payload := c.Param("payload")

	tmpl, err := template.New("share").Parse(shareTemplateHtml)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err)
	}

	origins := strings.Join(req.Origins, " | ")
	destinations := strings.Join(req.Destinations, " | ")

	data := map[string]string{
		"scheme":     scheme,
		"host":       host,
		"contentUrl": ch.shareContentUrl(scheme, host, payload),
		"imageUrl":   ch.shareImageUrl(scheme, host, payload),
		"title":      fmt.Sprintf("Connections from %v to %v • explore.flights", origins, destinations),
		"description": fmt.Sprintf(
			"Explore connections from from %v to %v between %v and %v",
			origins,
			destinations,
			req.MinDeparture.Format(time.RFC3339),
			req.MaxDeparture.Format(time.RFC3339),
		),
	}

	var buf bytes.Buffer
	if err = tmpl.Execute(&buf, data); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err)
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

type sliceRestr interface {
	~[]string
	search.ConnectionSearchOption
}

func appendSliceOptions[Reg sliceRestr, Glob sliceRestr](options []search.ConnectionSearchOption, values []string) []search.ConnectionSearchOption {
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
	search.ConnectionSearchOption
}

func appendStringOptions[Reg stringRestr, Glob stringRestr](options []search.ConnectionSearchOption, values []string) []search.ConnectionSearchOption {
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
