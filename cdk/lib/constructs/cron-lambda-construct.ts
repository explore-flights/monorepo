import { Construct } from 'constructs';
import {
  Architecture,
  Code,
  Function,
  IFunction,
  Runtime,
  Tracing
} from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';

export interface CronLambdaConstructProps {
  cronLambdaZipPath: string;
  dataBucket: IBucket;
}

export class CronLambdaConstruct extends Construct {
  readonly lambda: IFunction;

  constructor(scope: Construct, id: string, props: CronLambdaConstructProps) {
    super(scope, id);

    this.lambda = new Function(this, 'CronLambda', {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.minutes(15),
      code: Code.fromAsset(props.cronLambdaZipPath),
      handler: 'bootstrap',
      environment: {},
      tracing: Tracing.DISABLED,
      role: new Role(this, 'CronLambdaRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [{ managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' }],
      }),
    });

    props.dataBucket.grantRead(this.lambda, '*');
  }
}