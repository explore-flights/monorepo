package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web"
	"github.com/gorilla/feeds"
	lwamw "github.com/its-felix/aws-lwa-go-middleware"
	"github.com/labstack/echo/v4"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	s3c, err := s3Client(ctx)
	if err != nil {
		panic(err)
	}

	bucket, err := dataBucket()
	if err != nil {
		panic(err)
	}

	authHandler, err := authorizationHandler(ctx, s3c)
	if err != nil {
		panic(err)
	}

	lhc, err := lufthansaClient()
	if err != nil {
		panic(err)
	}

	db, err := database()
	if err != nil {
		panic(err)
	}
	defer db.Close()

	fr := search.NewFlightRepo(db)

	connHandler := search.NewConnectionsHandler(fr)
	dataHandler := data.NewHandler(s3c, lhc, db, bucket)

	e := echo.New()
	e.Use(
		lwamw.EchoMiddleware(
			lwamw.WithMaskError(),
			lwamw.WithRemoveHeaders(),
		),
		authHandler.Middleware,
	)

	jsonConnEdp := web.NewConnectionsEndpoint(connHandler, "json")
	pngConnEdp := web.NewConnectionsEndpoint(connHandler, "png")

	e.POST("/api/connections/json", jsonConnEdp)
	e.GET("/api/connections/json/:payload", jsonConnEdp)
	e.POST("/api/connections/png", pngConnEdp)
	e.GET("/api/connections/png/:payload/c.png", pngConnEdp)
	e.POST("/api/connections/share", web.NewConnectionsShareCreateEndpoint())
	e.GET("/api/connections/share/:payload", web.NewConnectionsShareHTMLEndpoint())
	e.GET("/api/search", web.NewSearchEndpoint(dataHandler))
	e.GET("/api/schedule/search", web.NewQueryFlightSchedulesEndpoint(dataHandler))

	e.GET("/api/notifications", web.NewNotificationsEndpoint(s3c, bucket))

	e.HEAD("/auth/info", authHandler.AuthInfo)
	e.POST("/auth/logout", authHandler.Logout)
	e.GET("/auth/oauth2/register/:issuer", authHandler.Register)
	e.GET("/auth/oauth2/login/:issuer", authHandler.Login)
	e.GET("/auth/oauth2/code/:issuer", authHandler.Code)

	e.GET("/data/sitemap.xml", web.NewSitemapHandler(dataHandler))
	e.GET("/data/airlines.json", web.NewAirlinesEndpoint(dataHandler))
	e.GET("/data/airports.json", web.NewAirportsEndpoint(dataHandler))
	e.GET("/data/aircraft.json", web.NewAircraftEndpoint(dataHandler))
	e.GET("/data/flight/:fn", web.NewFlightNumberEndpoint(dataHandler))
	e.GET("/data/flight/:fn/seatmap/:departure/:arrival/:date/:aircraft", web.NewSeatMapEndpoint(dataHandler))
	e.GET("/data/:airline/schedule/:aircraftType/:aircraftConfigurationVersion/v3", web.NewFlightSchedulesByConfigurationEndpoint(dataHandler))
	e.GET("/data/:fn/:departureDate/:departureAirport/feed.rss", web.NewFlightUpdateFeedEndpoint(dataHandler, "application/rss+xml", (*feeds.Feed).WriteRss))
	e.GET("/data/:fn/:departureDate/:departureAirport/feed.atom", web.NewFlightUpdateFeedEndpoint(dataHandler, "application/atom+xml", (*feeds.Feed).WriteAtom))
	e.GET("/data/allegris/feed.rss", web.NewAllegrisUpdateFeedEndpoint(s3c, bucket, ".rss"))
	e.GET("/data/allegris/feed.atom", web.NewAllegrisUpdateFeedEndpoint(s3c, bucket, ".atom"))

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

	if err := e.Start(fmt.Sprintf(":%d", echoPort())); err != nil {
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	}

	return nil
}
