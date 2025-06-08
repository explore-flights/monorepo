package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/business/connections"
	"github.com/explore-flights/monorepo/go/api/business/report"
	"github.com/explore-flights/monorepo/go/api/business/schedulesearch"
	"github.com/explore-flights/monorepo/go/api/business/seatmap"
	"github.com/explore-flights/monorepo/go/api/config"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web"
	lwamw "github.com/its-felix/aws-lwa-go-middleware"
	"github.com/labstack/echo/v4"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	s3c, err := config.Config.S3Client(ctx)
	if err != nil {
		panic(err)
	}

	bucket, err := config.Config.DataBucket()
	if err != nil {
		panic(err)
	}

	/*
		authHandler, err := authorizationHandler(ctx, s3c)
		if err != nil {
			panic(err)
		}
	*/

	lhc, err := config.Config.LufthansaClient()
	if err != nil {
		panic(err)
	}

	database, err := config.Config.Database()
	if err != nil {
		panic(err)
	}
	defer database.Close()

	fr := db.NewFlightRepo(database)
	connSearch := connections.NewSearch(fr)
	sshHandler := web.NewScheduleSearchHandler(fr, schedulesearch.NewSearch(fr))

	e := echo.New()
	e.Use(
		lwamw.EchoMiddleware(
			lwamw.WithMaskError(),
			lwamw.WithRemoveHeaders(),
		),
		web.ErrorLogAndMaskMiddleware(log.New(os.Stderr, "", log.Ldate|log.Ltime|log.Lmicroseconds|log.Lshortfile)),
		web.VersionHeaderMiddleware(config.Config.VersionTxtPath()),
		web.NoCacheOnErrorMiddleware(),
		// authHandler.Middleware,
	)

	{
		group := e.Group("/api")

		connWebHandler := web.NewConnectionsHandler(fr, connSearch)
		group.POST("/connections/json", connWebHandler.ConnectionsJSON)
		group.GET("/connections/json/:payload", connWebHandler.ConnectionsJSON)
		group.POST("/connections/png", connWebHandler.ConnectionsPNG)
		group.GET("/connections/png/:payload/c.png", connWebHandler.ConnectionsPNG)
		group.POST("/connections/share", connWebHandler.ConnectionsShareCreate)
		group.GET("/connections/share/:payload", connWebHandler.ConnectionsShareHTML)

		searchHandler := web.NewSearchHandler(fr)
		group.GET("/search", searchHandler.Search)

		group.GET("/schedule/search", sshHandler.Query)

		notificationHandler := web.NewNotificationHandler(config.Config.VersionTxtPath())
		group.GET("/notifications", notificationHandler.Notifications)
	}

	/*
		{
			group := e.Group("/auth", web.NeverCacheMiddleware())
			group.HEAD("/info", authHandler.AuthInfo)
			group.POST("/logout", authHandler.Logout)
			group.GET("/oauth2/register/:issuer", authHandler.Register)
			group.GET("/oauth2/login/:issuer", authHandler.Login)
			group.GET("/oauth2/code/:issuer", authHandler.Code)
		}
	*/

	{
		group := e.Group("/data")

		dh := web.NewDataHandler(fr, seatmap.NewSearch(s3c, bucket, fr, lhc))
		group.GET("/airlines.json", dh.Airlines)
		group.GET("/airports.json", dh.Airports)
		group.GET("/aircraft.json", dh.Aircraft)
		group.GET("/flight/:fn", dh.FlightSchedule)
		group.GET("/flight/:fn/:version", dh.FlightSchedule)
		group.GET("/flight/:fn/versions/:departureAirport/:departureDateLocal", dh.FlightScheduleVersions)
		group.GET("/flight/:fn/versions/:departureAirport/:departureDateLocal/feed.rss", dh.FlightScheduleVersionsRSSFeed)
		group.GET("/flight/:fn/versions/:departureAirport/:departureDateLocal/feed.atom", dh.FlightScheduleVersionsAtomFeed)
		group.GET("/flight/:fn/seatmap/:departureAirport/:departureDateLocal", dh.SeatMap)
		group.GET("/schedule/allegris", sshHandler.Allegris)
		group.GET("/schedule/allegris/feed.rss", sshHandler.AllegrisRSSFeed)
		group.GET("/schedule/allegris/feed.atom", sshHandler.AllegrisAtomFeed)
		group.GET("/allegris/feed.rss", sshHandler.AllegrisRSSFeed)
		group.GET("/allegris/feed.atom", sshHandler.AllegrisAtomFeed)

		// deprecated feed endpoints
		group.GET("/:fn/:departureDate/:departureAirport/feed.rss", dh.LegacyFlightScheduleVersionsRSSFeed)
		group.GET("/:fn/:departureDate/:departureAirport/feed.atom", dh.LegacyFlightScheduleVersionsAtomFeed)

		reportHandler := web.NewReportHandler(fr, report.NewSearch(fr))
		group.GET("/destinations/:airport", reportHandler.Destinations)
		group.GET("/destinations/:airport/:year", reportHandler.Destinations)
		group.GET("/destinations/:airport/:year/:schedule", reportHandler.Destinations)
		group.GET("/aircraft/:airport", reportHandler.Aircraft)
		group.GET("/aircraft/:airport/:year", reportHandler.Aircraft)
		group.GET("/aircraft/:airport/:year/:schedule", reportHandler.Aircraft)

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

	if err := e.Start(fmt.Sprintf(":%d", config.Config.EchoPort())); err != nil {
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}

		return err
	}

	return nil
}
