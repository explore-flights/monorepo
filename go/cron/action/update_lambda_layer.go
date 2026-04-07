package action

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/lambda"
	lambdaTypes "github.com/aws/aws-sdk-go-v2/service/lambda/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	ssmTypes "github.com/aws/aws-sdk-go-v2/service/ssm/types"
	"github.com/explore-flights/monorepo/go/common/adapt"
)

type UpdateLambdaLayerParams struct {
	Version             string `json:"version"`
	DatabaseBucket      string `json:"databaseBucket"`
	BaseDataDatabaseKey string `json:"baseDataDatabaseKey"`
	ParquetBucket       string `json:"parquetBucket"`
	VariantsKey         string `json:"variantsKey"`
	ReportKey           string `json:"reportKey"`
	ConnectionsKey      string `json:"connectionsKey"`
	LayerName           string `json:"layerName"`
	SsmParameterName    string `json:"ssmParameterName"`
}

type UpdateLambdaLayerOutput struct {
	UpdatedFunctionArns []string `json:"updatedFunctionArns"`
}

type ullActionLambdaClient interface {
	PublishLayerVersion(ctx context.Context, params *lambda.PublishLayerVersionInput, optFns ...func(*lambda.Options)) (*lambda.PublishLayerVersionOutput, error)
	ListFunctions(ctx context.Context, params *lambda.ListFunctionsInput, optFns ...func(*lambda.Options)) (*lambda.ListFunctionsOutput, error)
	GetFunctionConfiguration(ctx context.Context, params *lambda.GetFunctionConfigurationInput, optFns ...func(*lambda.Options)) (*lambda.GetFunctionConfigurationOutput, error)
	UpdateFunctionConfiguration(ctx context.Context, params *lambda.UpdateFunctionConfigurationInput, optFns ...func(*lambda.Options)) (*lambda.UpdateFunctionConfigurationOutput, error)
	ListLayerVersions(ctx context.Context, params *lambda.ListLayerVersionsInput, optFns ...func(*lambda.Options)) (*lambda.ListLayerVersionsOutput, error)
	DeleteLayerVersion(ctx context.Context, params *lambda.DeleteLayerVersionInput, optFns ...func(*lambda.Options)) (*lambda.DeleteLayerVersionOutput, error)
}

type ullActionSsmClient interface {
	PutParameter(ctx context.Context, params *ssm.PutParameterInput, optFns ...func(*ssm.Options)) (*ssm.PutParameterOutput, error)
}

type ullAction struct {
	s3c     adapt.S3Getter
	lambdaC ullActionLambdaClient
	ssmc    ullActionSsmClient
}

func NewUpdateLambdaLayerAction(s3c adapt.S3Getter, lambdaC ullActionLambdaClient, ssmc ullActionSsmClient) Action[UpdateLambdaLayerParams, UpdateLambdaLayerOutput] {
	return &ullAction{
		s3c:     s3c,
		lambdaC: lambdaC,
		ssmc:    ssmc,
	}
}

func (a *ullAction) Handle(ctx context.Context, params UpdateLambdaLayerParams) (UpdateLambdaLayerOutput, error) {
	var output UpdateLambdaLayerOutput
	var err error
	output.UpdatedFunctionArns, err = a.updateLambdaLayer(
		ctx,
		params.Version,
		params.DatabaseBucket,
		params.BaseDataDatabaseKey,
		params.ParquetBucket,
		params.VariantsKey,
		params.ReportKey,
		params.ConnectionsKey,
		params.LayerName,
		params.SsmParameterName,
	)

	return output, err
}

