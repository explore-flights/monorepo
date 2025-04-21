import { Construct } from 'constructs';
import {
  Architecture,
  Code,
  Function, FunctionProps,
  IFunction,
  Runtime,
  Tracing
} from 'aws-cdk-lib/aws-lambda';
import { Duration, Size } from 'aws-cdk-lib';
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
  readonly lambda_10G: IFunction;

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
        LD_LIBRARY_PATH: '/opt/lib,/opt/lib/duckdb_extensions/v1.2.2/linux_arm64',
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

    this.lambda_10G = new Function(this, 'CronLambda_10G', {
      ...lambdaBaseProps,
      memorySize: 1024 * 10,
      ephemeralStorageSize: Size.gibibytes(10),
    });

    for (const fn of [this.lambda_1G, this.lambda_4G, this.lambda_10G]) {
      props.dataBucket.grantRead(fn, 'raw/LH_Public_Data/flightschedules/*');
      props.dataBucket.grantWrite(fn, 'raw/LH_Public_Data/*');
      props.dataBucket.grantWrite(fn, 'raw/ourairports_data/*');
      props.dataBucket.grantReadWrite(fn, 'processed/flights/*');
      props.dataBucket.grantReadWrite(fn, 'processed/schedules/*');
      props.dataBucket.grantReadWrite(fn, 'processed/metadata/*');
      props.dataBucket.grantWrite(fn, 'processed/feed/*');
      props.dataBucket.grantReadWrite(fn, 'processed/flights.db');

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