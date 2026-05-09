package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/explore-flights/monorepo/go/api/business/connections"
	"github.com/explore-flights/monorepo/go/api/business/raw"
	"github.com/explore-flights/monorepo/go/api/business/schedulesearch"
	"github.com/explore-flights/monorepo/go/api/business/seatmap"
	"github.com/explore-flights/monorepo/go/api/config"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web"
	lwamw "github.com/its-felix/aws-lwa-go-middleware"
	"github.com/labstack/echo/v4"
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

	lhc, err := config.Config.LufthansaClient()
	if err != nil {
		panic(err)
	}

	database, err := config.Config.Database()
	if err != nil {
		panic(err)
	}
	defer database.Close()

	version, err := config.Config.Version()
	if err != nil {
		panic(err)
	}

	fr := db.NewFlightRepo(database)
	connSearch := connections.NewSearch(fr)
	sshHandler := web.NewScheduleSearchHandler(fr, schedulesearch.NewSearch(fr))

	e := echo.New()
	defer e.Close()
	e.Use(
		lwamw.EchoMiddleware(
			lwamw.WithMaskError(),
			lwamw.WithRemoveHeaders(),
		),
		web.ErrorLogAndMaskMiddleware(log.New(os.Stderr, "", log.Ldate|log.Ltime|log.Lmicroseconds|log.Lshortfile)),
		web.RecoverMiddleware(),
		web.VersionHeaderMiddleware(version),
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

		gameHandler := web.NewGameHandler(fr)
		group.GET("/game/connection", gameHandler.ConnectionGame)

		notificationHandler := web.NewNotificationHandler(version)
		group.GET("/notifications", notificationHandler.Notifications)
	}

	{
		group := e.Group("/data")

		dh := web.NewDataHandler(fr, seatmap.NewSearch(s3c, bucket, fr, lhc), raw.NewSearch(s3c, bucket))
		group.GET("/airlines.json", dh.Airlines)
		group.GET("/airports.json", dh.Airports)
		group.GET("/aircraft.json", dh.Aircraft)
		group.GET("/flight/:fn", dh.FlightSchedule)
		group.GET("/flight/:fn/:version", dh.FlightSchedule)
		group.GET("/flight/:fn/versions/:departureAirport/:departureDateLocal", dh.FlightScheduleVersions)
		group.GET("/flight/:fn/versions/:departureAirport/:departureDateLocal/feed.rss", dh.FlightScheduleVersionsRSSFeed)
		group.GET("/flight/:fn/versions/:departureAirport/:departureDateLocal/feed.atom", dh.FlightScheduleVersionsAtomFeed)
		group.GET("/flight/:fn/:version/:departureAirport/:departureDateLocal/raw.json", dh.FlightScheduleVersionRaw)
		group.GET("/flight/:fn/seatmap/:departureAirport/:departureDateLocal", dh.SeatMap)
		group.GET("/destinations/:departureAirport", dh.Destinations)
		group.GET("/schedule/allegris", sshHandler.Allegris)
		group.GET("/schedule/allegris/feed.rss", sshHandler.AllegrisRSSFeed)
		group.GET("/schedule/allegris/feed.atom", sshHandler.AllegrisAtomFeed)
		group.GET("/schedule/swiss350", sshHandler.SwissA350)
		group.GET("/schedule/swiss350/feed.rss", sshHandler.SwissA350RSSFeed)
		group.GET("/schedule/swiss350/feed.atom", sshHandler.SwissA350AtomFeed)
		group.GET("/schedule/lh380", sshHandler.LHA380)
		group.GET("/schedule/lh340", sshHandler.LHA340)
		group.GET("/schedule/lh747", sshHandler.LH747)

		// region deprecated feed endpoints
		group.GET("/:fn/:departureDate/:departureAirport/feed.rss", dh.LegacyFlightScheduleVersionsRSSFeed)
		group.GET("/:fn/:departureDate/:departureAirport/feed.atom", dh.LegacyFlightScheduleVersionsAtomFeed)
		// endregion

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
