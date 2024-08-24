//go:build lambda

package adapt

import (
	"errors"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"net/http"
)

func IsS3NotFound(err error) bool {
	var respError *awshttp.ResponseError
	return err != nil && errors.As(err, &respError) && respError.HTTPStatusCode() == http.StatusNotFound
}
