import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IHostedZone, PublicHostedZone } from 'aws-cdk-lib/aws-route53';

export interface Route53StackProps extends cdk.StackProps {
  zoneName: string;
}

export class Route53Stack extends cdk.Stack {
  readonly zone: IHostedZone;

  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    this.zone = new PublicHostedZone(this, 'PublicHostedZone', {
      zoneName: props.zoneName,
    });
  }
}