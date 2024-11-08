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
		fns, err := dh.FlightNumbersRaw(c.Request().Context())
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		baseURL := baseUrl(c)
		res := c.Response()
		res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
		addExpirationHeaders(c, time.Now(), ttl)

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

		for fn, lastMod := range fns {
			loc := baseURL + "/flight/" + fn.String()

			if err = addSitemapURL(enc, loc, lastMod); err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError)
			}
		}

		return enc.EncodeToken(xml.EndElement{
			Name: xml.Name{
				Local: "urlset",
				Space: "http://www.sitemaps.org/schemas/sitemap/0.9",
			},
		})
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
