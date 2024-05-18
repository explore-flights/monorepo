package oauth2

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"
	"slices"
	"strings"
)

type ServerMetadata struct {
	Issuer                                    string   `json:"issuer"`
	AuthorizationEndpoint                     string   `json:"authorization_endpoint"`
	TokenEndpoint                             string   `json:"token_endpoint"`
	TokenEndpointAuthMethodsSupported         []string `json:"token_endpoint_auth_methods_supported"`
	JwksURI                                   string   `json:"jwks_uri"`
	ResponseTypesSupported                    []string `json:"response_types_supported"`
	GrantTypesSupported                       []string `json:"grant_types_supported"`
	RevocationEndpoint                        string   `json:"revocation_endpoint"`
	RevocationEndpointAuthMethodsSupported    []string `json:"revocation_endpoint_auth_methods_supported"`
	IntrospectionEndpoint                     string   `json:"introspection_endpoint"`
	IntrospectionEndpointAuthMethodsSupported []string `json:"introspection_endpoint_auth_methods_supported"`
	CodeChallengeMethodsSupported             []string `json:"code_challenge_methods_supported"`
}

type SeverMetadataOpenId struct {
	ServerMetadata
	UserInfoEndpoint string `json:"user_info_endpoint"`
}

func (md ServerMetadata) AuthorizationUrl(clientId, state, redirectUri string, scopes []string, addQuery url.Values) (string, string) {
	authUrl, _ := url.Parse(md.AuthorizationEndpoint)
	q := authUrl.Query()

	if addQuery != nil {
		for k, values := range addQuery {
			for _, v := range values {
				q.Add(k, v)
			}
		}
	}

	codeChallenge := ""

	if slices.Contains(md.CodeChallengeMethodsSupported, CodeChallengeMethodS256) {
		codeChallenge = generateCodeChallenge()

		hash := sha256.Sum256([]byte(codeChallenge))
		b64 := base64.RawURLEncoding.EncodeToString(hash[:])

		q.Set(CodeChallenge, b64)
		q.Set(CodeChallengeMethod, CodeChallengeMethodS256)
	} else if slices.Contains(md.CodeChallengeMethodsSupported, CodeChallengeMethodPlain) {
		codeChallenge = generateCodeChallenge()

		q.Set(CodeChallenge, codeChallenge)
		q.Set(CodeChallengeMethod, CodeChallengeMethodPlain)
	}

	q.Set(ClientId, clientId)
	q.Set(State, state)
	q.Set(RedirectUri, redirectUri)
	q.Set(Scope, strings.Join(scopes, " "))
	q.Set(ResponseType, Code)

	authUrl.RawQuery = q.Encode()

	return authUrl.String(), codeChallenge
}

func LoadMetadataFromOAuthIssuer(issuer string) (ServerMetadata, error) {
	metadataURL := issuer

	if !strings.HasSuffix(metadataURL, "/") {
		metadataURL += "/"
	}

	metadataURL += ".well-known/oauth-authorization-server"
	return LoadMetadata[ServerMetadata](metadataURL)
}

func LoadMetadataFromOpenIdIssuer(issuer string) (SeverMetadataOpenId, error) {
	metadataURL := issuer

	if !strings.HasSuffix(metadataURL, "/") {
		metadataURL += "/"
	}

	metadataURL += ".well-known/openid-configuration"
	return LoadMetadata[SeverMetadataOpenId](metadataURL)
}

func LoadMetadata[T any](url string) (T, error) {
	resp, err := http.Get(url)
	if err != nil {
		var def T
		return def, err
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var def T
		return def, fmt.Errorf("invalid status: %v", resp.StatusCode)
	}

	var sm T
	return sm, json.NewDecoder(resp.Body).Decode(&sm)
}

func generateCodeChallenge() string {
	const length = 128

	chars := "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	chars += strings.ToLower(chars)
	chars += "0123456789"
	chars += "-._~"

	r := make([]rune, length)
	for i := 0; i < length; i++ {
		r[i] = rune(chars[rand.Intn(len(chars))])
	}

	return string(r)
}
