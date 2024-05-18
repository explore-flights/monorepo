import { Construct } from 'constructs';
import {
  Architecture,
  Code,
  Function,
  FunctionUrl,
  FunctionUrlAuthType,
  InvokeMode,
  LayerVersion,
  Runtime,
  Tracing
} from 'aws-cdk-lib/aws-lambda';
import { ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';

export interface ApiLambdaConstructProps {
  apiLambdaZipPath: string;
  dataBucket: IBucket;
  authBucket: IBucket;
}

export class ApiLambdaConstruct extends Construct {
  readonly functionURL: FunctionUrl;

  constructor(scope: Construct, id: string, props: ApiLambdaConstructProps) {
    super(scope, id);

    const lambda = new Function(this, 'ApiLambda', {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      code: Code.fromAsset(props.apiLambdaZipPath),
      handler: 'bootstrap',
      environment: {
        AWS_LWA_PORT: '8080',
        AWS_LWA_ASYNC_INIT: 'true',
        AWS_LWA_INVOKE_MODE: 'response_stream',
        FLIGHTS_DATA_BUCKET: props.dataBucket.bucketName,
        FLIGHTS_AUTH_BUCKET: props.authBucket.bucketName,
        FLIGHTS_SSM_GOOGLE_CLIENT_ID: '/google/client-id',
        FLIGHTS_SSM_GOOGLE_CLIENT_SECRET: '/google/client-secret',
        FLIGHTS_SSM_SESSION_RSA_PRIV: '/api/session/id_rsa',
        FLIGHTS_SSM_SESSION_RSA_PUB: '/api/session/id_rsa.pub',
      },
      layers: [
        LayerVersion.fromLayerVersionArn(
          scope,
          'LWALayer',
          Stack.of(this).formatArn({
            service: 'lambda',
            account: '753240598075', // https://github.com/awslabs/aws-lambda-web-adapter?tab=readme-ov-file#lambda-functions-packaged-as-zip-package-for-aws-managed-runtimes
            resource: 'layer',
            resourceName: 'LambdaAdapterLayerArm64:22',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }),
        ),
      ],
      tracing: Tracing.DISABLED,
      role: new Role(this, 'ApiLambdaRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [{ managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' }],
      }),
    });

    lambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ssm:GetParameters'],
      resources: ['*'],
    }));

    props.dataBucket.grantRead(lambda, 'processed/flights/*');
    props.dataBucket.grantRead(lambda, 'raw/ourairports_data/airports.csv');
    props.dataBucket.grantRead(lambda, 'raw/ourairports_data/countries.csv');
    props.dataBucket.grantRead(lambda, 'raw/ourairports_data/regions.csv');
    props.dataBucket.grantRead(lambda, 'raw/LH_Public_Data/aircraft.json');

    props.authBucket.grantReadWrite(lambda, 'authreq/*');
    props.authBucket.grantReadWrite(lambda, 'federation/*');
    props.authBucket.grantReadWrite(lambda, 'account/*');

    this.functionURL = new FunctionUrl(this, 'ApiLambdaFunctionUrl', {
      function: lambda,
      // https://github.com/pwrdrvr/lambda-url-signing check later
      authType: FunctionUrlAuthType.NONE,
      invokeMode: InvokeMode.RESPONSE_STREAM,
    });
  }
}