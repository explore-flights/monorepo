package lufthansa

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/common"
	"github.com/explore-flights/monorepo/go/cron/oauth2"
	"golang.org/x/time/rate"
	"io"
	"maps"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type responseStatusErr struct {
	StatusCode int
	Status     string
}

func (e responseStatusErr) Error() string {
	return e.Status
}

type credentials struct {
	token string
	exp   time.Time
}

type Client struct {
	httpClient   *http.Client
	oauth2Client *oauth2.Client
	limiter      *rate.Limiter
	mtx          *sync.Mutex
	cred         atomic.Pointer[credentials]
	baseUrl      string
	leeway       time.Duration
}

type ClientOption func(c *Client)

func WithHttpClient(httpClient *http.Client) ClientOption {
	return func(c *Client) {
		c.httpClient = httpClient
	}
}

func WithRateLimiter(limiter *rate.Limiter) ClientOption {
	return func(c *Client) {
		c.limiter = limiter
	}
}

func WithBaseUrl(baseUrl string) ClientOption {
	return func(c *Client) {
		c.baseUrl = baseUrl
	}
}

func WithLeeway(leeway time.Duration) ClientOption {
	return func(c *Client) {
		c.leeway = leeway
	}
}

func NewClient(clientId, clientSecret string, opts ...ClientOption) *Client {
	c := &Client{
		mtx: new(sync.Mutex),
	}

	for _, opt := range opts {
		opt(c)
	}

	c.httpClient = cmp.Or(c.httpClient, http.DefaultClient)
	c.baseUrl = cmp.Or(c.baseUrl, "https://api.lufthansa.com")
	c.leeway = cmp.Or(c.leeway, time.Second*15)
	c.oauth2Client = oauth2.NewClient(
		c.baseUrl+"/v1/oauth/token",
		clientId,
		clientSecret,
		oauth2.WithHttpClient(c.httpClient),
		oauth2.WithRateLimiter(c.limiter),
	)

	return c
}

func (c *Client) token(ctx context.Context) (string, error) {
	cred := c.cred.Load()
	if cred != nil && cred.exp.After(time.Now()) {
		return cred.token, nil
	}

	c.mtx.Lock()
	defer c.mtx.Unlock()

	cred = c.cred.Load()
	if cred != nil && cred.exp.After(time.Now()) {
		return cred.token, nil
	}

	if err := c.limiter.Wait(ctx); err != nil {
		return "", err
	}

	res, err := c.oauth2Client.ClientCredentials(ctx)
	if err != nil {
		return "", err
	}

	cred = &credentials{
		token: res.AccessToken,
		exp:   time.Now().Add(time.Duration(res.ExpiresIn) * time.Second).Add(-c.leeway),
	}
	c.cred.Store(cred)

	return cred.token, nil
}

