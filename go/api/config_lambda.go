//go:build lambda

package main

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

var awsConfig = sync.OnceValues(func() (aws.Config, error) {
	return config.LoadDefaultConfig(context.Background())
})

var ssmParams = sync.OnceValues(func() (map[string]string, error) {
	return loadSsmParams(
		context.Background(),
		"FLIGHTS_SSM_GOOGLE_CLIENT_ID",
		"FLIGHTS_SSM_GOOGLE_CLIENT_SECRET",
		"FLIGHTS_SSM_SESSION_RSA_PRIV",
		"FLIGHTS_SSM_SESSION_RSA_PUB",
		"FLIGHTS_SSM_LUFTHANSA_CLIENT_ID",
		"FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET",
	)
})

func echoPort() int {
	port, _ := strconv.Atoi(os.Getenv("AWS_LWA_PORT"))
	return cmp.Or(port, 8080)
}

func s3Client(ctx context.Context) (*s3.Client, error) {
	cfg, err := awsConfig()
	if err != nil {
		return nil, err
	}

	return s3.NewFromConfig(cfg), nil
}

func ssmClient() (*ssm.Client, error) {
	cfg, err := awsConfig()
	if err != nil {
		return nil, err
	}

	return ssm.NewFromConfig(cfg), nil
}

func dataBucket() (string, error) {
	bucket := os.Getenv("FLIGHTS_DATA_BUCKET")
	if bucket == "" {
		return "", errors.New("env variable FLIGHTS_DATA_BUCKET required")
	}

	return bucket, nil
}

func parquetBucket() (string, error) {
	bucket := os.Getenv("FLIGHTS_PARQUET_BUCKET")
	if bucket == "" {
		return "", errors.New("env variable FLIGHTS_PARQUET_BUCKET required")
	}

	return bucket, nil
}

func authorizationHandler(ctx context.Context, s3c auth.MinimalS3Client) (*web.AuthorizationHandler, error) {
	bucket := os.Getenv("FLIGHTS_AUTH_BUCKET")
	if bucket == "" {
		return nil, errors.New("env variable FLIGHTS_AUTH_BUCKET required")
	}

	params, err := ssmParams()
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

func lufthansaClient() (*lufthansa.Client, error) {
	params, err := ssmParams()
	if err != nil {
		return nil, err
	}

	return lufthansa.NewClient(
		params["FLIGHTS_SSM_LUFTHANSA_CLIENT_ID"],
		params["FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET"],
		lufthansa.WithRateLimiter(rate.NewLimiter(rate.Every(time.Hour)*490, 1)),
	), nil
}

func loadSsmParams(ctx context.Context, envNames ...string) (map[string]string, error) {
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

	ssmc, err := ssmClient()
	if err != nil {
		return nil, err
	}

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

func database() (*db.Database, error) {
	parquetBucketName, err := parquetBucket()
	if err != nil {
		return nil, err
	}

	return db.NewDatabase(
		"/opt/data/basedata.db",
		"/opt/data/variants.parquet",
		fmt.Sprintf("s3://%s/history", parquetBucketName),
		fmt.Sprintf("s3://%s/latest", parquetBucketName),
	), nil
}

func versionTxtPath() string {
	return "/opt/data/version.txt"
}
