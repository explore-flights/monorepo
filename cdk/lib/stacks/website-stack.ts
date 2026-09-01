import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudfrontConstruct } from '../constructs/cloudfront-construct';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { ApiLambdaConstruct } from '../constructs/api-lambda-construct';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { UIResourcesConstruct } from '../constructs/ui-resources-construct';

export interface WebsiteStackProps extends cdk.StackProps {
  domain: string;
  certificateId: string;
  apiLambdaZipPath: string;
  uiResourcesZipPath: string;
  parquetBucket: IBucket;
  useDokployApiOrigin: boolean;
}

export class WebsiteStack extends cdk.Stack {
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const api = new ApiLambdaConstruct(this, 'ApiLambda', {
      apiLambdaZipPath: props.apiLambdaZipPath,
      parquetBucket: props.parquetBucket,
    });

    const uiResources = new UIResourcesConstruct(this, 'UIResources', {});

    const dokployApiOriginDomain = new cdk.CfnParameter(this, 'dokployApiOriginDomain', {
      type: 'String',
      minLength: 1,
      description: 'Dokploy API hostname without a scheme or path.',
    });

    const cf = new CloudfrontConstruct(this, 'Cloudfront', {
      domain: props.domain,
      certificateId: props.certificateId,
      uiResourcesBucket: uiResources.bucket,
      apiLambdaFunctionURL: api.functionURL,
      dokployApiOriginDomain: dokployApiOriginDomain.valueAsString,
      useDokployApiOrigin: props.useDokployApiOrigin,
    });

    uiResources.deployResourcesZip(props.uiResourcesZipPath, cf.distribution);

    this.distribution = cf.distribution;
  }
}
