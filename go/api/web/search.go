package web

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/labstack/echo/v4"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func NewSearchEndpoint(s3c adapt.S3Lister, bucket string) echo.HandlerFunc {
	const schedulesPrefix = "processed/schedules/"

	search := func(c echo.Context) ([]common.FlightNumber, error) {
		query := strings.TrimSpace(strings.ToUpper(c.QueryParam("q")))
		prefix := schedulesPrefix

		if len(query) >= 2 {
			prefix += query[:2]
			prefix += "/"

			if len(query) > 2 {
				prefix += query[2:]
			}
		} else {
			prefix += query
		}

		resp, err := s3c.ListObjectsV2(c.Request().Context(), &s3.ListObjectsV2Input{
			Bucket:  aws.String(bucket),
			Prefix:  aws.String(prefix),
			MaxKeys: aws.Int32(100),
		})

		if err != nil {
			return nil, err
		}

		fns := make([]common.FlightNumber, 0, len(resp.Contents))
		for _, obj := range resp.Contents {
			key := strings.TrimPrefix(*obj.Key, schedulesPrefix)
			if airline, number, found := strings.Cut(key, "/"); found {
				if number, found = strings.CutSuffix(number, ".json"); found {
					fn, err := common.ParseFlightNumber(airline + number)
					if err == nil {
						fns = append(fns, fn)
					}
				}
			}
		}

		return fns, nil
	}

	return func(c echo.Context) error {
		fns, err := search(c)

		if c.Request().Header.Get(echo.HeaderAccept) == echo.MIMEApplicationJSON {
			// api request
			if err != nil {
				return echo.NewHTTPError(http.StatusInternalServerError)
			}

			return c.JSON(http.StatusOK, fns)
		} else {
			// user request
			if err != nil {
				q := make(url.Values)
				q.Set("status", strconv.Itoa(http.StatusInternalServerError))
				q.Set("error", "Internal Server Error")
				q.Set("message", err.Error())
				q.Set("path", c.Request().URL.Path)

				return c.Redirect(http.StatusFound, "/error?"+q.Encode())
			} else if len(fns) < 1 {
				q := make(url.Values)
				q.Set("status", strconv.Itoa(http.StatusNotFound))
				q.Set("error", "Not Found")
				q.Set("message", "No flights found matching your search. Only prefix search is supported.")
				q.Set("path", c.Request().URL.Path)

				return c.Redirect(http.StatusFound, "/error?"+q.Encode())
			} else if len(fns) > 1 {
				q := make(url.Values)
				for _, fn := range fns {
					q.Add("v", fn.String())
				}

				return c.Redirect(http.StatusFound, "/flight?"+q.Encode())
			}

			return c.Redirect(http.StatusFound, "/flight/"+url.PathEscape(fns[0].String()))
		}
	}
}
