package web

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/labstack/echo/v4"
	"net/http"
	"strings"
)

func NewSearchEndpoint(s3c adapt.S3Lister, bucket string) echo.HandlerFunc {
	const schedulesPrefix = "processed/schedules/"

	return func(c echo.Context) error {
		query := strings.ToUpper(c.QueryParam("q"))
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
			return echo.NewHTTPError(http.StatusInternalServerError)
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

		return c.JSON(http.StatusOK, fns)
	}
}
