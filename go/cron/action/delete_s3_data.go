package action

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/explore-flights/monorepo/go/common/adapt"
)

type DeleteS3DataParams struct {
	Bucket        string `json:"bucket"`
	ExcludePrefix string `json:"excludePrefix"`
}

type DeleteS3DataOutput struct {
	DeletedCount int `json:"deletedCount"`
}

type ds3DataActionS3Client interface {
	adapt.S3Lister
	adapt.S3Deleter
}

type ds3DataAction struct {
	s3c ds3DataActionS3Client
}

func NewDeleteS3DataAction(s3c ds3DataActionS3Client) Action[DeleteS3DataParams, DeleteS3DataOutput] {
	return &ds3DataAction{
		s3c: s3c,
	}
}

func (a *ds3DataAction) Handle(ctx context.Context, params DeleteS3DataParams) (DeleteS3DataOutput, error) {
	if params.Bucket == "" || params.ExcludePrefix == "" {
		return DeleteS3DataOutput{}, errors.New("bucket and excludePrefix must be provided")
	}

	output := DeleteS3DataOutput{
		DeletedCount: 0,
	}

	objects := make([]types.ObjectIdentifier, 0)
	paginator := s3.NewListObjectsV2Paginator(a.s3c, &s3.ListObjectsV2Input{
		Bucket: aws.String(params.Bucket),
	})

	for paginator.HasMorePages() {
		resp, err := paginator.NextPage(ctx)
		if err != nil {
			return output, err
		}

		for _, obj := range resp.Contents {
			if !strings.HasPrefix(*obj.Key, params.ExcludePrefix) {
				objects = append(objects, types.ObjectIdentifier{
					Key:  obj.Key,
					ETag: obj.ETag,
				})
			}
		}
	}

	for chunk := range slices.Chunk(objects, 1000) {
		resp, err := a.s3c.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(params.Bucket),
			Delete: &types.Delete{
				Objects: chunk,
			},
		})

		if err != nil {
			return output, fmt.Errorf("failed to delete objects: %w", err)
		}

		output.DeletedCount += len(resp.Deleted)

		if len(resp.Errors) > 0 {
			for _, delErr := range resp.Errors {
				err = errors.Join(err, fmt.Errorf("failed to delete object: %q", *delErr.Key))
			}

			return output, err
		}
	}

	return output, nil
}
