package web

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"github.com/explore-flights/monorepo/go/api/auth"
	"github.com/explore-flights/monorepo/go/common/jwks"
	"github.com/explore-flights/monorepo/go/common/oauth2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	google            = "google"
	sessionCookieName = "SESSION"
)

type sessionContextKey struct{}

type googleIdTokenClaims struct {
	jwt.RegisteredClaims
}

type AuthorizationHandler struct {
	md           oauth2.SeverMetadataOpenId
	clientId     string
	repo         *auth.Repo
	conv         *auth.SessionJwtConverter
	oauth2Client *oauth2.Client[oauth2.TokenResponseWithIdToken]
	jwksVerifier *jwks.Verifier
}

func NewAuthorizationHandler(clientId, clientSecret string, repo *auth.Repo, conv *auth.SessionJwtConverter) (*AuthorizationHandler, error) {
	md, err := oauth2.LoadMetadataFromOpenIdIssuer("https://accounts.google.com/")
	if err != nil {
		return nil, err
	}

	return &AuthorizationHandler{
		md:           md,
		clientId:     clientId,
		repo:         repo,
		conv:         conv,
		oauth2Client: oauth2.NewClient[oauth2.TokenResponseWithIdToken](md.TokenEndpoint, clientId, clientSecret),
		jwksVerifier: jwks.NewVerifier(md.JwksURI),
	}, nil
}

func (ah *AuthorizationHandler) AuthInfo(c echo.Context) error {
	_, err := ah.jwtFromCookie(c)
	if err != nil {
		return c.NoContent(http.StatusUnauthorized)
	}

	return c.NoContent(http.StatusNoContent)
}

func (ah *AuthorizationHandler) Middleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		claims, err := ah.jwtFromCookie(c)
		if err == nil {
			req := c.Request()
			ctx := context.WithValue(req.Context(), sessionContextKey{}, claims)
			req = req.WithContext(ctx)
			c.SetRequest(req)
		}

		return next(c)
	}
}

func (ah *AuthorizationHandler) Required(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		if _, ok := c.Request().Context().Value(sessionContextKey{}).(auth.SessionJwtClaims); !ok {
			return echo.NewHTTPError(http.StatusUnauthorized)
		}

		return next(c)
	}
}

func (ah *AuthorizationHandler) jwtFromCookie(c echo.Context) (auth.SessionJwtClaims, error) {
	cookie, err := c.Cookie(sessionCookieName)
	if err != nil {
		return auth.SessionJwtClaims{}, err
	} else if err = cookie.Valid(); err != nil {
		return auth.SessionJwtClaims{}, err
	}

	return ah.conv.ReadJWT(cookie.Value)
}

func (ah *AuthorizationHandler) Register(c echo.Context) error {
	return ah.loginOrRegister(c, true)
}

func (ah *AuthorizationHandler) Login(c echo.Context) error {
	return ah.loginOrRegister(c, false)
}

func (ah *AuthorizationHandler) loginOrRegister(c echo.Context, register bool) error {
	issuer := c.Param("issuer")
	if issuer != google {
		return echo.NewHTTPError(http.StatusBadRequest, "bad issuer")
	}

	ctx := c.Request().Context()

	authUrl, state, challenge := ah.authorizationUrl(redirectUrl(c, issuer))

	err := ah.repo.StoreRequest(ctx, auth.Request{
		Issuer:        issuer,
		State:         state,
		CodeChallenge: challenge,
		Register:      register,
	})

	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err)
	}

	return c.Redirect(http.StatusFound, authUrl)
}

