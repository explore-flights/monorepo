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

type Client[TR any] struct {
	httpClient    *http.Client
	limiter       *rate.Limiter
	tokenEndpoint string
	clientId      string
	clientSecret  string
}

type ClientOption[TR any] func(c *Client[TR])

type FormOption func(form url.Values)

type TokenResponse struct {
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	AccessToken string `json:"access_token"`
}

type TokenResponseWithRefresh struct {
	TokenResponse
	RefreshToken string `json:"refresh_token"`
}

type TokenResponseWithIdToken struct {
	TokenResponse
	IdToken string `json:"id_token"`
}

func WithHttpClient[TR any](httpClient *http.Client) ClientOption[TR] {
	return func(c *Client[TR]) {
		c.httpClient = httpClient
	}
}

func WithRateLimiter[TR any](limiter *rate.Limiter) ClientOption[TR] {
	return func(c *Client[TR]) {
		c.limiter = limiter
	}
}

func WithCodeVerifier(codeVerifier string) FormOption {
	return func(form url.Values) {
		form.Set(CodeVerifier, codeVerifier)
	}
}

func NewClient[TR any](tokenEndpoint, clientId, clientSecret string, opts ...ClientOption[TR]) *Client[TR] {
	c := &Client[TR]{
		tokenEndpoint: tokenEndpoint,
		clientId:      clientId,
		clientSecret:  clientSecret,
	}

	for _, opt := range opts {
		opt(c)
	}

	c.httpClient = cmp.Or(c.httpClient, http.DefaultClient)

	return c
}

func (c *Client[TR]) AuthorizationCode(ctx context.Context, code, redirectUri string, opts ...FormOption) (TR, error) {
	form := make(url.Values)
	form.Set(GrantType, AuthorizationCode)
	form.Set(Code, code)
	form.Set(RedirectUri, redirectUri)

	for _, opt := range opts {
		opt(form)
	}

	return c.requestToken(ctx, form)
}

func (c *Client[TR]) RefreshToken(ctx context.Context, refreshToken string) (TR, error) {
	form := make(url.Values)
	form.Set(GrantType, RefreshToken)
	form.Set(RefreshToken, refreshToken)

	return c.requestToken(ctx, form)
}

func (c *Client[TR]) ClientCredentials(ctx context.Context) (TR, error) {
	form := make(url.Values)
	form.Set(GrantType, ClientCredentials)

	return c.requestToken(ctx, form)
}

func (c *Client[TR]) requestToken(ctx context.Context, form url.Values) (TR, error) {
	form.Set(ClientId, c.clientId)
	form.Set(ClientSecret, c.clientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		var def TR
		return def, err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	if c.limiter != nil {
		if err = c.limiter.Wait(ctx); err != nil {
			var def TR
			return def, err
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		var def TR
		return def, err
	}

	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		var def TR
		return def, errors.New(resp.Status)
	}

	var tr TR
	return tr, json.NewDecoder(resp.Body).Decode(&tr)
}
