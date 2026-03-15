import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';

export interface Route53StackProps extends cdk.StackProps {
  zoneName: string;
}

export class Route53Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    new PublicHostedZone(this, 'PublicHostedZone', {
      zoneName: props.zoneName,
    });

    // route53 currently not used for DNS; DNS managed at Cloudflare

    // new ARecord(this, 'WebsiteAliasARecord', {
    //   zone: zone,
    //   target: RecordTarget.fromAlias(new CloudFrontTarget(props.websiteDistribution)),
    // });
    //
    // new AaaaRecord(this, 'WebsiteAliasAAAARecord', {
    //   zone: zone,
    //   target: RecordTarget.fromAlias(new CloudFrontTarget(props.websiteDistribution)),
    // });
  }
}