package web

import (
	"context"
	"encoding/xml"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web/model"
	"github.com/gofrs/uuid/v5"
	"github.com/labstack/echo/v4"
	"iter"
	"net/http"
	"time"
)

type xmlSitemapUrl struct {
	Loc     string `xml:"loc"`
	Lastmod string `xml:"lastmod,omitempty"`
}

type sitemapHandlerRepo interface {
	Airlines(ctx context.Context) (map[uuid.UUID]db.Airline, error)
	IterFlightNumbers(ctx context.Context, airlineId uuid.UUID, err *error) iter.Seq2[db.FlightNumber, time.Time]
}

type SitemapHandler struct {
	repo sitemapHandlerRepo
}

func NewSitemapHandler(repo sitemapHandlerRepo) *SitemapHandler {
	return &SitemapHandler{
		repo: repo,
	}
}

func (sh *SitemapHandler) SitemapIndex(c echo.Context) error {
	const ttl = time.Hour * 3

	ctx := c.Request().Context()
	airlines, err := sh.repo.Airlines(ctx)
	if err != nil {
		return err
	}

	baseURL := baseUrl(c)
	res := c.Response()
	res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
	addExpirationHeaders(c, time.Now(), ttl)

	_, err = res.Write([]byte(xml.Header))
	if err != nil {
		return err
	}

	enc := xml.NewEncoder(res)
	defer enc.Close()

	err = enc.EncodeToken(xml.StartElement{
		Name: xml.Name{
			Local: "sitemapindex",
			Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
		},
	})

	if err != nil {
		return err
	}

	for id := range airlines {
		if err = sh.addSitemapURL(enc, "sitemap", sh.buildSitemapURL(baseURL, id), time.Time{}); err != nil {
			return err
		}
	}

	return enc.EncodeToken(xml.EndElement{
		Name: xml.Name{
			Local: "sitemapindex",
			Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
		},
	})
}

func (sh *SitemapHandler) SitemapAirline(c echo.Context) error {
	const ttl = time.Hour * 3

	var airlineId model.UUID
	if err := airlineId.FromString(c.Param("airlineId")); err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	}

	ctx := c.Request().Context()
	airlines, err := sh.repo.Airlines(ctx)
	if err != nil {
		return err
	}

	baseURL := baseUrl(c)
	res := c.Response()
	res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
	addExpirationHeaders(c, time.Now(), ttl)

	_, err = res.Write([]byte(xml.Header))
	if err != nil {
		return err
	}

	enc := xml.NewEncoder(res)
	defer enc.Close()

	err = enc.EncodeToken(xml.StartElement{
		Name: xml.Name{
			Local: "urlset",
			Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
		},
	})

	if err != nil {
		return err
	}

	for fn, lastModified := range sh.repo.IterFlightNumbers(ctx, uuid.UUID(airlineId), &err) {
		if err = sh.addSitemapURL(enc, "url", sh.buildFlightURL(baseURL, airlines, fn), lastModified); err != nil {
			return err
		}
	}

	if err != nil {
		return err
	}

	return enc.EncodeToken(xml.EndElement{
		Name: xml.Name{
			Local: "urlset",
			Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
		},
	})
}

func (sh *SitemapHandler) buildSitemapURL(baseURL string, airlineId uuid.UUID) string {
	return fmt.Sprintf("%s/data/sitemap/%s/sitemap.xml", baseURL, model.UUID(airlineId).String())
}

func (sh *SitemapHandler) buildFlightURL(baseURL string, airlines map[uuid.UUID]db.Airline, fn db.FlightNumber) string {
	var prefix string
	if airline, ok := airlines[fn.AirlineId]; ok {
		prefix = airline.IataCode
	} else {
		prefix = model.UUID(fn.AirlineId).String() + "-"
	}

	return fmt.Sprintf("%s/flight/%s%d%s", baseURL, prefix, fn.Number, fn.Suffix)
}

func (sh *SitemapHandler) addSitemapURL(enc *xml.Encoder, name, loc string, modified time.Time) error {
	var lastMod string
	if !modified.IsZero() {
		lastMod = modified.Format(time.RFC3339)
	}

	return enc.EncodeElement(
		xmlSitemapUrl{
			Loc:     loc,
			Lastmod: lastMod,
		},
		xml.StartElement{
			Name: xml.Name{
				Local: name,
			},
		},
	)
}
