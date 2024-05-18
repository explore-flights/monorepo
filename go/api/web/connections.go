package web

import (
	"bytes"
	"compress/gzip"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/labstack/echo/v4"
	"html/template"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

//go:embed share.gohtml
var shareTemplateHtml string

type ConnectionsSearchRequest struct {
	Origins             []string  `json:"origins"`
	Destinations        []string  `json:"destinations"`
	MinDeparture        time.Time `json:"minDeparture"`
	MaxDeparture        time.Time `json:"maxDeparture"`
	MaxFlights          int       `json:"maxFlights"`
	MinLayoverMS        int       `json:"minLayoverMS"`
	MaxLayoverMS        int       `json:"maxLayoverMS"`
	MaxDurationMS       int       `json:"maxDurationMS"`
	IncludeAirport      *[]string `json:"includeAirport,omitempty"`
	ExcludeAirport      *[]string `json:"excludeAirport,omitempty"`
	IncludeFlightNumber *[]string `json:"includeFlightNumber,omitempty"`
	ExcludeFlightNumber *[]string `json:"excludeFlightNumber,omitempty"`
	IncludeAircraft     *[]string `json:"includeAircraft,omitempty"`
	ExcludeAircraft     *[]string `json:"excludeAircraft,omitempty"`
}

func NewConnectionsEndpoint(ch *search.ConnectionsHandler, export string) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		var req ConnectionsSearchRequest
		if c.Request().Method == http.MethodPost {
			if err := c.Bind(&req); err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, err)
			}
		} else {
			b, err := base64.RawURLEncoding.DecodeString(c.Param("payload"))
			if err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, err)
			}

			r, err := gzip.NewReader(bytes.NewReader(b))
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError, err)
			}

			if err = json.NewDecoder(r).Decode(&req); err != nil {
				return echo.NewHTTPError(http.StatusBadRequest, err)
			}
		}

		if err := validateRequest(req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		minLayover := time.Duration(req.MinLayoverMS) * time.Millisecond
		maxLayover := time.Duration(req.MaxLayoverMS) * time.Millisecond
		maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

		options := make([]search.FilterOption, 0)
		if req.IncludeAirport != nil {
			options = appendStringOptions[search.WithIncludeAirport, search.WithIncludeAirportGlob](options, *req.IncludeAirport)
		}

		if req.ExcludeAirport != nil {
			options = appendSliceOptions[search.WithExcludeAirport, search.WithExcludeAirportGlob](options, *req.ExcludeAirport)
		}

		if req.IncludeFlightNumber != nil {
			options = appendStringOptions[search.WithIncludeFlightNumber, search.WithIncludeFlightNumberGlob](options, *req.IncludeFlightNumber)
		}

		if req.ExcludeFlightNumber != nil {
			options = appendSliceOptions[search.WithExcludeFlightNumber, search.WithExcludeFlightNumberGlob](options, *req.ExcludeFlightNumber)
		}

		if req.IncludeAircraft != nil {
			options = appendStringOptions[search.WithIncludeAircraft, search.WithIncludeAircraftGlob](options, *req.IncludeAircraft)
		}

		if req.ExcludeAircraft != nil {
			options = appendSliceOptions[search.WithExcludeAircraft, search.WithExcludeAircraftGlob](options, *req.ExcludeAircraft)
		}

		conns, err := ch.FindConnections(
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
			return c.JSON(http.StatusOK, search.ExportConnectionsJson(conns))

		case "png":
			c.Response().Header().Set(echo.HeaderContentType, "image/png")
			c.Response().WriteHeader(http.StatusOK)
			return search.ExportConnectionsImage(c.Response(), conns)

		default:
			return echo.NewHTTPError(http.StatusBadRequest, "invalid export type")
		}
	}
}

