package auth

import (
	"context"
	"errors"
	"fmt"
	"github.com/explore-flights/monorepo/go/common/adapt"
	"github.com/gofrs/uuid/v5"
	"io"
	"net/url"
	"time"
)

type MinimalS3Client interface {
	adapt.S3Getter
	adapt.S3Putter
}

type Request struct {
	Issuer        string `json:"issuer"`
	State         string `json:"state"`
	CodeChallenge string `json:"codeChallenge"`
	Register      bool   `json:"register"`
}

func (r Request) Valid() bool {
	return r.Issuer != "" && r.State != ""
}

type Account struct {
	Id           string    `json:"id"`
	CreationTime time.Time `json:"creationTime"`
}

type Repo struct {
	s3c    MinimalS3Client
	bucket string
}

func NewRepo(s3c MinimalS3Client, bucket string) *Repo {
	return &Repo{
		s3c:    s3c,
		bucket: bucket,
	}
}

func (r *Repo) StoreRequest(ctx context.Context, req Request) error {
	if !req.Valid() {
		return errors.New("invalid request")
	}

	return adapt.S3PutJson(ctx, r.s3c, r.bucket, formatRequestKey(req.Issuer, req.State), req)
}

func (r *Repo) Request(ctx context.Context, issuer, state string) (Request, error) {
	var req Request
	if err := adapt.S3GetJson(ctx, r.s3c, r.bucket, formatRequestKey(issuer, state), &req); err != nil {
		return Request{}, err
	}

	if req.Issuer != issuer || req.State != state {
		return Request{}, errors.New("issuer/state do not match")
	}

	return req, nil
}

func (r *Repo) CreateAccount(ctx context.Context, issuer, idAtIssuer string) (Account, error) {
	fedKey := formatFederationKey(issuer, idAtIssuer)
	err := adapt.S3Get(ctx, r.s3c, r.bucket, fedKey, func(io.Reader) error { return nil })
	if err == nil || !adapt.IsS3NotFound(err) {
		return Account{}, fmt.Errorf("account already exists: %w", err)
	}

	id, err := uuid.NewV4()
	if err != nil {
		return Account{}, fmt.Errorf("failed to generate account id: %w", err)
	}

	idStr := id.String()

	if err = adapt.S3PutRaw(ctx, r.s3c, r.bucket, fedKey, []byte(idStr)); err != nil {
		return Account{}, fmt.Errorf("failed to create federation: %w", err)
	}

	acc := Account{
		Id:           idStr,
		CreationTime: time.Now(),
	}

	if err = adapt.S3PutJson(ctx, r.s3c, r.bucket, formatAccountKey(acc.Id), acc); err != nil {
		return Account{}, fmt.Errorf("failed to create account: %w", err)
	}

	return acc, nil
}

func (r *Repo) Account(ctx context.Context, id string) (Account, error) {
	var acc Account
	return acc, adapt.S3GetJson(ctx, r.s3c, r.bucket, formatAccountKey(id), &acc)
}

func (r *Repo) AccountByFederation(ctx context.Context, issuer, idAtIssuer string) (Account, error) {
	idRaw, err := adapt.S3GetRaw(ctx, r.s3c, r.bucket, formatFederationKey(issuer, idAtIssuer))
	if err != nil {
		return Account{}, fmt.Errorf("account not found: %w", err)
	}

	return r.Account(ctx, string(idRaw))
}

func formatRequestKey(issuer, state string) string {
	return fmt.Sprintf("authreq/%v/%v", url.PathEscape(issuer), url.PathEscape(state))
}

func formatAccountKey(id string) string {
	return "account/" + url.PathEscape(id)
}

func formatFederationKey(issuer, idAtIssuer string) string {
	return fmt.Sprintf("federation/%v/%v", url.PathEscape(issuer), url.PathEscape(idAtIssuer))
}
