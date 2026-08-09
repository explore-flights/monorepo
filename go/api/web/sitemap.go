package web

import (
	"context"
	"encoding/xml"
	"fmt"
	"iter"
	"sort"
	"time"

	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/labstack/echo/v4"
)

type xmlSitemapUrl struct {
	Loc     string `xml:"loc"`
	Lastmod string `xml:"lastmod,omitempty"`
}

type sitemapHandlerRepo interface {
	Airlines(ctx context.Context) (map[string]db.Airline, error)
	Airports(ctx context.Context) (map[string]db.Airport, error)
	IterFlightNumbers(ctx context.Context, airlineIataCode string, err *error) iter.Seq2[db.FlightNumber, time.Time]
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

	if err = sh.addSitemapURL(enc, "sitemap", sh.buildAirportSitemapURL(baseURL), time.Time{}); err != nil {
		return err
	}

	ids := make([]string, 0, len(airlines))
	for id := range airlines {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
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

func (sh *SitemapHandler) SitemapAirports(c echo.Context) error {
	const ttl = time.Hour * 3
	ctx := c.Request().Context()
	airports, err := sh.repo.Airports(ctx)
	if err != nil {
		return err
	}

	baseURL := baseUrl(c)
	res := c.Response()
	res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
	addExpirationHeaders(c, time.Now(), ttl)

	if _, err = res.Write([]byte(xml.Header)); err != nil {
		return err
	}

	enc := xml.NewEncoder(res)
	defer enc.Close()
	if err = enc.EncodeToken(sitemapStartElement("urlset")); err != nil {
		return err
	}

	ids := make([]string, 0, len(airports))
	for id := range airports {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if err = sh.addSitemapURL(enc, "url", sh.buildAirportURL(baseURL, id), time.Time{}); err != nil {
			return err
		}
	}

	return enc.EncodeToken(xml.EndElement{Name: sitemapStartElement("urlset").Name})
}

func (sh *SitemapHandler) SitemapAirline(c echo.Context) error {
	const ttl = time.Hour * 3
	ctx := c.Request().Context()

	airlineIataCode := c.Param("airlineId")
	baseURL := baseUrl(c)
	res := c.Response()
	res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
	addExpirationHeaders(c, time.Now(), ttl)

	_, err := res.Write([]byte(xml.Header))
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

	for fn, lastModified := range sh.repo.IterFlightNumbers(ctx, airlineIataCode, &err) {
		if err = sh.addSitemapURL(enc, "url", sh.buildFlightURL(baseURL, fn), lastModified); err != nil {
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

func (sh *SitemapHandler) buildSitemapURL(baseURL string, airlineIataCode string) string {
	return fmt.Sprintf("%s/data/sitemap/%s/sitemap.xml", baseURL, airlineIataCode)
}

func (sh *SitemapHandler) buildAirportSitemapURL(baseURL string) string {
	return fmt.Sprintf("%s/data/sitemap/airports/sitemap.xml", baseURL)
}

func (sh *SitemapHandler) buildAirportURL(baseURL string, airportIataCode string) string {
	return fmt.Sprintf("%s/airport/%s", baseURL, airportIataCode)
}

func (sh *SitemapHandler) buildFlightURL(baseURL string, fn db.FlightNumber) string {
	return fmt.Sprintf("%s/flight/%s", baseURL, fn.String())
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

func sitemapStartElement(name string) xml.StartElement {
	return xml.StartElement{
		Name: xml.Name{
			Local: name,
			Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
		},
	}
}
