import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption, IBucket } from 'aws-cdk-lib/aws-s3';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface DataStackProps extends cdk.StackProps {

}

export class DataStack extends cdk.Stack {
  readonly bucket: IBucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.bucket = new Bucket(this, 'DataBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      versioned: true,
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });
  }
}