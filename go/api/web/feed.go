package web

import (
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/explore-flights/monorepo/go/common/xiter"
	"github.com/explore-flights/monorepo/go/common/xtime"
	"github.com/gorilla/feeds"
	"github.com/labstack/echo/v4"
	"io"
	"maps"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

func NewFlightUpdateFeedEndpoint(dh *data.Handler, contentType string, writer func(*feeds.Feed, io.Writer) error) echo.HandlerFunc {
	buildFeedId := func(fn common.FlightNumber, departureDateUtc xtime.LocalDate, departureAirport string) string {
		q := make(url.Values)
		q.Set("departure_airport", departureAirport)
		q.Set("departure_date_utc", departureDateUtc.String())

		return fmt.Sprintf("https://explore.flights/flight/%s?%s", fn.String(), q.Encode())
	}

	buildFeedContent := func(f *common.Flight) string {
		content := fmt.Sprintf(
			`
Flight %s from %s to %s
Departure: %s
Arrival: %s
Aircraft: %s (%s)
Codeshares: %+v
`,
			f.Number().String(),
			f.DepartureAirport,
			f.ArrivalAirport,
			f.DepartureTime.Format(time.RFC3339),
			f.ArrivalTime.Format(time.RFC3339),
			f.AircraftType,
			f.AircraftConfigurationVersion,
			strings.Join(slices.Sorted(xiter.Map(maps.Keys(f.CodeShares), common.FlightNumber.String)), ", "),
		)

		return strings.TrimSpace(content)
	}

	return func(c echo.Context) error {
		fnRaw := c.Param("fn")
		departureDateRaw := c.Param("departureDate")
		departureAirport := strings.ToUpper(c.Param("departureAirport"))

		fn, err := common.ParseFlightNumber(fnRaw)
		if err != nil {
			return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
		}

		departureDate, err := xtime.ParseLocalDate(departureDateRaw)
		if err != nil {
			return NewHTTPError(http.StatusBadRequest, WithCause(err), WithUnmaskedCause())
		}

		feedId := buildFeedId(fn, departureDate, departureAirport)
		link := &feeds.Link{
			Href: feedId,
			Rel:  "alternate",
			Type: "text/html",
		}

		feed := &feeds.Feed{
			Id:    feedId,
			Title: fmt.Sprintf("Flight %s from %s on %s (UTC)", fn.String(), departureAirport, departureDate.String()),
			Link:  link,
		}

		f, lastModified, err := dh.Flight(c.Request().Context(), fn, departureDate, departureAirport, true)
		if err != nil {
			return err
		}

		if f == nil {
			created := time.Date(2024, time.May, 1, 0, 0, 0, 0, time.UTC)

			feed.Created = created
			feed.Updated = lastModified
			feed.Items = append(feed.Items, &feeds.Item{
				Id:          feedId,
				IsPermaLink: "false",
				Title:       "Flight no longer available",
				Link:        link,
				Created:     created,
				Updated:     lastModified,
				Content:     "The flight is no longer available",
				Description: "The flight is no longer available",
			})
		} else {
			feed.Created = f.Metadata.CreationTime
			feed.Updated = f.Metadata.UpdateTime

			content := buildFeedContent(f)
			feed.Items = append(feed.Items, &feeds.Item{
				Id:          feedId,
				IsPermaLink: "false",
				Title:       fmt.Sprintf("Flight %s from %s to %s on %s (local) updated", fn.String(), f.DepartureAirport, f.ArrivalAirport, f.DepartureTime.Format(time.DateOnly)),
				Link:        link,
				Created:     f.Metadata.CreationTime,
				Updated:     f.Metadata.UpdateTime,
				Content:     content,
				Description: content,
			})
		}

		c.Response().Header().Add(echo.HeaderContentType, contentType)
		addExpirationHeaders(c, time.Now(), time.Hour)

		_ = writer(feed, c.Response())
		return nil
	}
}

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
