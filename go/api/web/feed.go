package web

import (
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
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
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		departureDate, err := xtime.ParseLocalDate(departureDateRaw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
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
			return echo.NewHTTPError(http.StatusInternalServerError)
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
				return echo.NewHTTPError(http.StatusNotFound)
			} else {
				return echo.NewHTTPError(http.StatusInternalServerError)
			}
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

func NewAllegrisUpdateFeedEndpointV2(db *db.Database, suffix string) echo.HandlerFunc {
	const (
		feedId                                 = "https://explore.flights/allegris"
		lhAirlineId                            = "2b4939f8-710c-40de-88b5-3990b8d27d37"
		allegrisAircraftType                   = "359"
		allegrisAircraftConfigurationNoFirst   = "C38E24M201"
		allegrisAircraftConfigurationWithFirst = "F4C38E24M201"
	)

	return func(c echo.Context) error {
		ctx := c.Request().Context()
		conn, err := db.Conn(ctx)
		if err != nil {
			noCache(c)
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}
		defer conn.Close()

		rows, err := conn.QueryContext(
			ctx,
			`
WITH lh_history AS (
    SELECT *
    FROM flight_variant_history
    WHERE airline_id = ?
), lh_allegris_fns AS (
    SELECT
        fvh.airline_id,
        fvh.number,
        fvh.suffix,
        fvh.departure_airport_id,
        fvh.departure_date_local,
        MIN(fvh.created_at) AS allegris_since
    FROM lh_history fvh
    INNER JOIN flight_variants fv
    ON fvh.flight_variant_id = fv.id
    INNER JOIN aircraft_identifiers aid
    ON fv.aircraft_id = aid.aircraft_id
    WHERE aid.issuer = 'iata'
    AND aid.identifier = ?
    AND fv.aircraft_configuration_version IN (?, ?)
    GROUP BY
        fvh.airline_id,
        fvh.number,
        fvh.suffix,
        fvh.departure_airport_id,
        fvh.departure_date_local
)
SELECT
    fvh.number,
    fvh.suffix,
    fv.aircraft_configuration_version
FROM lh_history fvh
INNER JOIN lh_allegris_fns fns
ON fvh.airline_id = fns.airline_id
AND fvh.number = fns.number
AND fvh.suffix = fns.suffix
AND fvh.departure_airport_id = fns.departure_airport_id
AND fvh.departure_date_local = fns.departure_date_local
AND fvh.created_at >= fns.allegris_since
LEFT JOIN flight_variants fv
ON fvh.flight_variant_id = fv.id
GROUP BY
    fvh.number,
    fvh.suffix,
    fvh.aircraft_configuration_version
`,
			lhAirlineId,
			allegrisAircraftType,
			allegrisAircraftConfigurationNoFirst,
			allegrisAircraftConfigurationWithFirst,
		)
		if err != nil {
			noCache(c)
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}
		defer rows.Close()

		count := 0
		for rows.Next() {
			count++
		}

		println(count)

		addExpirationHeaders(c, time.Now(), time.Minute*15)

		return nil
	}
}
