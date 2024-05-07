package oauth2

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"golang.org/x/time/rate"
	"net/http"
	"net/url"
	"strings"
)

type Client struct {
	httpClient   *http.Client
	limiter      *rate.Limiter
	tokenUrl     string
	clientId     string
	clientSecret string
}

type ClientOption func(c *Client)

type TokenResponse struct {
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	AccessToken string `json:"access_token"`
}

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

func NewClient(tokenUrl, clientId, clientSecret string, opts ...ClientOption) *Client {
	c := &Client{
		tokenUrl:     tokenUrl,
		clientId:     clientId,
		clientSecret: clientSecret,
	}

	for _, opt := range opts {
		opt(c)
	}

	c.httpClient = cmp.Or(c.httpClient, http.DefaultClient)

	return c
}

func (c *Client) ClientCredentials(ctx context.Context) (TokenResponse, error) {
	form := make(url.Values)
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", c.clientId)
	form.Set("client_secret", c.clientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenUrl, strings.NewReader(form.Encode()))
	if err != nil {
		return cmp.Or[TokenResponse](), err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	if c.limiter != nil {
		if err = c.limiter.Wait(ctx); err != nil {
			return cmp.Or[TokenResponse](), err
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return cmp.Or[TokenResponse](), err
	}

	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return cmp.Or[TokenResponse](), errors.New(resp.Status)
	}

	var tokenResponse TokenResponse
	if err = json.NewDecoder(resp.Body).Decode(&tokenResponse); err != nil {
		return cmp.Or[TokenResponse](), err
	}

	return tokenResponse, nil
}
