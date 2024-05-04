import { S3Origin, S3OriginProps } from 'aws-cdk-lib/aws-cloudfront-origins';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Reference } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OriginBindConfig, OriginBindOptions } from 'aws-cdk-lib/aws-cloudfront';

export type S3OriginWithOACProps = S3OriginProps & {
  oacId: Reference;
};

export class S3OriginWithOAC extends S3Origin {
  private readonly oacId: Reference;

  constructor(bucket: IBucket, props: S3OriginWithOACProps) {
    super(bucket, props);
    this.oacId = props.oacId;
  }

  public bind(scope: Construct, options: OriginBindOptions): OriginBindConfig {
    const originConfig = super.bind(scope, options);
    if (!originConfig.originProperty) {
      throw new Error('originProperty is required');
    }

    return {
      ...originConfig,
      originProperty: {
        ...originConfig.originProperty,
        originAccessControlId: this.oacId.toString(), // Adds OAC to S3 origin config
        s3OriginConfig: {
          ...originConfig.originProperty.s3OriginConfig,
          originAccessIdentity: '', // removes OAI from S3 origin config
        },
      },
    };
  }
}