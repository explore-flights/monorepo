//go:build lambda

package config

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/explore-flights/monorepo/go/api/auth"
	"github.com/explore-flights/monorepo/go/api/db"
	"github.com/explore-flights/monorepo/go/api/web"
	"github.com/explore-flights/monorepo/go/common/lufthansa"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
	"os"
	"strconv"
	"sync"
	"time"
)

var Config = func() *accessor {
	awsConfig := sync.OnceValues(func() (aws.Config, error) {
		return config.LoadDefaultConfig(context.Background())
	})

	ssmParamsDone := make(chan struct{})
	a := &accessor{
		awsConfig:     awsConfig,
		ssmParamsDone: ssmParamsDone,
	}

	go func() {
		defer close(ssmParamsDone)

		cfg, err := awsConfig()
		if err != nil {
			a.ssmParamsErr = err
			return
		}

		a.ssmParams, a.ssmParamsErr = loadSsmParams(
			context.Background(),
			cfg,
			"FLIGHTS_SSM_GOOGLE_CLIENT_ID",
			"FLIGHTS_SSM_GOOGLE_CLIENT_SECRET",
			"FLIGHTS_SSM_SESSION_RSA_PRIV",
			"FLIGHTS_SSM_SESSION_RSA_PUB",
			"FLIGHTS_SSM_LUFTHANSA_CLIENT_ID",
			"FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET",
		)
	}()

	return a
}()

type accessor struct {
	awsConfig     func() (aws.Config, error)
	ssmParamsDone <-chan struct{}
	ssmParams     map[string]string
	ssmParamsErr  error
}

func (*accessor) EchoPort() int {
	port, _ := strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	return cmp.Or(port, 8080)
}

func (a *accessor) S3Client(ctx context.Context) (S3Client, error) {
	cfg, err := a.awsConfig()
	if err != nil {
		return nil, err
	}

	return s3.NewFromConfig(cfg), nil
}

func (*accessor) DataBucket() (string, error) {
	bucket := os.Getenv("FLIGHTS_DATA_BUCKET")
	if bucket == "" {
		return "", errors.New("env variable FLIGHTS_DATA_BUCKET required")
	}

	return bucket, nil
}

func (*accessor) ParquetBucket() (string, error) {
	bucket := os.Getenv("FLIGHTS_PARQUET_BUCKET")
	if bucket == "" {
		return "", errors.New("env variable FLIGHTS_PARQUET_BUCKET required")
	}

	return bucket, nil
}

func (a *accessor) AuthorizationHandler(ctx context.Context) (*web.AuthorizationHandler, error) {
	s3c, err := a.S3Client(ctx)
	if err != nil {
		return nil, err
	}

	bucket := os.Getenv("FLIGHTS_AUTH_BUCKET")
	if bucket == "" {
		return nil, errors.New("env variable FLIGHTS_AUTH_BUCKET required")
	}

	params, err := a.getSsmParams()
	if err != nil {
		return nil, err
	}

	priv, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(params["FLIGHTS_SSM_SESSION_RSA_PRIV"]))
	if err != nil {
		return nil, err
	}

	pub, err := jwt.ParseRSAPublicKeyFromPEM([]byte(params["FLIGHTS_SSM_SESSION_RSA_PUB"]))
	if err != nil {
		return nil, err
	}

	return web.NewAuthorizationHandler(
		params["FLIGHTS_SSM_GOOGLE_CLIENT_ID"],
		params["FLIGHTS_SSM_GOOGLE_CLIENT_SECRET"],
		auth.NewRepo(s3c, bucket),
		auth.NewSessionJwtConverter("41b25713-3fe9-484f-9186-96a692ab77ad", priv, pub),
	)
}

func (a *accessor) LufthansaClient() (*lufthansa.Client, error) {
	params, err := a.getSsmParams()
	if err != nil {
		return nil, err
	}

	return lufthansa.NewClient(
		params["FLIGHTS_SSM_LUFTHANSA_CLIENT_ID"],
		params["FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET"],
		lufthansa.WithRateLimiter(rate.NewLimiter(rate.Every(time.Hour)*490, 1)),
	), nil
}

func (a *accessor) Database() (*db.Database, error) {
	parquetBucketName, err := a.ParquetBucket()
	if err != nil {
		return nil, err
	}

	return db.NewDatabase(
		"/opt/data/basedata.db",
		"/opt/data/variants.parquet",
		"/opt/data/report.parquet",
		"/opt/data/connections.parquet",
		fmt.Sprintf("s3://%s/history", parquetBucketName),
		fmt.Sprintf("s3://%s/latest", parquetBucketName),
	), nil
}

func (*accessor) VersionTxtPath() string {
	return "/opt/data/version.txt"
}

func (a *accessor) getSsmParams() (map[string]string, error) {
	<-a.ssmParamsDone
	return a.ssmParams, a.ssmParamsErr
}

func loadSsmParams(ctx context.Context, cfg aws.Config, envNames ...string) (map[string]string, error) {
	reqNames := make([]string, 0, len(envNames))
	lookup := make(map[string]string)

	for _, envName := range envNames {
		reqName := os.Getenv(envName)
		if reqName == "" {
			return nil, fmt.Errorf("env variable %s required", envName)
		}

		reqNames = append(reqNames, reqName)
		lookup[reqName] = envName
	}

	ssmc := ssm.NewFromConfig(cfg)
	resp, err := ssmc.GetParameters(ctx, &ssm.GetParametersInput{
		Names:          reqNames,
		WithDecryption: aws.Bool(true),
	})

	if err != nil {
		return nil, err
	} else if len(resp.InvalidParameters) > 0 {
		return nil, fmt.Errorf("ssm invalid parameters: %v", resp.InvalidParameters)
	}

	result := make(map[string]string)
	for _, p := range resp.Parameters {
		result[lookup[*p.Name]] = *p.Value
	}

	return result, nil
}
