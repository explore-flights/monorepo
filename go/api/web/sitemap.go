package web

import (
	"encoding/xml"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/labstack/echo/v4"
	"net/http"
	"time"
)

type xmlSitemapUrl struct {
	Loc     string `xml:"loc"`
	Lastmod string `xml:"lastmod"`
}

func NewSitemapHandler(dh *data.Handler) echo.HandlerFunc {
	const ttl = time.Hour * 3

	return func(c echo.Context) error {
		fns, err := dh.FlightNumbers(c.Request().Context(), "", -1)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		baseURL := baseUrl(c)
		now := time.Now()

		res := c.Response()
		res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
		addExpirationHeaders(c, now, ttl)

		_, err = res.Write([]byte(xml.Header))
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
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
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		for _, fn := range fns {
			loc := baseURL + "/flight/" + fn.String()

			if err = addSitemapURL(enc, loc, now); err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError)
			}
		}

		err = enc.EncodeToken(xml.EndElement{
			Name: xml.Name{
				Local: "urlset",
				Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
			},
		})

		return nil
	}
}

func addSitemapURL(enc *xml.Encoder, loc string, modified time.Time) error {
	return enc.EncodeElement(
		xmlSitemapUrl{
			Loc:     loc,
			Lastmod: modified.Format(time.RFC3339),
		},
		xml.StartElement{
			Name: xml.Name{
				Local: "url",
			},
		},
	)
}
