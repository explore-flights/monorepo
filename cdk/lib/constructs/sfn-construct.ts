import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import {
  DefinitionBody,
  Fail,
  IStateMachine,
  JsonPath,
  Map,
  Pass,
  ProcessorMode,
  Result,
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

    const definition = new Pass(this, 'InitIterator', {
      result: Result.fromObject({
        values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      }),
      resultPath: '$.iterator',
    })
      .next(
        new Map(this, 'Iterator', {
          itemsPath: '$.iterator.values',
          itemSelector: {
            'time': JsonPath.stringAt('$.time'),
            'schedule': JsonPath.format('{}:{}', JsonPath.stringAt('$.schedule'), JsonPath.stringAt('$$.Map.Item.Value')),
          },
          maxConcurrency: 1,
          resultPath: JsonPath.DISCARD,
        })
          .itemProcessor(this.iterationBody(props), { mode: ProcessorMode.INLINE })
      )
      .next(new Succeed(this, 'Success'));

    this.flightSchedules = new StateMachine(this, 'FlightSchedules', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });
  }

  private iterationBody(props: SfnConstructProps) {
    return new LambdaInvoke(this, 'LoadSchedulesTask', {
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
      .next(new LambdaInvoke(this, 'ConvertFlightsTask', {
        lambdaFunction: props.cronLambda,
        payload: TaskInput.fromObject({
          'action': 'convert_flights',
          'params': {
            'inputBucket': props.dataBucket.bucketName,
            'inputPrefix': 'processed/flights/',
            'outputBucket': props.dataBucket.bucketName,
            'outputPrefix': 'processed/schedules/',
            'dateRanges': JsonPath.objectAt('$.convertSchedulesResponse.dateRanges'),
          },
        }),
        payloadResponseOnly: true,
        resultPath: '$.convertNumbersResponse',
        retryOnServiceExceptions: true,
      }))
      .toSingleState('ConvertTry', { outputPath: '$[0]' })
      .addCatch(
        this.sendWebhookTask(
          'InvokeWebhookFailureTask',
          props.cronLambda,
          props.webhookUrl,
          JsonPath.format('FlightSchedules Cron {} ({}) failed', JsonPath.executionName, JsonPath.executionStartTime),
        )
          .next(new Fail(this, 'IterationFailure')),
      )
      .next(this.sendWebhookTask(
        'InvokeWebhookSuccessTask',
        props.cronLambda,
        props.webhookUrl,
        JsonPath.format(
          'FlightSchedules Cron {} succeeded:\nQueried:\n```json\n{}\n```\nTouched:\n```json\n{}\n```',
          JsonPath.stringAt('$.time'),
          JsonPath.jsonToString(JsonPath.objectAt('$.loadSchedulesResponse.loadFlightSchedules.input.dateRanges')),
          JsonPath.jsonToString(JsonPath.objectAt('$.convertSchedulesResponse.dateRanges')),
        ),
      ));
  }

  private sendWebhookTask(id: string, fn: IFunction, url: cdk.SecretValue, content: string) {
    if (!JsonPath.isEncodedJsonPath(content)) {
      content = JsonPath.format('{}', content);
    }

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
            'content': JsonPath.format(`\\{"content": {}\\}`, JsonPath.jsonToString(content)),
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