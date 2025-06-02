package web

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/labstack/echo/v4"
	"net/http"
	"time"
)

func NewAllegrisUpdateFeedEndpoint(s3c adapt.S3Getter, bucket, suffix string) echo.HandlerFunc {
	return func(c echo.Context) error {
		resp, err := s3c.GetObject(c.Request().Context(), &s3.GetObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String("processed/feed/allegris/feed" + suffix),
		})

		if err != nil {
			noCache(c)

			if adapt.IsS3NotFound(err) {
				return NewHTTPError(http.StatusNotFound, WithCause(err))
			}

			return err
		}

		defer resp.Body.Close()

		contentType := echo.MIMEOctetStream
		if resp.ContentType != nil {
			contentType = *resp.ContentType
		}

		addExpirationHeaders(c, time.Now(), time.Minute*15)

		return c.Stream(http.StatusOK, contentType, resp.Body)
	}
}