func (a *ullAction) updateLambdaLayer(ctx context.Context, version, databaseBucket, baseDataDatabaseKey, parquetBucket, variantsKey, reportKey, connectionsKey, layerName, ssmParameterName string) ([]string, error) {
	// create layer zip
	files := [][3]string{
		{"data/basedata.db", databaseBucket, baseDataDatabaseKey},
		{"data/variants.parquet", parquetBucket, variantsKey},
		{"data/report.parquet", parquetBucket, reportKey},
		{"data/connections.parquet", parquetBucket, connectionsKey},
	}

	var layerZipBuffer bytes.Buffer
	err := func() error {
		zipW := zip.NewWriter(&layerZipBuffer)

		for _, file := range files {
			zipFileName, bucket, key := file[0], file[1], file[2]

			w, err := zipW.Create(zipFileName)
			if err != nil {
				return fmt.Errorf("failed to create file %q in zip", zipFileName)
			}

			if _, err = a.copyS3FileTo(ctx, bucket, key, w); err != nil {
				return fmt.Errorf("failed to write s3 file %q to zip: %w", zipFileName, err)
			}
		}

		w, err := zipW.Create("data/version.txt")
		if err != nil {
			return fmt.Errorf(`failed to create file "data/version.txt": %w`, err)
		}

		if _, err = w.Write([]byte(version)); err != nil {
			return fmt.Errorf(`failed to write file "data/version.txt": %w`, err)
		}

		return zipW.Close()
	}()
	if err != nil {
		return nil, fmt.Errorf("failed to create layer zip file: %w", err)
	}

	// publish new layer version
	var updatedLayerArn, updatedLayerVersionArn string
	var updatedLayerVersion int64
	{
		resp, err := a.lambdaC.PublishLayerVersion(ctx, &lambda.PublishLayerVersionInput{
			LayerName: aws.String(layerName),
			Content: &lambdaTypes.LayerVersionContentInput{
				ZipFile: layerZipBuffer.Bytes(),
			},
		})
		if err != nil {
			return nil, fmt.Errorf("failed to publish layer version: %w", err)
		}

		updatedLayerArn, updatedLayerVersionArn = *resp.LayerArn, *resp.LayerVersionArn
		updatedLayerVersion = resp.Version
	}

	// update ssm parameter (for CDK deployments)
	_, err = a.ssmc.PutParameter(ctx, &ssm.PutParameterInput{
		Name:      aws.String(ssmParameterName),
		Value:     aws.String(updatedLayerVersionArn),
		Type:      ssmTypes.ParameterTypeString,
		Overwrite: aws.Bool(true),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to update SSM parameter for layer version: %w", err)
	}

	// figure out which functions use this layer
	functionsToUpdate := make([]lambdaTypes.FunctionConfiguration, 0)
	{
		var marker *string
		for {
			resp, err := a.lambdaC.ListFunctions(ctx, &lambda.ListFunctionsInput{Marker: marker})
			if err != nil {
				return nil, fmt.Errorf("failed to list functions: %w", err)
			}

			for _, function := range resp.Functions {
				for _, layer := range function.Layers {
					if strings.HasPrefix(*layer.Arn, updatedLayerArn) {
						functionsToUpdate = append(functionsToUpdate, function)
					}
				}
			}

			marker = resp.NextMarker
			if marker == nil {
				break
			}
		}
	}

	// update functions to use the new layer version
	updatedFunctionArns := make([]string, 0)
	for _, function := range functionsToUpdate {
		fmt.Printf("updating layers for function %q\n", *function.FunctionName)

		layerArns := make([]string, 0, len(function.Layers))
		for _, layer := range function.Layers {
			if strings.HasPrefix(*layer.Arn, updatedLayerArn) {
				layerArns = append(layerArns, updatedLayerVersionArn)
			} else {
				layerArns = append(layerArns, *layer.Arn)
			}
		}

		_, err = a.lambdaC.UpdateFunctionConfiguration(ctx, &lambda.UpdateFunctionConfigurationInput{
			FunctionName: function.FunctionArn,
			Layers:       layerArns,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to update function configuration for lambda %q: %w", *function.FunctionArn, err)
		}

		updatedFunctionArns = append(updatedFunctionArns, *function.FunctionArn)
	}

	// remove old layer versions
	{
		var marker *string
		for {
			resp, err := a.lambdaC.ListLayerVersions(ctx, &lambda.ListLayerVersionsInput{
				LayerName: aws.String(updatedLayerArn),
				Marker:    marker,
			})
			if err != nil {
				return nil, fmt.Errorf("failed to list layers: %w", err)
			}

			for _, layerVersion := range resp.LayerVersions {
				if layerVersion.Version < updatedLayerVersion {
					_, err = a.lambdaC.DeleteLayerVersion(ctx, &lambda.DeleteLayerVersionInput{
						LayerName:     aws.String(updatedLayerArn),
						VersionNumber: aws.Int64(layerVersion.Version),
					})
					if err != nil {
						return nil, fmt.Errorf("failed to delete layer version %q: %w", *layerVersion.LayerVersionArn, err)
					}
				}
			}

			marker = resp.NextMarker
			if marker == nil {
				break
			}
		}
	}

	return updatedFunctionArns, nil
}

func (a *ullAction) copyS3FileTo(ctx context.Context, bucket, key string, w io.Writer) (time.Time, error) {
	resp, err := a.s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return time.Time{}, fmt.Errorf("failed GetObject for key %q: %w", key, err)
	}
	defer resp.Body.Close()

	if _, err = io.Copy(w, resp.Body); err != nil {
		return time.Time{}, fmt.Errorf("failed to download file from s3: %w", err)
	}

	return *resp.LastModified, nil
}
