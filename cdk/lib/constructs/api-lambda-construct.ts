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
import { IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface ApiLambdaConstructProps {
  apiLambdaZipPath: string;
  dataBucket: IBucket;
  authBucket: IBucket;
}

export class ApiLambdaConstruct extends Construct {
  readonly lambda: Function;
  readonly functionURL: FunctionUrl;

  constructor(scope: Construct, id: string, props: ApiLambdaConstructProps) {
    super(scope, id);

    const [
      ssmGoogleClientId,
      ssmGoogleClientSecret,
      ssmSessionRsaPriv,
      ssmSessionRsaPub,
    ] = [
      this.ssmSecureString('/google/client-id'),
      this.ssmSecureString('/google/client-secret'),
      this.ssmSecureString('/api/session/id_rsa'),
      this.ssmSecureString('/api/session/id_rsa.pub'),
    ];

    this.lambda = new Function(this, 'ApiLambda', {
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
        FLIGHTS_SSM_GOOGLE_CLIENT_ID: ssmGoogleClientId.parameterName,
        FLIGHTS_SSM_GOOGLE_CLIENT_SECRET: ssmGoogleClientSecret.parameterName,
        FLIGHTS_SSM_SESSION_RSA_PRIV: ssmSessionRsaPriv.parameterName,
        FLIGHTS_SSM_SESSION_RSA_PUB: ssmSessionRsaPub.parameterName,
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

    this.lambda.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ssm:GetParameters'],
      resources: [ssmGoogleClientId, ssmGoogleClientSecret, ssmSessionRsaPriv, ssmSessionRsaPub].map((v) => v.parameterArn),
    }));

    props.dataBucket.grantRead(this.lambda, 'processed/flights/*');
    props.dataBucket.grantRead(this.lambda, 'processed/schedules/*');
    props.dataBucket.grantRead(this.lambda, 'processed/metadata/*');
    props.dataBucket.grantRead(this.lambda, 'raw/ourairports_data/airports.csv');
    props.dataBucket.grantRead(this.lambda, 'raw/ourairports_data/countries.csv');
    props.dataBucket.grantRead(this.lambda, 'raw/ourairports_data/regions.csv');
    props.dataBucket.grantRead(this.lambda, 'raw/LH_Public_Data/aircraft.json');

    props.authBucket.grantReadWrite(this.lambda, 'authreq/*');
    props.authBucket.grantReadWrite(this.lambda, 'federation/*');
    props.authBucket.grantReadWrite(this.lambda, 'account/*');

    this.functionURL = new FunctionUrl(this, 'ApiLambdaFunctionUrl', {
      function: this.lambda,
      authType: FunctionUrlAuthType.AWS_IAM,
      invokeMode: InvokeMode.RESPONSE_STREAM,
    });
  }

  private ssmSecureString(name: string): IStringParameter {
    return StringParameter.fromSecureStringParameterAttributes(this, name, { parameterName: name });
  }
}