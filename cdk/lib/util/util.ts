import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { ArnFormat, Stack } from 'aws-cdk-lib';
import { FunctionUrlAuthType, IFunction } from 'aws-cdk-lib/aws-lambda';

export class CloudfrontUtil {
  public static addCloudfrontOACToBucketResourcePolicy(bucket: IBucket, distribution: IDistribution, prefix: string, allowList: boolean) {
    const distributionArn = CloudfrontUtil.distributionArn(distribution);

    bucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject'],
      principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
      resources: [bucket.arnForObjects(`${prefix}*`)],
      conditions: { StringEquals: { 'AWS:SourceArn': distributionArn } },
    }));

    if (allowList) {
      let additionalStringEqualsCondition: Record<string, string> = {};
      if (prefix !== '') {
        additionalStringEqualsCondition['s3:prefix'] = prefix;
      }

      bucket.addToResourcePolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
        resources: [bucket.bucketArn],
        conditions: {
          StringEquals: {
            ...additionalStringEqualsCondition,
            'AWS:SourceArn': distributionArn,
          },
        },
      }));
    }
  }

  public static addCloudfrontOACToLambdaResourcePolicy(id: string, lambda: IFunction, distribution: IDistribution) {
    lambda.addPermission(`AllowCF${id}InvokeFunctionUrl`, {
      action: 'lambda:InvokeFunctionUrl',
      principal: new ServicePrincipal('cloudfront.amazonaws.com'),
      sourceArn: CloudfrontUtil.distributionArn(distribution),
      functionUrlAuthType: FunctionUrlAuthType.AWS_IAM,
    });
  }

  public static distributionArn(distribution: IDistribution): string {
    return Stack.of(distribution).formatArn({
      service: 'cloudfront',
      region: '',
      resource: 'distribution',
      resourceName: distribution.distributionId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
  }
}