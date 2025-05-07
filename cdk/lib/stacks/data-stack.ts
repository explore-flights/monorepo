import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption, BucketProps, IBucket } from 'aws-cdk-lib/aws-s3';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface DataStackProps extends cdk.StackProps {

}

export class DataStack extends cdk.Stack {
  readonly dataBucket: IBucket;
  readonly parquetBucket: IBucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const baseProps = {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    } satisfies BucketProps;

    this.dataBucket = new Bucket(this, 'DataBucket', {
      ...baseProps,
      versioned: true,
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          enabled: true,
          noncurrentVersionExpiration: Duration.days(1),
          noncurrentVersionsToRetain: 2,
        },
        {
          enabled: true,
          expiration: Duration.days(3),
          noncurrentVersionExpiration: Duration.days(1),
          prefix: 'tmp/',
        },
      ],
    });

    this.parquetBucket = new Bucket(this, 'ParquetBucket', {
      ...baseProps,
      versioned: false,
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });
  }
}