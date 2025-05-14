package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/db"
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

	database, err := database()
	if err != nil {
		panic(err)
	}
	defer database.Close()

	fr := db.NewFlightRepo(database)

	connHandler := search.NewConnectionsHandler(fr)
	dataHandler := data.NewHandler(s3c, lhc, database, bucket)

	e := echo.New()
	e.Use(
		lwamw.EchoMiddleware(
			lwamw.WithMaskError(),
			lwamw.WithRemoveHeaders(),
		),
		web.NoCacheOnErrorMiddleware(),
		authHandler.Middleware,
	)

	{
		group := e.Group("/api")

		connWebHandler := web.NewConnectionsHandler(fr, connHandler)
		group.POST("/connections/json", connWebHandler.ConnectionsJSON)
		group.GET("/connections/json/:payload", connWebHandler.ConnectionsJSON)
		group.POST("/connections/png", connWebHandler.ConnectionsPNG)
		group.GET("/connections/png/:payload/c.png", connWebHandler.ConnectionsPNG)
		group.POST("/connections/share", connWebHandler.ConnectionsShareCreate)
		group.GET("/connections/share/:payload", connWebHandler.ConnectionsShareHTML)

		searchHandler := web.NewSearchHandler(fr)
		group.GET("/search", searchHandler.Search)

		group.GET("/schedule/search", web.NewQueryFlightSchedulesEndpoint(fr, dataHandler))

		notificationHandler := web.NewNotificationHandler(versionTxtPath())
		group.GET("/notifications", notificationHandler.Notifications)
	}

	{
		group := e.Group("/auth", web.NeverCacheMiddleware())
		group.HEAD("/info", authHandler.AuthInfo)
		group.POST("/logout", authHandler.Logout)
		group.GET("/oauth2/register/:issuer", authHandler.Register)
		group.GET("/oauth2/login/:issuer", authHandler.Login)
		group.GET("/oauth2/code/:issuer", authHandler.Code)
	}

	{
		group := e.Group("/data")

		dh := web.NewDataHandler(fr, dataHandler)
		group.GET("/airlines.json", dh.Airlines)
		group.GET("/airports.json", dh.Airports)
		group.GET("/aircraft.json", dh.Aircraft)
		group.GET("/flight/:fn", dh.FlightSchedule)
		group.GET("/flight/:fn/:version", dh.FlightSchedule)
		group.GET("/flight/:fn/seatmap/:departure/:arrival/:date/:aircraft", web.NewSeatMapEndpoint(dataHandler))
		group.GET("/:airline/schedule/:aircraftType/:aircraftConfigurationVersion/v3", web.NewFlightSchedulesByConfigurationEndpoint(dataHandler))
		group.GET("/:fn/:departureDate/:departureAirport/feed.rss", web.NewFlightUpdateFeedEndpoint(dataHandler, "application/rss+xml", (*feeds.Feed).WriteRss))
		group.GET("/:fn/:departureDate/:departureAirport/feed.atom", web.NewFlightUpdateFeedEndpoint(dataHandler, "application/atom+xml", (*feeds.Feed).WriteAtom))
		group.GET("/allegris/feed.rss", web.NewAllegrisUpdateFeedEndpoint(s3c, bucket, ".rss"))
		group.GET("/allegris/feed.atom", web.NewAllegrisUpdateFeedEndpoint(s3c, bucket, ".atom"))
		// group.GET("/allegris/v2/feed.rss", web.NewAllegrisUpdateFeedEndpointV2(database, ".rss"))
		// group.GET("/allegris/v2/feed.atom", web.NewAllegrisUpdateFeedEndpointV2(database, ".atom"))

		sitemapHandler := web.NewSitemapHandler(fr)
		group.GET("/sitemap.xml", sitemapHandler.SitemapIndex)
		group.GET("/sitemap/:airlineId/sitemap.xml", sitemapHandler.SitemapAirline)
	}

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
