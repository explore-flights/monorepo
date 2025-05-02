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
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface CronLambdaConstructProps {
  cronLambdaZipPath: string;
  dataBucket: IBucket;
}

export class CronLambdaConstruct extends Construct {
  readonly lambda_1G: IFunction;
  readonly lambda_4G: IFunction;

  constructor(scope: Construct, id: string, props: CronLambdaConstructProps) {
    super(scope, id);

    const [
      ssmLufthansaClientId,
      ssmLufthansaClientSecret,
    ] = [
      this.ssmSecureString('/lufthansa/client-id'),
      this.ssmSecureString('/lufthansa/client-secret'),
    ];

    const lambdaBaseProps = {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(15),
      code: Code.fromAsset(props.cronLambdaZipPath),
      handler: 'bootstrap',
      environment: {
        FLIGHTS_SSM_LUFTHANSA_CLIENT_ID: ssmLufthansaClientId.parameterName,
        FLIGHTS_SSM_LUFTHANSA_CLIENT_SECRET: ssmLufthansaClientSecret.parameterName,
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

    this.lambda_4G = new Function(this, 'CronLambda_4G', {
      ...lambdaBaseProps,
      memorySize: 1024 * 4,
    });

    for (const fn of [this.lambda_1G, this.lambda_4G]) {
      props.dataBucket.grantRead(fn, 'raw/LH_Public_Data/flightschedules/*');
      props.dataBucket.grantWrite(fn, 'raw/LH_Public_Data/flightschedules_history/*')
      props.dataBucket.grantWrite(fn, 'raw/LH_Public_Data/*');
      props.dataBucket.grantWrite(fn, 'raw/ourairports_data/*');
      props.dataBucket.grantReadWrite(fn, 'processed/flights/*');
      props.dataBucket.grantReadWrite(fn, 'processed/schedules/*');
      props.dataBucket.grantReadWrite(fn, 'processed/metadata/*');
      props.dataBucket.grantWrite(fn, 'processed/feed/*');

      fn.addToRolePolicy(new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParameters'],
        resources: [
          ssmLufthansaClientId,
          ssmLufthansaClientSecret,
        ].map((v) => v.parameterArn),
      }));
    }
  }

  private ssmSecureString(name: string): IStringParameter {
    return StringParameter.fromSecureStringParameterAttributes(this, name, { parameterName: name });
  }
}