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
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { BASE_DATA_LAYER_SSM_PARAMETER_NAME } from '../util/consts';

export interface ApiLambdaConstructProps {
  apiLambdaZipPath: string;
  parquetBucket: IBucket;
}

export class ApiLambdaConstruct extends Construct {
  readonly lambda: Function;
  readonly functionURL: FunctionUrl;

  constructor(scope: Construct, id: string, props: ApiLambdaConstructProps) {
    super(scope, id);

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
        FLIGHTS_PARQUET_BUCKET: props.parquetBucket.bucketName,
      },
      layers: [
        LayerVersion.fromLayerVersionArn(
          scope,
          'LWALayer',
          Stack.of(this).formatArn({
            service: 'lambda',
            account: '753240598075', // https://github.com/aws/aws-lambda-web-adapter?tab=readme-ov-file#zip-packages
            resource: 'layer',
            resourceName: 'LambdaAdapterLayerArm64:28',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }),
        ),
        LayerVersion.fromLayerVersionArn(
          scope,
          'BaseDataLayer',
          StringParameter.valueForStringParameter(this, BASE_DATA_LAYER_SSM_PARAMETER_NAME),
        ),
      ],
      tracing: Tracing.DISABLED,
      role: new Role(this, 'ApiLambdaRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      }),
    });

    props.parquetBucket.grantRead(this.lambda);

    this.functionURL = new FunctionUrl(this, 'ApiLambdaFunctionUrl', {
      function: this.lambda,
      authType: FunctionUrlAuthType.AWS_IAM,
      invokeMode: InvokeMode.RESPONSE_STREAM,
    });
  }
}
