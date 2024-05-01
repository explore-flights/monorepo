import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudfrontConstruct } from '../constructs/cloudfront-construct';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { ApiLambdaConstruct } from '../constructs/api-lambda-construct';

export interface WebsiteStackProps extends cdk.StackProps {
  domain: string;
  certificateId: string;
  apiLambdaZipPath: string;
}

export class WebsiteStack extends cdk.Stack {
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const api = new ApiLambdaConstruct(this, 'ApiLambda', {
      apiLambdaZipPath: props.apiLambdaZipPath,
    });

    const cf = new CloudfrontConstruct(this, 'Cloudfront', {
      domain: props.domain,
      certificateId: props.certificateId,
      apiLambdaFunctionURL: api.functionURL,
    });

    this.distribution = cf.distribution;
  }
}