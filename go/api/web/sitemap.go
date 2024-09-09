package web

import (
	"context"
	"encoding/xml"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/labstack/echo/v4"
	"iter"
	"net/http"
	"strings"
	"time"
)

type xmlSitemapUrl struct {
	Loc     string `xml:"loc"`
	Lastmod string `xml:"lastmod"`
}

type s3ListObjectsIterator struct {
	s3c adapt.S3Lister
	req *s3.ListObjectsV2Input
	err error
}

func (l *s3ListObjectsIterator) All(ctx context.Context) iter.Seq[types.Object] {
	return func(yield func(types.Object) bool) {
		for {
			res, err := l.s3c.ListObjectsV2(ctx, l.req)
			if err != nil {
				l.err = err
				return
			}

			for _, obj := range res.Contents {
				if !yield(obj) {
					return
				}
			}

			if res.NextContinuationToken == nil {
				return
			}

			l.req.ContinuationToken = res.NextContinuationToken
		}
	}
}

func (l *s3ListObjectsIterator) Err() error {
	return l.err
}

func NewSitemapHandler(s3c adapt.S3Lister, bucket string) echo.HandlerFunc {
	ttl := time.Hour * 3
	cacheControlHeaderValue := fmt.Sprintf("public, max-age=%d, must-revalidate", int(ttl.Seconds()))

	return func(c echo.Context) error {
		now := time.Now().UTC() // http.TimeFormat requires UTC time
		expiresAt := now.Add(ttl)
		baseURL := baseUrl(c)

		res := c.Response()
		res.Header().Set(echo.HeaderContentType, echo.MIMEApplicationXMLCharsetUTF8)
		res.Header().Set("Date", now.Format(http.TimeFormat))
		res.Header().Set("Expires", expiresAt.Format(http.TimeFormat))
		res.Header().Set(echo.HeaderCacheControl, cacheControlHeaderValue)

		_, err := res.Write([]byte(xml.Header))
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

		it := &s3ListObjectsIterator{
			s3c: s3c,
			req: &s3.ListObjectsV2Input{
				Bucket: aws.String(bucket),
				Prefix: aws.String("processed/schedules/"),
			},
		}

		for obj := range it.All(c.Request().Context()) {
			var ok bool
			flightNumber := strings.TrimPrefix(*obj.Key, "processed/schedules/")

			if flightNumber, ok = strings.CutSuffix(flightNumber, ".json"); ok {
				flightNumber = strings.Replace(flightNumber, "/", "", 1)

				if common.CanParseFlightNumber(flightNumber) {
					loc := baseURL + "/flight/" + flightNumber

					if err = addSitemapURL(enc, loc, *obj.LastModified); err != nil {
						return echo.NewHTTPError(http.StatusInternalServerError)
					}
				}
			}
		}

		if err = it.Err(); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError)
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
