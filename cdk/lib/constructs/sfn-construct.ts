import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import {
  Choice, Condition,
  DefinitionBody,
  Fail,
  IStateMachine,
  JsonPath,
  StateMachine,
  Succeed,
  TaskInput
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface SfnConstructProps {
  dataBucket: IBucket;
  cronLambda_1G: IFunction;
  cronLambda_2G: IFunction;
  webhookUrl: cdk.SecretValue;
}

export class SfnConstruct extends Construct {
  readonly flightSchedules: IStateMachine;

  constructor(scope: Construct, id: string, props: SfnConstructProps) {
    super(scope, id);

    const LH_FLIGHT_SCHEDULES_PREFIX = 'raw/LH_Public_Data/flightschedules/';
    const PROCESSED_FLIGHTS_PREFIX = 'processed/flights/';
    const PROCESSED_SCHEDULES_PREFIX = 'processed/schedules/';
    const PROCESSED_METADATA_PREFIX = 'processed/metadata/';

    const checkRemainingChoice = new Choice(this, 'CheckRemaining', {});

    const definition = new LambdaInvoke(this, 'PrepareDailyCron', {
      lambdaFunction: props.cronLambda_1G,
      payload: TaskInput.fromObject({
        'action': 'cron',
        'params': {
          'prepareDailyCron': {
            'time': JsonPath.stringAt('$.time'),
            'offset': -1,
            'total': 30 * 12,
          },
        },
      }),
      payloadResponseOnly: true,
      resultSelector: {
        'completed': [],
        'remaining': JsonPath.objectAt('$.prepareDailyCron.dateRanges'),
      },
      resultPath: '$.loadScheduleRanges',
      retryOnServiceExceptions: true,
    })
      .next(
        checkRemainingChoice
          // region loop body -> remaining dates
          .when(
            Condition.isPresent('$.loadScheduleRanges.remaining[0]'),
            new LambdaInvoke(this, 'LoadSchedulesTask', {
              lambdaFunction: props.cronLambda_1G,
              payload: TaskInput.fromObject({
                'action': 'load_flight_schedules',
                'params': {
                  'outputBucket': props.dataBucket.bucketName,
                  'outputPrefix': LH_FLIGHT_SCHEDULES_PREFIX,
                  'dateRanges': JsonPath.objectAt('$.loadScheduleRanges.remaining'),
                  'allowPartial': true,
                },
              }),
              payloadResponseOnly: true,
              resultPath: '$.loadSchedulesResponse',
              retryOnServiceExceptions: true,
            })
              .next(new LambdaInvoke(this, 'MergeScheduleRanges', {
                lambdaFunction: props.cronLambda_1G,
                payload: TaskInput.fromObject({
                  'action': 'cron',
                  'params': {
                    'mergeDateRanges': JsonPath.array(
                      JsonPath.array(JsonPath.stringAt('$.loadScheduleRanges.completed'), JsonPath.stringAt('$.loadSchedulesResponse.completed')),
                      JsonPath.array(JsonPath.stringAt('$.loadSchedulesResponse.remaining')),
                    ),
                  },
                }),
                payloadResponseOnly: true,
                resultSelector: {
                  'completed': JsonPath.arrayGetItem(JsonPath.objectAt('$.mergeDateRanges'), 0),
                  'remaining': JsonPath.arrayGetItem(JsonPath.objectAt('$.mergeDateRanges'), 1),
                },
                resultPath: '$.loadScheduleRanges',
                retryOnServiceExceptions: true,
              }))
              .next(checkRemainingChoice),
          )
          // endregion
          // region conversion
          .otherwise(
            new LambdaInvoke(this, 'ConvertSchedulesTask', {
              lambdaFunction: props.cronLambda_2G,
              payload: TaskInput.fromObject({
                'action': 'convert_flight_schedules',
                'params': {
                  'inputBucket': props.dataBucket.bucketName,
                  'inputPrefix': LH_FLIGHT_SCHEDULES_PREFIX,
                  'outputBucket': props.dataBucket.bucketName,
                  'outputPrefix': PROCESSED_FLIGHTS_PREFIX,
                  'dateRanges': JsonPath.objectAt('$.loadScheduleRanges.completed'),
                },
              }),
              payloadResponseOnly: true,
              resultPath: '$.convertSchedulesResponse',
              retryOnServiceExceptions: true,
            })
              .next(new LambdaInvoke(this, 'ConvertFlightsTask', {
                lambdaFunction: props.cronLambda_2G,
                payload: TaskInput.fromObject({
                  'action': 'convert_flights',
                  'params': {
                    'inputBucket': props.dataBucket.bucketName,
                    'inputPrefix': PROCESSED_FLIGHTS_PREFIX,
                    'outputBucket': props.dataBucket.bucketName,
                    'outputPrefix': PROCESSED_SCHEDULES_PREFIX,
                    'dateRanges': JsonPath.objectAt('$.convertSchedulesResponse.dateRanges'),
                  },
                }),
                payloadResponseOnly: true,
                resultPath: '$.convertFlightsResponse',
                retryOnServiceExceptions: true,
              }))
              .next(new LambdaInvoke(this, 'UpdateMetadataTask', {
                lambdaFunction: props.cronLambda_2G,
                payload: TaskInput.fromObject({
                  'action': 'update_metadata',
                  'params': {
                    'inputBucket': props.dataBucket.bucketName,
                    'inputPrefix': PROCESSED_FLIGHTS_PREFIX,
                    'outputBucket': props.dataBucket.bucketName,
                    'outputPrefix': PROCESSED_METADATA_PREFIX,
                    'dateRanges': JsonPath.objectAt('$.convertSchedulesResponse.dateRanges'),
                  },
                }),
                payloadResponseOnly: true,
                resultPath: '$.updateMetadataResponse',
                retryOnServiceExceptions: true,
              }))
          )
          // endregion
      )
      .toSingleState('ConvertTry', { outputPath: '$[0]' })
      .addCatch(
        this.sendWebhookTask(
          'InvokeWebhookFailureTask',
          props.cronLambda_1G,
          props.webhookUrl,
          JsonPath.format('FlightSchedules Cron {} ({}) failed', JsonPath.executionName, JsonPath.executionStartTime),
        )
          .next(new Fail(this, 'Fail')),
      )
      .next(this.sendWebhookTask(
        'InvokeWebhookSuccessTask',
        props.cronLambda_1G,
        props.webhookUrl,
        JsonPath.format(
          'FlightSchedules Cron {} succeeded:\nQueried:\n```json\n{}\n```\nTouched:\n```json\n{}\n```',
          JsonPath.stringAt('$.time'),
          JsonPath.jsonToString(JsonPath.objectAt('$.loadScheduleRanges.completed')),
          JsonPath.jsonToString(JsonPath.objectAt('$.convertSchedulesResponse.dateRanges')),
        ),
      ))
      .next(new Succeed(this, 'Success'));

    this.flightSchedules = new StateMachine(this, 'FlightSchedules', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });
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