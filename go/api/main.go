package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/data"
	"github.com/explore-flights/monorepo/go/api/search"
	"github.com/explore-flights/monorepo/go/api/web"
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

	fr, err := flightRepo(ctx, s3c, bucket)
	if err != nil {
		panic(err)
	}

	authHandler, err := authorizationHandler(ctx, s3c)
	if err != nil {
		panic(err)
	}

	connHandler := search.NewConnectionsHandler(fr)
	dataHandler := data.NewHandler(s3c, bucket)

	e := echo.New()
	e.Use(authHandler.Middleware)

	e.POST("/api/connections/json", web.NewConnectionsEndpoint(connHandler, "json"))
	e.GET("/api/connections/json/:payload", web.NewConnectionsEndpoint(connHandler, "json"))
	e.GET("/api/connections/png/:payload/c.png", web.NewConnectionsEndpoint(connHandler, "png"))
	e.POST("/api/connections/share", web.NewConnectionsShareCreateEndpoint())
	e.GET("/api/connections/share/:payload", web.NewConnectionsShareHTMLEndpoint())

	e.HEAD("/auth/info", authHandler.AuthInfo)
	e.POST("/auth/logout", authHandler.Logout)
	e.GET("/auth/oauth2/register/:issuer", authHandler.Register)
	e.GET("/auth/oauth2/login/:issuer", authHandler.Login)
	e.GET("/auth/oauth2/code/:issuer", authHandler.Code)

	e.GET("/data/airports.json", web.NewAirportsHandler(dataHandler))
	e.GET("/data/aircraft.json", web.NewAircraftHandler(dataHandler))

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
