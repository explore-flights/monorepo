import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudfrontConstruct } from '../constructs/cloudfront-construct';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { ApiLambdaConstruct } from '../constructs/api-lambda-construct';
import { BlockPublicAccess, Bucket, BucketEncryption, IBucket } from 'aws-cdk-lib/aws-s3';
import { UIResourcesConstruct } from '../constructs/ui-resources-construct';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface WebsiteStackProps extends cdk.StackProps {
  domain: string;
  certificateId: string;
  apiLambdaZipPath: string;
  uiResourcesZipPath: string;
  dataBucket: IBucket;
  parquetBucket: IBucket;
}

export class WebsiteStack extends cdk.Stack {
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const authBucket = new Bucket(this, 'AuthBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          enabled: true,
          prefix: 'authreq/',
          expiration: Duration.days(1),
          noncurrentVersionExpiration: Duration.days(1),
        },
      ],
    });

    const api = new ApiLambdaConstruct(this, 'ApiLambda', {
      apiLambdaZipPath: props.apiLambdaZipPath,
      dataBucket: props.dataBucket,
      parquetBucket: props.parquetBucket,
      authBucket: authBucket,
    });

    const uiResources = new UIResourcesConstruct(this, 'UIResources', {});

    const cf = new CloudfrontConstruct(this, 'Cloudfront', {
      domain: props.domain,
      certificateId: props.certificateId,
      uiResourcesBucket: uiResources.bucket,
      apiLambda: api.lambda,
      apiLambdaFunctionURL: api.functionURL,
    });

    uiResources.deployResourcesZip(props.uiResourcesZipPath, cf.distribution);

    this.distribution = cf.distribution;
  }
}