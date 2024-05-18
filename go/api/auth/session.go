package auth

import (
	"crypto/rsa"
	"errors"
	"fmt"
	"github.com/golang-jwt/jwt/v5"
	"time"
)

const issuer = "explore.flights"

type SessionJwtClaims struct {
	jwt.RegisteredClaims
	Issuer     string `json:"fiss"`
	IdAtIssuer string `json:"fid"`
}

type SessionJwtConverter struct {
	kid    string
	priv   *rsa.PrivateKey
	pub    *rsa.PublicKey
	parser *jwt.Parser
}

func NewSessionJwtConverter(kid string, priv *rsa.PrivateKey, pub *rsa.PublicKey) *SessionJwtConverter {
	return &SessionJwtConverter{
		kid:  kid,
		priv: priv,
		pub:  pub,
		parser: jwt.NewParser(
			jwt.WithIssuer(issuer),
			jwt.WithLeeway(time.Second*5),
			jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		),
	}
}

func (c *SessionJwtConverter) ReadJWT(jwtStr string) (SessionJwtClaims, error) {
	tk, err := c.parser.ParseWithClaims(jwtStr, &SessionJwtClaims{}, func(tk *jwt.Token) (any, error) {
		kid, ok := tk.Header["kid"].(string)
		if !ok || kid != c.kid {
			return nil, errors.New("kid header not found or invalid")
		}

		return c.pub, nil
	})

	if err != nil {
		return SessionJwtClaims{}, fmt.Errorf("failed to parse jwt: %w", err)
	}

	return *(tk.Claims.(*SessionJwtClaims)), nil
}

func (c *SessionJwtConverter) WriteJWT(accId, issuer, idAtIssuer string, exp time.Time) (string, error) {
	now := time.Now()
	tk := jwt.NewWithClaims(jwt.SigningMethodRS256, SessionJwtClaims{
		Issuer:     issuer,
		IdAtIssuer: idAtIssuer,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        "",
			Issuer:    issuer,
			Subject:   accId,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	})
	tk.Header["kid"] = c.kid

	return tk.SignedString(c.priv)
}