func (ah *AuthorizationHandler) Code(c echo.Context) error {
	issuer := c.Param("issuer")
	if issuer != google {
		return echo.NewHTTPError(http.StatusBadRequest, "bad issuer")
	}

	if oauth2Err := c.QueryParam(oauth2.Error); oauth2Err != "" {
		oauth2ErrDesc := c.QueryParam(oauth2.ErrorDescription)
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Errorf("oauth2 flow failed: err=[%v] desc=[%v]", oauth2Err, oauth2ErrDesc))
	}

	state := c.QueryParam(oauth2.State)
	code := c.QueryParam(oauth2.Code)
	if state == "" || code == "" {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Errorf("missing required params %v and/or %v", oauth2.State, oauth2.Code))
	}

	ctx := c.Request().Context()

	authReq, err := ah.repo.Request(ctx, issuer, state)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid state")
	}

	var tkRes oauth2.TokenResponseWithIdToken
	if authReq.CodeChallenge == "" {
		tkRes, err = ah.oauth2Client.AuthorizationCode(ctx, code, redirectUrl(c, issuer))
	} else {
		tkRes, err = ah.oauth2Client.AuthorizationCode(ctx, code, redirectUrl(c, issuer), oauth2.WithCodeVerifier(authReq.CodeChallenge))
	}

	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err)
	}

	if time.Duration(tkRes.ExpiresIn)*time.Second <= time.Minute*30 {
		return echo.NewHTTPError(http.StatusBadRequest, "token must be valid for at least 30m")
	}

	token, err := jwt.ParseWithClaims(tkRes.IdToken, &googleIdTokenClaims{}, ah.jwksVerifier.JWTKeyFuncWithContext(ctx))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err)
	} else if !token.Valid {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid ID Token")
	}

	claims, ok := token.Claims.(*googleIdTokenClaims)
	if !ok || claims.Subject == "" {
		return echo.NewHTTPError(http.StatusInternalServerError)
	}

	var acc auth.Account
	if authReq.Register {
		acc, err = ah.repo.CreateAccount(ctx, issuer, claims.Subject)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "could not create account")
		}
	} else {
		acc, err = ah.repo.AccountByFederation(ctx, issuer, claims.Subject)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "could not retrieve account")
		}
	}

	exp := time.Now().Add(time.Hour * 24)
	jwtStr, err := ah.conv.WriteJWT(acc.Id, issuer, claims.Subject, exp)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err)
	}

	c.SetCookie(&http.Cookie{
		Name:     sessionCookieName,
		Value:    jwtStr,
		Path:     "/",
		Expires:  exp,
		Secure:   isSecure(c),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	return c.Redirect(http.StatusFound, "/")
}

func (ah *AuthorizationHandler) authorizationUrl(redirectUri string) (string, string, string) {
	state := generateState()
	authUrl, codeChallenge := ah.md.AuthorizationUrl(ah.clientId, state, redirectUri, []string{"openid"}, nil)
	return authUrl, state, codeChallenge
}

func generateState() string {
	stateBytes := make([]byte, 64)
	_, _ = rand.Read(stateBytes)

	return base64.RawURLEncoding.EncodeToString(stateBytes)
}

func redirectUrl(c echo.Context, issuer string) string {
	return baseUrl(c) + "/auth/oauth2/code/" + url.PathEscape(issuer)
}

func baseUrl(c echo.Context) string {
	req := c.Request()
	if forwarded := req.Header.Get("Forwarded"); forwarded != "" {
		var host string
		var proto string

		for _, value := range strings.Split(forwarded, ";") {
			if value, ok := strings.CutPrefix(value, "host="); ok {
				host = value
			} else if value, ok := strings.CutPrefix(value, "proto="); ok {
				proto = value
			}
		}

		if host != "" && proto != "" {
			return proto + "://" + host
		}
	}

	if host := req.Header.Get("X-Forwarded-Host"); host != "" {
		if proto := req.Header.Get(echo.HeaderXForwardedProto); proto != "" {
			return proto + "://" + host
		}
	}

	return c.Scheme() + "://" + req.Host
}

func isSecure(c echo.Context) bool {
	if c.IsTLS() || c.Scheme() == "https" {
		return true
	}

	h := c.Request().Header
	if h.Get(echo.HeaderXForwardedProto) == "https" {
		return true
	} else if strings.Contains(h.Get("Forwarded"), "proto=https") {
		return true
	}

	return false
}
