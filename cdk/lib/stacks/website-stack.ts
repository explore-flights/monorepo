import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudfrontConstruct } from '../constructs/cloudfront-construct';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';

export interface WebsiteStackProps extends cdk.StackProps {
  domain: string;
  certificateId: string;
}

export class WebsiteStack extends cdk.Stack {
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const cf = new CloudfrontConstruct(this, 'Cloudfront', {
      domain: props.domain,
      certificateId: props.certificateId,
    });

    this.distribution = cf.distribution;
  }
}