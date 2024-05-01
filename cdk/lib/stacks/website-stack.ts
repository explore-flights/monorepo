import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudfrontConstruct } from '../constructs/cloudfront-construct';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { AcmStack } from './acm-stack';

export interface WebsiteStackProps extends cdk.StackProps {
  domain: string;
  hostedZone: IHostedZone;
}

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    const acm = new AcmStack(this, 'ACM', {
      env: { region: 'us-east-1' },
      crossRegionReferences: true,
      certificates: {
        'explore.flights': props.hostedZone,
      },
    });

    const cf = new CloudfrontConstruct(this, 'Cloudfront', {
      domain: props.domain,
      hostedZone: props.hostedZone,
      certificate: acm.certificates['explore.flights'],
    });
  }
}