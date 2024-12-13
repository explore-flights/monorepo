package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Proxy struct {
	prefix     string
	httpClient *http.Client
	init       *atomic.Bool
	mtx        *sync.Mutex
}

func NewProxy(prefix string) (*Proxy, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}

	httpClient := &http.Client{
		Jar: jar,
	}

	return &Proxy{
		prefix:     prefix,
		httpClient: httpClient,
		init:       new(atomic.Bool),
		mtx:        new(sync.Mutex),
	}, nil
}

func (p *Proxy) ensureInit(ctx context.Context, inReq *http.Request) error {
	if p.init.Load() {
		return nil
	}

	req, err := p.prepareRequest(ctx, inReq, http.MethodGet, "https://www.miles-and-more.com/de/de/spend/flights/flight-award.html", nil)
	if err != nil {
		return err
	}

	resp, err := p.doRequest(req)
	if err != nil {
		return err
	}

	_ = resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	p.init.Store(true)
	slog.Info("proxy initialized")
	return nil
}

func (p *Proxy) prepareRequest(ctx context.Context, inReq *http.Request, method, url string, body io.Reader) (*http.Request, error) {
	outReq, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}

	if inReq != nil {
		proxyHeaders := []string{
			"user-agent",
			"accept",
			"accept-encoding",
			"accept-language",
			"content-type",
			"content-length",
			"cache-control",
			"pragma",
			"x-api-key",
			"rtw",
		}

		for _, h := range proxyHeaders {
			value := inReq.Header.Get(h)
			if value != "" {
				outReq.Header.Set(h, value)
			}
		}

		outReq.URL.RawQuery = inReq.URL.RawQuery
	}

	outReq.Header.Set("Origin", "https://www.miles-and-more.com")
	outReq.Header.Set("Referer", "https://www.miles-and-more.com/")

	if outReq.Header.Get("User-Agent") == "" {
		outReq.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	}

	return outReq, nil
}

func (p *Proxy) doRequest(r *http.Request) (*http.Response, error) {
	slog.Debug(
		"sending proxy request",
		slog.String("method", r.Method),
		slog.String("url", r.URL.String()),
		slog.Any("headers", r.Header),
	)

	resp, err := p.httpClient.Do(r)
	if err == nil {
		slog.Debug("proxy request succeeded", slog.Int("status", resp.StatusCode))
	} else {
		slog.Debug("proxy request failed", slog.String("err", err.Error()))
	}

	return resp, err
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, inReq *http.Request) {
	p.mtx.Lock()
	defer p.mtx.Unlock()

	ctx, cancel := context.WithTimeout(inReq.Context(), time.Second*15)
	defer cancel()

	err := p.ensureInit(ctx, inReq)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(err.Error()))
		return
	}

	outUrl := "https://api.miles-and-more.com"
	outUrl += strings.TrimPrefix(inReq.URL.EscapedPath(), p.prefix)

	outReq, err := p.prepareRequest(ctx, inReq, inReq.Method, outUrl, inReq.Body)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(err.Error()))
		return
	}

	proxyResp, err := p.doRequest(outReq)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			w.WriteHeader(http.StatusRequestTimeout)
		} else {
			w.WriteHeader(http.StatusBadGateway)
		}

		_, _ = w.Write([]byte(err.Error()))
		return
	}

	defer proxyResp.Body.Close()

	proxyHeaders := []string{
		"content-type",
		"content-length",
		"content-encoding",
		"date",
	}

	for _, h := range proxyHeaders {
		value := proxyResp.Header.Get(h)
		if value != "" {
			w.Header().Set(h, value)
		}
	}

	addAccessControlHeaders(w.Header())

	w.WriteHeader(proxyResp.StatusCode)
	_, _ = io.Copy(w, proxyResp.Body)
}
