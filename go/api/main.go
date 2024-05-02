package main

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/labstack/echo/v4"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

var port int
var dataBucket string

func init() {
	port, _ = strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	port = cmp.Or(port, 8080)

	dataBucket = os.Getenv("FLIGHTS_DATA_BUCKET")
	if dataBucket == "" {
		panic("env variable FLIGHTS_DATA_BUCKET required")
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	s3c := s3.NewFromConfig(cfg)
	fr := search.NewFlightRepo(s3c, dataBucket)
	handler := search.NewConnectionsHandler(fr)

	e := echo.New()
	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "Hello world!")
	})

	e.GET("/connections/:export", func(c echo.Context) error {
		ctx := c.Request().Context()

		origin := c.QueryParam("origin")
		destination := c.QueryParam("destination")
		minDeparture, err := time.Parse(time.RFC3339, c.QueryParam("minDeparture"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxDeparture, err := time.Parse(time.RFC3339, c.QueryParam("maxDeparture"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxFlights, err := strconv.Atoi(c.QueryParam("maxFlights"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		minLayover, err := time.ParseDuration(c.QueryParam("minLayover"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxLayover, err := time.ParseDuration(c.QueryParam("maxLayover"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		maxDuration, err := time.ParseDuration(c.QueryParam("maxDuration"))
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err)
		}

		if maxFlights > 4 {
			return echo.NewHTTPError(http.StatusBadRequest, "maxFlights must be <=4")
		} else if maxDeparture.Add(maxDuration).Sub(minDeparture) > time.Hour*24*14 {
			return echo.NewHTTPError(http.StatusBadRequest, "range must be <=14d")
		}

		conns, err := handler.FindConnections(
			ctx,
			origin,
			destination,
			minDeparture,
			maxDeparture,
			maxFlights,
			minLayover,
			maxLayover,
			maxDuration,
		)

		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return echo.NewHTTPError(http.StatusRequestTimeout, err)
			}

			return echo.NewHTTPError(http.StatusInternalServerError)
		}

		c.Response().Header().Set(echo.HeaderContentType, echo.MIMETextPlainCharsetUTF8)
		c.Response().WriteHeader(http.StatusOK)

		switch c.Param("export") {
		case "dot":
			return search.ExportConnectionsImage(c.Response(), conns)

		default:
			return search.ExportConnectionsText(c.Response(), conns)
		}
	})

	if err := run(ctx, e); err != nil {
		panic(err)
	}
}

func run(ctx context.Context, e *echo.Echo) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go func() {
		<-ctx.Done()
		if err := e.Shutdown(context.Background()); err != nil {
			slog.Error("error shutting down the echo server", slog.String("err", err.Error()))
		}
	}()

	if err := e.Start(fmt.Sprintf(":%d", port)); err != nil {
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	}

	return nil
}
