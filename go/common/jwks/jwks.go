package jwks

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"github.com/explore-flights/monorepo/go/common/concurrent"
	"github.com/go-jose/go-jose/v4"
	"github.com/golang-jwt/jwt/v5"
	"net/http"
)

type jwksError struct {
	error
}

var ErrNoKidInJWT = jwksError{errors.New("no header kid in JWT header")}
var ErrNoSuchKid = jwksError{errors.New("no such kid")}

type Option func(v *Verifier)

func WithHttpClient(httpClient *http.Client) Option {
	return func(v *Verifier) {
		v.httpClient = httpClient
	}
}

type Verifier struct {
	httpClient *http.Client
	jwksUri    string
	cache      concurrent.Map[string, jose.JSONWebKey]
}

func NewVerifier(jwksUri string, opts ...Option) *Verifier {
	v := &Verifier{
		httpClient: nil,
		jwksUri:    jwksUri,
		cache:      concurrent.NewMap[string, jose.JSONWebKey](),
	}

	for _, opt := range opts {
		opt(v)
	}

	v.httpClient = cmp.Or(v.httpClient, http.DefaultClient)

	return v
}

func (v *Verifier) Key(ctx context.Context, kid string) (jose.JSONWebKey, error) {
	jwk, ok := v.cache.Load(kid)
	if ok {
		return jwk, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksUri, nil)
	if err != nil {
		return jose.JSONWebKey{}, err
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return jose.JSONWebKey{}, err
	}

	jwks, err := func() (jose.JSONWebKeySet, error) {
		defer resp.Body.Close()

		var jwks jose.JSONWebKeySet
		return jwks, json.NewDecoder(resp.Body).Decode(&jwks)
	}()

	var matchedJWK jose.JSONWebKey
	found := false

	v.cache.WLocked(func(ops concurrent.WMap[string, jose.JSONWebKey]) {
		for _, jwk := range jwks.Keys {
			if jwk.Valid() {
				ops.Store(jwk.KeyID, jwk)

				if jwk.KeyID == kid {
					matchedJWK = jwk
					found = true
				}
			}
		}
	})

	if !found {
		return jose.JSONWebKey{}, ErrNoSuchKid
	}

	return matchedJWK, nil
}

func (v *Verifier) JWTKeyFunc(token *jwt.Token) (any, error) {
	return v.jwtKeyFunc(context.Background(), token)
}

func (v *Verifier) JWTKeyFuncWithContext(ctx context.Context) jwt.Keyfunc {
	return func(token *jwt.Token) (any, error) {
		return v.jwtKeyFunc(ctx, token)
	}
}

func (v *Verifier) jwtKeyFunc(ctx context.Context, token *jwt.Token) (any, error) {
	kid, ok := token.Header["kid"].(string)
	if !ok {
		return nil, ErrNoKidInJWT
	}

	jwk, err := v.Key(ctx, kid)
	if err != nil {
		return nil, err
	}

	return jwk.Key, nil
}

// type assertions
var _ jwt.Keyfunc = (*Verifier)(nil).JWTKeyFunc
