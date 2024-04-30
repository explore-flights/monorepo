import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AaaaRecord, ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';

export interface Route53StackProps extends cdk.StackProps {
  zoneName: string;
  websiteDistribution: IDistribution;
}

export class Route53Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    const zone = new PublicHostedZone(this, 'PublicHostedZone', {
      zoneName: props.zoneName,
    });

    new ARecord(this, 'WebsiteAliasARecord', {
      zone: zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(props.websiteDistribution)),
    });

    new AaaaRecord(this, 'WebsiteAliasAAAARecord', {
      zone: zone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(props.websiteDistribution)),
    });
  }
}