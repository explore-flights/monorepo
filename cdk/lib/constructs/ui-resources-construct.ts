import { RemovalPolicy } from 'aws-cdk-lib';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { BlockPublicAccess, Bucket, BucketEncryption, IBucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export type UIResourcesConstructProps = Record<string, unknown>;

export class UIResourcesConstruct extends Construct {
  readonly bucket: IBucket;

  constructor(scope: Construct, id: string, _: UIResourcesConstructProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  public deployResourcesZip(resourcesZipPath: string, distribution: IDistribution): void {
    new BucketDeployment(this, 'Deployment', {
      destinationBucket: this.bucket,
      distribution: distribution,
      sources: [
        Source.asset(resourcesZipPath),
      ],
      extract: true,
    });
  }
}