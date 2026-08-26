import { ArnFormat, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  Architecture,
  Code,
  Function,
  FunctionUrl,
  FunctionUrlAuthType,
  InvokeMode,
  LayerVersion,
  Runtime,
  Tracing,
} from 'aws-cdk-lib/aws-lambda';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface TelegramLambdaConstructProps {
  telegramLambdaZipPath: string;
}

export class TelegramLambdaConstruct extends Construct {
  readonly lambda: Function;
  readonly functionURL: FunctionUrl;
  readonly webhookUrlParameter: StringParameter;

  constructor(scope: Construct, id: string, props: TelegramLambdaConstructProps) {
    super(scope, id);

    this.lambda = new Function(this, 'TelegramLambda', {
      runtime: Runtime.PROVIDED_AL2023,
      architecture: Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(30),
      code: Code.fromAsset(props.telegramLambdaZipPath),
      handler: 'bootstrap',
      environment: {
        AWS_LWA_PORT: '8080',
        AWS_LWA_ASYNC_INIT: 'true',
      },
      layers: [
        LayerVersion.fromLayerVersionArn(
          this,
          'LWALayer',
          Stack.of(this).formatArn({
            service: 'lambda',
            account: '753240598075', // https://github.com/aws/aws-lambda-web-adapter?tab=readme-ov-file#zip-packages
            resource: 'layer',
            resourceName: 'LambdaAdapterLayerArm64:28',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }),
        ),
      ],
      tracing: Tracing.DISABLED,
      role: new Role(this, 'TelegramLambdaRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      }),
    });

    this.functionURL = new FunctionUrl(this, 'TelegramLambdaFunctionUrl', {
      function: this.lambda,
      authType: FunctionUrlAuthType.NONE,
      invokeMode: InvokeMode.BUFFERED,
    });

    this.webhookUrlParameter = new StringParameter(this, 'WebhookUrlParameter', {
      parameterName: '/telegram/webhookurl',
      description: 'Public Lambda Function URL used by the Telegram webhook',
      stringValue: this.functionURL.url,
    });
    this.webhookUrlParameter.applyRemovalPolicy(RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    this.lambda.addToRolePolicy(new PolicyStatement({
      actions: ['ssm:GetParameters'],
      resources: [
        Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: 'telegram/*',
          arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
        }),
      ],
    }));
  }
}
