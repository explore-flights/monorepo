import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import {
  DefinitionBody, Fail,
  IStateMachine,
  JsonPath,
  StateMachine,
  Succeed,
  TaskInput
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface SfnConstructProps {
  dataBucket: IBucket;
  cronLambda: IFunction;
  webhookUrl: cdk.SecretValue;
}

export class SfnConstruct extends Construct {
  readonly flightSchedules: IStateMachine;

  constructor(scope: Construct, id: string, props: SfnConstructProps) {
    super(scope, id);

    const success = new Succeed(this, 'Success');
    const fail = new Fail(this, 'Fail');

    const definition = new LambdaInvoke(this, 'LoadSchedulesTask', {
      lambdaFunction: props.cronLambda,
      payload: TaskInput.fromObject({
        'action': 'cron',
        'params': {
          'loadFlightSchedules': {
            'outputBucket': props.dataBucket.bucketName,
            'outputPrefix': 'raw/LH_Public_Data/flightschedules/',
            'time': JsonPath.stringAt('$.time'),
            'schedule': JsonPath.stringAt('$.schedule'),
          },
        },
      }),
      payloadResponseOnly: true,
      resultPath: '$.loadSchedulesResponse',
      retryOnServiceExceptions: true,
    })
      .next(new LambdaInvoke(this, 'ConvertSchedulesTask', {
        lambdaFunction: props.cronLambda,
        payload: TaskInput.fromObject({
          'action': 'convert_flight_schedules',
          'params': {
            'inputBucket': JsonPath.stringAt('$.loadSchedulesResponse.loadFlightSchedules.input.outputBucket'),
            'inputPrefix': JsonPath.stringAt('$.loadSchedulesResponse.loadFlightSchedules.input.outputPrefix'),
            'outputBucket': props.dataBucket.bucketName,
            'outputPrefix': 'processed/flights/',
            'dateRanges': JsonPath.objectAt('$.loadSchedulesResponse.loadFlightSchedules.input.dateRanges'),
          },
        }),
        payloadResponseOnly: true,
        resultPath: '$.convertSchedulesResponse',
        retryOnServiceExceptions: true,
      }))
      .next(this.sendWebhookTask(
        'InvokeWebhookSuccessTask',
        props.cronLambda,
        props.webhookUrl,
        JsonPath.format(
          'FlightSchedules Cron {} succeeded:\n{}',
          JsonPath.stringAt('$.time'),
          JsonPath.jsonToString(JsonPath.objectAt('$.loadSchedulesResponse.loadFlightSchedules.input.dateRanges')),
        ),
      ))
      .next(success)
      .toSingleState('FlightSchedulesTry')
      .addCatch(
        this.sendWebhookTask(
          'InvokeWebhookFailureTask',
          props.cronLambda,
          props.webhookUrl,
          JsonPath.format('FlightSchedules Cron {} failed', JsonPath.stringAt('$.time')),
        )
          .next(fail),
      );

    this.flightSchedules = new StateMachine(this, 'FlightSchedules', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });
  }

  private sendWebhookTask(id: string, fn: IFunction, url: cdk.SecretValue, content: string) {
    return new LambdaInvoke(this, id, {
      lambdaFunction: fn,
      payload: TaskInput.fromObject({
        'action': 'invoke_webhook',
        'params': {
          'method': 'POST',
          'url': url.unsafeUnwrap(),
          'header': {
            'Content-Type': ['application/json'],
          },
          'query': {
            'wait': ['true'],
          },
          'body': {
            'content': JsonPath.jsonToString({
              'content': content,
            }),
            'isBase64': false,
          },
        },
      }),
      payloadResponseOnly: true,
      resultPath: '$.invokeWebhookResponse',
      retryOnServiceExceptions: true,
    });
  }
}