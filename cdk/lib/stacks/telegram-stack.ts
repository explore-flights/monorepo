import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TelegramLambdaConstruct } from '../constructs/telegram-lambda-construct';

export interface TelegramStackProps extends cdk.StackProps {
  telegramLambdaZipPath: string;
}

export class TelegramStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TelegramStackProps) {
    super(scope, id, props);

    new TelegramLambdaConstruct(this, 'TelegramLambda', {
      telegramLambdaZipPath: props.telegramLambdaZipPath,
    });
  }
}