func NewConnectionsShareCreateEndpoint() echo.HandlerFunc {
	return func(c echo.Context) error {
		req, err := parseAndValidateRequest(c)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		var b bytes.Buffer
		w := gzip.NewWriter(&b)
		if err = json.NewEncoder(w).Encode(req); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		_ = w.Close()

		scheme, host := contextSchemeAndHost(c)
		payload := base64.RawURLEncoding.EncodeToString(b.Bytes())

		return c.JSON(http.StatusOK, map[string]string{
			"htmlUrl":  shareHtmlUrl(scheme, host, payload),
			"imageUrl": shareImageUrl(scheme, host, payload),
		})
	}
}

func NewConnectionsShareHTMLEndpoint() echo.HandlerFunc {
	return func(c echo.Context) error {
		scheme, host := contextSchemeAndHost(c)
		payload := c.Param("payload")

		tmpl, err := template.New("share").Parse(shareTemplateHtml)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		data := map[string]string{
			"scheme":     scheme,
			"host":       host,
			"contentUrl": shareContentUrl(scheme, host, payload),
			"imageUrl":   shareImageUrl(scheme, host, payload),
		}

		var buf bytes.Buffer
		if err = tmpl.Execute(&buf, data); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}

		return c.HTMLBlob(http.StatusOK, buf.Bytes())
	}
}

func shareHtmlUrl(scheme, host, payload string) string {
	return scheme + "://" + host + "/api/connections/share/" + url.PathEscape(payload)
}

func shareContentUrl(scheme, host, payload string) string {
	return scheme + "://" + host + "/?search=" + url.QueryEscape(payload)
}

func shareImageUrl(scheme, host, payload string) string {
	return scheme + "://" + host + "/api/connections/png/" + url.PathEscape(payload) + "/c.png"
}

func parseAndValidateRequest(c echo.Context) (ConnectionsSearchRequest, error) {
	var req ConnectionsSearchRequest
	if err := c.Bind(&req); err != nil {
		return ConnectionsSearchRequest{}, err
	}

	if err := validateRequest(req); err != nil {
		return ConnectionsSearchRequest{}, err
	}

	return req, nil
}

func validateRequest(req ConnectionsSearchRequest) error {
	maxDuration := time.Duration(req.MaxDurationMS) * time.Millisecond

	if len(req.Origins) < 1 || len(req.Origins) > 10 {
		return errors.New("len(origins) must be between 1 and 10")
	} else if len(req.Destinations) < 1 || len(req.Destinations) > 10 {
		return errors.New("len(destinations) must be between 1 and 10")
	} else if req.MaxFlights > 4 {
		return errors.New("maxFlights must be <=4")
	} else if req.MaxDeparture.Add(maxDuration).Sub(req.MinDeparture) > time.Hour*24*14 {
		return errors.New("range must be <=14d")
	} else if req.IncludeAirport != nil && len(*req.IncludeAirport) > 100 {
		return errors.New("len(IncludeAirport) must be <= 100")
	} else if req.ExcludeAirport != nil && len(*req.ExcludeAirport) > 100 {
		return errors.New("len(ExcludeAirport) must be <= 100")
	} else if req.IncludeFlightNumber != nil && len(*req.IncludeFlightNumber) > 100 {
		return errors.New("len(IncludeFlightNumber) must be <= 100")
	} else if req.ExcludeFlightNumber != nil && len(*req.ExcludeFlightNumber) > 100 {
		return errors.New("len(ExcludeFlightNumber) must be <= 100")
	} else if req.IncludeAircraft != nil && len(*req.IncludeAircraft) > 100 {
		return errors.New("len(IncludeAircraft) must be <= 100")
	} else if req.ExcludeAircraft != nil && len(*req.ExcludeAircraft) > 100 {
		return errors.New("len(ExcludeAircraft) must be <= 100")
	}

	return nil
}

type sliceRestr interface {
	~[]string
	search.FilterOption
}

func appendSliceOptions[Reg sliceRestr, Glob sliceRestr](options []search.FilterOption, values []string) []search.FilterOption {
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
	search.FilterOption
}

func appendStringOptions[Reg stringRestr, Glob stringRestr](options []search.FilterOption, values []string) []search.FilterOption {
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
