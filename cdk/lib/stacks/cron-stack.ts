import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { CronLambdaConstruct } from '../constructs/cron-lambda-construct';

export interface CronStackProps extends cdk.StackProps {
  cronLambdaZipPath: string;
  dataBucket: IBucket;
}

export class CronStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);

    new CronLambdaConstruct(this, 'CronLambda', {
      cronLambdaZipPath: props.cronLambdaZipPath,
      dataBucket: props.dataBucket,
      lhApiClientId: cdk.SecretValue.cfnParameter(new cdk.CfnParameter(this, 'lhApiClientId', {
        type: 'String',
        noEcho: true,
      })),
      lhApiClientSecret: cdk.SecretValue.cfnParameter(new cdk.CfnParameter(this, 'lhApiClientSecret', {
        type: 'String',
        noEcho: true,
      })),
    });
  }
}