func (c *Client) doRequest(ctx context.Context, method, surl string, q url.Values, body io.Reader) (*http.Response, error) {
	token, err := c.token(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, surl, body)
	if err != nil {
		return nil, err
	}

	if q != nil {
		fullQuery := req.URL.Query()
		maps.Copy(fullQuery, q)
		req.URL.RawQuery = fullQuery.Encode()
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	if c.limiter != nil {
		if err = c.limiter.Wait(ctx); err != nil {
			return nil, err
		}
	}

	return c.httpClient.Do(req)
}

func doRequest[T any](ctx context.Context, c *Client, method, path string, q url.Values, body io.Reader) (T, error) {
	var r T

	resp, err := c.doRequest(ctx, method, c.baseUrl+path, q, body)
	if err != nil {
		return r, err
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return r, responseStatusErr{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
		}
	}

	return r, json.NewDecoder(resp.Body).Decode(&r)
}

func (c *Client) Countries(ctx context.Context) ([]Country, error) {
	return doRequestPaged[countryResource](ctx, c, http.MethodGet, "/v1/mds-references/countries", nil, 100)
}

func (c *Client) Cities(ctx context.Context) ([]City, error) {
	return doRequestPaged[cityResource](ctx, c, http.MethodGet, "/v1/mds-references/cities", nil, 100)
}

func (c *Client) Airport(ctx context.Context, airportCode string) (Airport, error) {
	return doRequest[Airport](ctx, c, http.MethodGet, "/v1/mds-references/airports/"+url.PathEscape(airportCode), nil, nil)
}

func (c *Client) Airports(ctx context.Context) ([]Airport, error) {
	return doRequestPaged[airportResource](ctx, c, http.MethodGet, "/v1/mds-references/airports", nil, 100)
}

func (c *Client) Airlines(ctx context.Context) ([]Airline, error) {
	return doRequestPaged[airlineResource](ctx, c, http.MethodGet, "/v1/mds-references/airlines", nil, 100)
}

func (c *Client) Aircraft(ctx context.Context) ([]Aircraft, error) {
	return doRequestPaged[aircraftResource](ctx, c, http.MethodGet, "/v1/mds-references/aircraft", nil, 100)
}

func (c *Client) FlightSchedules(ctx context.Context, airlines []common.AirlineIdentifier, startDate, endDate common.LocalDate, daysOfOperation []time.Weekday, options ...FlightSchedulesOption) ([]FlightSchedule, error) {
	options = append(options, WithAirlines(airlines))
	options = append(options, WithStartDate(startDate))
	options = append(options, WithEndDate(endDate))
	options = append(options, WithDaysOfOperation(daysOfOperation))

	q := make(url.Values)
	for _, opt := range options {
		opt.Apply(q)
	}

	q.Set("timeMode", "UTC")

	const maxRetries = 5
	errs := make([]error, 0, maxRetries)

	for len(errs) < maxRetries {
		r, err := doRequest[[]FlightSchedule](ctx, c, http.MethodGet, "/v1/flight-schedules/flightschedules/passenger", q, nil)
		if err != nil {
			var statusErr responseStatusErr
			if errors.As(err, &statusErr) && isBadElementStatus(statusErr.StatusCode) {
				errs = append(errs, err)
				continue
			}

			return nil, err
		}

		return r, nil
	}

	return nil, errors.Join(errs...)
}

func doRequestPaged[T pagedResource[D], D any](ctx context.Context, c *Client, method, path string, q url.Values, pageSize int) ([]D, error) {
	var results []D
	surl := c.baseUrl + path
	nextPageOffset := 0
	hasNextPage := true
	var err error

	for hasNextPage {
		if results, nextPageOffset, hasNextPage, err = doRequestPage[T, D](ctx, c, method, surl, q, pageSize, nextPageOffset, results); err != nil {
			return nil, err
		}
	}

	return results, nil
}

func doRequestPage[T pagedResource[D], D any](ctx context.Context, c *Client, method, surl string, q url.Values, pageSize, offset int, results []D) ([]D, int, bool, error) {
	if q == nil {
		q = make(url.Values)
	} else {
		q = maps.Clone(q)
	}

	q.Set("limit", strconv.Itoa(pageSize))
	q.Set("offset", strconv.Itoa(offset))

	const maxRetries = 5
	errs := make([]error, 0, maxRetries)

	for {
		resp, err := c.doRequest(ctx, method, surl, q, nil)
		if err != nil {
			return results, 0, false, err
		}

		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			_ = resp.Body.Close()

			if pageSize > 1 && isBadElementStatus(resp.StatusCode) {
				var statusErr responseStatusErr

				subPageSizeLeft := pageSize / 2
				subPageSizeRight := pageSize - subPageSizeLeft
				offsetLeft := offset
				offsetRight := offset + subPageSizeLeft

				for _, page := range [2][2]int{{subPageSizeLeft, offsetLeft}, {subPageSizeRight, offsetRight}} {
					results, _, _, err = doRequestPage[T, D](ctx, c, method, surl, q, page[0], page[1], results)
					if err != nil {
						if errors.As(err, &statusErr) && isBadElementStatus(statusErr.StatusCode) {
							return results, 0, false, nil
						}

						return results, 0, false, err
					}
				}

				nextPageOffset := offset + pageSize
				hasNextPage := true

				if results != nil {
					hasNextPage = nextPageOffset < cap(results)
				}

				return results, nextPageOffset, hasNextPage, nil
			}

			errs = append(errs, responseStatusErr{
				StatusCode: resp.StatusCode,
				Status:     resp.Status,
			})

			if isRetryableStatus(resp.StatusCode) && len(errs) < maxRetries {
				continue
			} else {
				return results, 0, false, errors.Join(errs...)
			}
		}

		var r T
		if err = json.NewDecoder(resp.Body).Decode(&r); err != nil {
			return results, 0, false, fmt.Errorf("failed to parse response: %w", err)
		}

		if results == nil {
			results = make([]D, 0, r.Meta().TotalCount)
		}

		for _, v := range r.Data() {
			results = append(results, v)
		}

		nextPageOffset := offset + pageSize
		return results, nextPageOffset, nextPageOffset < r.Meta().TotalCount, nil
	}
}

func isBadElementStatus(status int) bool {
	return status == http.StatusNotFound || status == http.StatusInternalServerError
}

func isRetryableStatus(status int) bool {
	return status == http.StatusGatewayTimeout || status == http.StatusBadGateway || status == http.StatusForbidden
}
