package main

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"github.com/labstack/echo/v4"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
)

var port int

func init() {
	port, _ = strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	port = cmp.Or(port, 8080)
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	e := echo.New()
	e.Any("/*", func(c echo.Context) error {
		c.Response().Header().Set(echo.HeaderContentType, echo.MIMETextPlainCharsetUTF8)
		c.Response().WriteHeader(http.StatusOK)

		return c.Request().Header.Write(c.Response())
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
