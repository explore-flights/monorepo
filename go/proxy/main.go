package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	p, err := NewProxy("/milesandmore")
	if err != nil {
		panic(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("OPTIONS /", func(w http.ResponseWriter, req *http.Request) {
		addAccessControlHeaders(w.Header())
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /ping", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		addAccessControlHeaders(w.Header())
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("github.com/explore-flights/monorepo/go/proxy"))
	})

	mux.Handle("POST /milesandmore/", p)

	if err = run(ctx, mux); err != nil {
		panic(err)
	}

	slog.Info("proxy stopped")
}

func run(ctx context.Context, handler http.Handler) error {
	const addr = "127.0.0.1:8090"

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	l, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	slog.Info("proxy ready to accept connections", slog.String("addr", addr))

	go func() {
		<-ctx.Done()
		if err := l.Close(); err != nil {
			slog.Error("error shutting down the http server", slog.String("err", err.Error()))
		}
	}()

	if err := http.Serve(l, handler); err != nil && !errors.Is(err, net.ErrClosed) {
		return err
	}

	return nil
}
