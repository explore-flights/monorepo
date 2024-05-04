import { ArnFormat, Stack } from 'aws-cdk-lib';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
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
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });
  }

  public grantRead(distribution: IDistribution): void {
    const distributionArn = Stack.of(this).formatArn({
      service: 'cloudfront',
      region: '',
      resource: 'distribution',
      resourceName: distribution.distributionId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });

    this.grantReadInternal(distributionArn);
  }

  private grantReadInternal(distributionArn: string): void {
    this.bucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      principals: [new ServicePrincipal('cloudfront')],
      resources: [this.bucket.arnForObjects('*')],
      conditions: { StringEquals: { 'AWS:SourceArn': distributionArn } },
    }));

    this.bucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:ListBucket'],
      principals: [new ServicePrincipal('cloudfront')],
      resources: [this.bucket.bucketArn],
      conditions: { StringEquals: { 'AWS:SourceArn': distributionArn } },
    }));
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