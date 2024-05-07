package action

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
)

type LoadMetadataParams struct {
	OutputBucket string `json:"outputBucket"`
	OutputPrefix string `json:"outputPrefix"`
}

type LoadMetadataOutput struct {
}

type LoadMetadataFn func(c *lufthansa.Client, ctx context.Context) ([]json.RawMessage, error)

type lmAction struct {
	s3c  *s3.Client
	lhc  *lufthansa.Client
	fn   LoadMetadataFn
	name string
}

func NewLoadMetadataAction(s3c *s3.Client, lhc *lufthansa.Client, fn LoadMetadataFn, name string) Action[LoadMetadataParams, LoadMetadataOutput] {
	return &lmAction{
		s3c:  s3c,
		lhc:  lhc,
		fn:   fn,
		name: name,
	}
}

func (a *lmAction) Handle(ctx context.Context, params LoadMetadataParams) (LoadMetadataOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	data, err := a.fn(a.lhc, ctx)
	if err != nil {
		return LoadMetadataOutput{}, err
	}

	b, err := json.Marshal(data)
	if err != nil {
		return LoadMetadataOutput{}, err
	}

	_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(params.OutputBucket),
		Key:         aws.String(params.OutputPrefix + a.name + ".json"),
		ContentType: aws.String("application/json"),
		Body:        bytes.NewReader(b),
	})

	return LoadMetadataOutput{}, err
}
