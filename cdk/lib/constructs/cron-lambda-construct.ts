import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Architecture,
  Code,
  Function, FunctionProps,
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
  lhApiClientId: cdk.SecretValue;
  lhApiClientSecret: cdk.SecretValue;
}

export class CronLambdaConstruct extends Construct {
  readonly lambda_1G: IFunction;
  readonly lambda_2G: IFunction;

  constructor(scope: Construct, id: string, props: CronLambdaConstructProps) {
    super(scope, id);

    const lambdaBaseProps = {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(15),
      code: Code.fromAsset(props.cronLambdaZipPath),
      handler: 'bootstrap',
      environment: {
        FLIGHTS_LH_API_CLIENT_ID: props.lhApiClientId.unsafeUnwrap(),
        FLIGHTS_LH_API_CLIENT_SECRET: props.lhApiClientSecret.unsafeUnwrap(),
      },
      tracing: Tracing.DISABLED,
      role: new Role(this, 'CronLambdaRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [{ managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' }],
      }),
    } satisfies FunctionProps;

    this.lambda_1G = new Function(this, 'CronLambda_1G', {
      ...lambdaBaseProps,
      memorySize: 1024,
    });

    this.lambda_2G = new Function(this, 'CronLambda_2G', {
      ...lambdaBaseProps,
      memorySize: 1024 * 2,
    });

    for (const fn of [this.lambda_1G, this.lambda_2G]) {
      props.dataBucket.grantRead(fn, 'raw/LH_Public_Data/flightschedules/*');
      props.dataBucket.grantWrite(fn, 'raw/LH_Public_Data/*');
      props.dataBucket.grantWrite(fn, 'raw/ourairports_data/*');
      props.dataBucket.grantReadWrite(fn, 'processed/flights/*');
      props.dataBucket.grantReadWrite(fn, 'processed/schedules/*');
      props.dataBucket.grantReadWrite(fn, 'processed/metadata/*');
    }
  }
}