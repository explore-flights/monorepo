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
	if _, ok := c.Request().Context().Value(sessionContextKey{}).(auth.SessionJwtClaims); !ok {
		return NewHTTPError(http.StatusUnauthorized)
	}

	return c.NoContent(http.StatusNoContent)
}

func (ah *AuthorizationHandler) Logout(c echo.Context) error {
	c.SetCookie(&http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

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
			return NewHTTPError(http.StatusUnauthorized)
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
		return NewHTTPError(http.StatusBadRequest, WithMessage("bad issuer"))
	}

	ctx := c.Request().Context()

	authUrl, state, challenge := ah.authorizationUrl(ah.redirectUrl(c, issuer))

	err := ah.repo.StoreRequest(ctx, auth.Request{
		Issuer:        issuer,
		State:         state,
		CodeChallenge: challenge,
		Register:      register,
	})

	if err != nil {
		return err
	}

	return c.Redirect(http.StatusFound, authUrl)
}

func (ah *AuthorizationHandler) Code(c echo.Context) error {
	issuer := c.Param("issuer")
	if issuer != google {
		return NewHTTPError(http.StatusBadRequest, WithMessage("bad issuer"))
	}

	if oauth2Err := c.QueryParam(oauth2.Error); oauth2Err != "" {
		oauth2ErrDesc := c.QueryParam(oauth2.ErrorDescription)
		return NewHTTPError(http.StatusBadRequest, WithMessage(fmt.Sprintf("oauth2 flow failed: err=[%v] desc=[%v]", oauth2Err, oauth2ErrDesc)))
	}

	state := c.QueryParam(oauth2.State)
	code := c.QueryParam(oauth2.Code)
	if state == "" || code == "" {
		return NewHTTPError(http.StatusBadRequest, WithMessage(fmt.Sprintf("missing required params %v and/or %v", oauth2.State, oauth2.Code)))
	}

	ctx := c.Request().Context()

	authReq, err := ah.repo.Request(ctx, issuer, state)
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithMessage("invalid state"))
	}

	var tkRes oauth2.TokenResponseWithIdToken
	if authReq.CodeChallenge == "" {
		tkRes, err = ah.oauth2Client.AuthorizationCode(ctx, code, ah.redirectUrl(c, issuer))
	} else {
		tkRes, err = ah.oauth2Client.AuthorizationCode(ctx, code, ah.redirectUrl(c, issuer), oauth2.WithCodeVerifier(authReq.CodeChallenge))
	}

	if err != nil {
		return err
	}

	if time.Duration(tkRes.ExpiresIn)*time.Second <= time.Minute*30 {
		return NewHTTPError(http.StatusBadRequest, WithMessage("token must be valid for at least 30m"))
	}

	token, err := jwt.ParseWithClaims(tkRes.IdToken, &googleIdTokenClaims{}, ah.jwksVerifier.JWTKeyFuncWithContext(ctx))
	if err != nil {
		return NewHTTPError(http.StatusBadRequest, WithCause(err))
	} else if !token.Valid {
		return NewHTTPError(http.StatusBadRequest, WithMessage("invalid ID Token"))
	}

	claims, ok := token.Claims.(*googleIdTokenClaims)
	if !ok || claims.Subject == "" {
		return NewHTTPError(http.StatusInternalServerError)
	}

	var acc auth.Account
	if authReq.Register {
		acc, err = ah.repo.CreateAccount(ctx, issuer, claims.Subject)
		if err != nil {
			return NewHTTPError(http.StatusBadRequest, WithMessage("could not create account"), WithCause(err))
		}
	} else {
		acc, err = ah.repo.AccountByFederation(ctx, issuer, claims.Subject)
		if err != nil {
			return NewHTTPError(http.StatusBadRequest, WithMessage("could not retrieve account"), WithCause(err))
		}
	}

	exp := time.Now().Add(time.Hour * 24)
	jwtStr, err := ah.conv.WriteJWT(acc.Id, issuer, claims.Subject, exp)
	if err != nil {
		return err
	}

	c.SetCookie(&http.Cookie{
		Name:     sessionCookieName,
		Value:    jwtStr,
		Path:     "/",
		Expires:  exp,
		Secure:   ah.isSecure(c),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	return c.Redirect(http.StatusFound, "/")
}

func (ah *AuthorizationHandler) authorizationUrl(redirectUri string) (string, string, string) {
	state := ah.generateState()
	authUrl, codeChallenge := ah.md.AuthorizationUrl(ah.clientId, state, redirectUri, []string{"openid"}, nil)
	return authUrl, state, codeChallenge
}

func (ah *AuthorizationHandler) generateState() string {
	stateBytes := make([]byte, 64)
	_, _ = rand.Read(stateBytes)

	return base64.RawURLEncoding.EncodeToString(stateBytes)
}

func (ah *AuthorizationHandler) redirectUrl(c echo.Context, issuer string) string {
	return baseUrl(c) + "/auth/oauth2/code/" + url.PathEscape(issuer)
}

func (ah *AuthorizationHandler) isSecure(c echo.Context) bool {
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
