package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func addAccessControlHeaders(h http.Header) {
	h.Set("Access-Control-Allow-Origin", AllowOrigin)
	h.Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	h.Set("Access-Control-Allow-Headers", "*")
	h.Set("Access-Control-Allow-Credentials", "true")
	h.Set("Access-Control-Max-Age", "86400")
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	mux := http.NewServeMux()
	mux.HandleFunc("OPTIONS /", func(w http.ResponseWriter, req *http.Request) {
		addAccessControlHeaders(w.Header())
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /milesandmore/", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), time.Second*15)
		defer cancel()

		if req.Body != nil {
			defer req.Body.Close()
		}

		outurl := "https://api.miles-and-more.com"
		outurl += strings.TrimPrefix(req.URL.EscapedPath(), "/milesandmore")
		if req.URL.RawQuery != "" {
			outurl += "?"
			outurl += req.URL.RawQuery
		}

		outreq, err := http.NewRequestWithContext(ctx, req.Method, outurl, req.Body)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(err.Error()))
			return
		}

		for k, v := range req.Header {
			if strings.EqualFold(k, "user-agent") || strings.EqualFold(k, "accept") || strings.EqualFold(k, "x-api-key") {
				outreq.Header[k] = v
			}
		}

		outreq.Header.Set("Origin", "https://www.miles-and-more.com")
		outreq.Header.Set("Referer", "https://www.miles-and-more.com/")

		proxyresp, err := http.DefaultClient.Do(outreq)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				w.WriteHeader(http.StatusRequestTimeout)
			} else {
				w.WriteHeader(http.StatusBadGateway)
			}

			_, _ = w.Write([]byte(err.Error()))
			return
		}

		defer proxyresp.Body.Close()

		if contentType := proxyresp.Header.Get("Content-Type"); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		addAccessControlHeaders(w.Header())

		w.WriteHeader(proxyresp.StatusCode)
		_, _ = io.Copy(w, proxyresp.Body)
	})

	if err := run(ctx, &http.Server{Addr: "127.0.0.1:8090", Handler: mux}); err != nil {
		panic(err)
	}
}

func run(ctx context.Context, srv *http.Server) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go func() {
		<-ctx.Done()
		if err := srv.Shutdown(context.Background()); err != nil {
			slog.Error("error shutting down the echo server", slog.String("err", err.Error()))
		}
	}()

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
