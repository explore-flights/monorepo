package action

import (
	"bytes"
	"cmp"
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"golang.org/x/sync/errgroup"
	"io"
	"net/http"
)

type LoadOurAirportsDataParams struct {
	OutputBucket string   `json:"outputBucket"`
	OutputPrefix string   `json:"outputPrefix"`
	Files        []string `json:"files"`
}

type LoadOurAirportsDataOutput struct {
}

type loa struct {
	s3c        *s3.Client
	httpClient *http.Client
}

func NewLoadOurAirportsDataAction(s3c *s3.Client, httpClient *http.Client) Action[LoadOurAirportsDataParams, LoadOurAirportsDataOutput] {
	return &loa{
		s3c:        s3c,
		httpClient: cmp.Or(httpClient, http.DefaultClient),
	}
}

func (a *loa) Handle(ctx context.Context, params LoadOurAirportsDataParams) (LoadOurAirportsDataOutput, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	g, ctx := errgroup.WithContext(ctx)
	for _, file := range params.Files {
		g.Go(func() error {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://davidmegginson.github.io/ourairports-data/"+file, nil)
			if err != nil {
				return err
			}

			resp, err := a.httpClient.Do(req)
			if err != nil {
				return err
			}

			defer resp.Body.Close()

			var b bytes.Buffer
			if _, err = io.Copy(&b, resp.Body); err != nil {
				return err
			}

			_, err = a.s3c.PutObject(ctx, &s3.PutObjectInput{
				Bucket:      aws.String(params.OutputBucket),
				Key:         aws.String(params.OutputPrefix + file),
				ContentType: aws.String("text/csv"),
				Body:        bytes.NewReader(b.Bytes()),
			})

			return err
		})
	}

	return LoadOurAirportsDataOutput{}, g.Wait()
}
