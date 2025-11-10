import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import {
  Choice,
  Condition,
  DefinitionBody,
  Fail,
  IntegrationPattern,
  IStateMachine,
  JsonPath,
  Pass,
  StateMachine,
  Succeed,
  TaskInput
} from 'aws-cdk-lib/aws-stepfunctions';
import { EcsFargateLaunchTarget, EcsRunTask, LambdaInvoke, CallAwsService } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { ContainerDefinition, FargatePlatformVersion, ICluster, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { IVpc, SecurityGroup, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { BASE_DATA_LAYER_NAME, BASE_DATA_LAYER_SSM_PARAMETER_NAME } from '../util/consts';

export interface SfnConstructProps {
  dataBucket: IBucket;
  parquetBucket: IBucket;
  cronLambda_1G: IFunction;
  cronLambda_4G: IFunction;
  updateDatabaseVpc: IVpc;
  updateDatabaseSubnets: SubnetSelection;
  updateDatabaseCluster: ICluster;
  updateDatabaseTask: TaskDefinition;
  updateDatabaseTaskContainer: ContainerDefinition;
  webhookUrl: cdk.SecretValue;
}

export class SfnConstruct extends Construct {
  readonly flightSchedules: IStateMachine;

  constructor(scope: Construct, id: string, props: SfnConstructProps) {
    super(scope, id);

    const LH_FLIGHT_SCHEDULES_PREFIX = 'raw/LH_Public_Data/flightschedules/';
    const DATABASE_UPDATE_SUMMARY_KEY = 'tmp/cron_database_update_summary.json';

    const checkRemainingChoice = new Choice(this, 'CheckRemaining', {});

    const updateDatabaseSecurityGroup = new SecurityGroup(this, 'UpdateDatabaseSecurityGroup', {
      vpc: props.updateDatabaseVpc,
      allowAllOutbound: true,
      allowAllIpv6Outbound: false,
    });

    const definition = new Choice(this, 'CheckInitial', {})
      .when(
        Condition.isNotPresent('$.loadScheduleRanges'),
        new LambdaInvoke(this, 'PrepareDailyCron', {
          lambdaFunction: props.cronLambda_1G,
          payload: TaskInput.fromObject({
            'action': 'cron',
            'params': {
              'prepareDailyCron': {
                'time': JsonPath.stringAt('$.time'),
                'offset': -2,
                'total': (30 * 12) + 2,
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
        }),
      )
      .afterwards({ includeOtherwise: true })
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
            new Choice(this, 'CheckCreateFlightSchedulesHistoryTask', {})
              .when(
                Condition.isNotPresent('$.createFlightSchedulesHistoryResponse'),
                new LambdaInvoke(this, 'CreateFlightSchedulesHistoryTask', {
                  lambdaFunction: props.cronLambda_4G,
                  payload: TaskInput.fromObject({
                    'action': 'create_flight_schedules_history',
                    'params': {
                      'time': JsonPath.stringAt('$.time'),
                      'inputBucket': props.dataBucket.bucketName,
                      'inputPrefix': LH_FLIGHT_SCHEDULES_PREFIX,
                      'outputBucket': props.dataBucket.bucketName,
                      'outputPrefix': 'raw/LH_Public_Data/flightschedules_history/',
                      'dateRanges': JsonPath.objectAt('$.loadScheduleRanges.completed'),
                    },
                  }),
                  payloadResponseOnly: true,
                  resultPath: '$.createFlightSchedulesHistoryResponse',
                  retryOnServiceExceptions: true,
                }),
              )
              .afterwards({ includeOtherwise: true })
              .next(new Pass(this, 'PrepareUpdateDatabaseCommand', {
                parameters: {
                  'args': JsonPath.array(
                    JsonPath.format('--time={}', JsonPath.stringAt('$.time')),
                    `--database-bucket=${props.dataBucket.bucketName}`,
                    '--full-database-key=processed/flights.db',
                    '--basedata-database-key=processed/basedata.db',
                    `--parquet-bucket=${props.parquetBucket.bucketName}`,
                    '--variants-key=variants.parquet',
                    '--report-key=report.parquet',
                    '--connections-key=connections.parquet',
                    '--history-prefix=history/',
                    '--latest-prefix=latest/',
                    JsonPath.format('--input-bucket={}', JsonPath.stringAt('$.createFlightSchedulesHistoryResponse.bucket')),
                    JsonPath.format('--input-key={}', JsonPath.stringAt('$.createFlightSchedulesHistoryResponse.key')),
                    `--update-summary-bucket=${props.dataBucket.bucketName}`,
                    `--update-summary-key=${DATABASE_UPDATE_SUMMARY_KEY}`,
                    '--skip-update-database=false',
                  ),
                },
                resultPath: '$.updateDatabaseCommand',
              }))
              .next(new EcsRunTask(this, 'UpdateDatabaseTask', {
                integrationPattern: IntegrationPattern.RUN_JOB, // runTask.sync
                cluster: props.updateDatabaseCluster,
                taskDefinition: props.updateDatabaseTask,
                launchTarget: new EcsFargateLaunchTarget({
                  platformVersion: FargatePlatformVersion.LATEST,
                }),
                containerOverrides: [
                  {
                    containerDefinition: props.updateDatabaseTaskContainer,
                    command: JsonPath.listAt('$.updateDatabaseCommand.args'),
                  }
                ],
                assignPublicIp: true, // required to access internet resources without NAT
                subnets: props.updateDatabaseSubnets,
                securityGroups: [updateDatabaseSecurityGroup],
                resultPath: '$.updateDatabaseResponse',
              }))
              .next(new LambdaInvoke(this, 'UpdateLambdaLayerTask', {
                lambdaFunction: props.cronLambda_4G,
                payload: TaskInput.fromObject({
                  'action': 'update_lambda_layer',
                  'params': {
                    'databaseBucket': props.dataBucket.bucketName,
                    'baseDataDatabaseKey': 'processed/basedata.db',
                    'parquetBucket': props.parquetBucket.bucketName,
                    'variantsKey': 'variants.parquet',
                    'reportKey': 'report.parquet',
                    'connectionsKey': 'connections.parquet',
                    'layerName': BASE_DATA_LAYER_NAME,
                    'ssmParameterName': BASE_DATA_LAYER_SSM_PARAMETER_NAME,
                  },
                }),
                payloadResponseOnly: true,
                resultPath: '$.updateLambdaLayerResponse',
                retryOnServiceExceptions: true,
              }))
              .next(new CallAwsService(this, 'LoadUpdateSummaryTask', {
                service: 's3',
                action: 'getObject',
                parameters: {
                  'Bucket': props.dataBucket.bucketName,
                  'Key': DATABASE_UPDATE_SUMMARY_KEY,
                },
                iamAction: 's3:GetObject',
                iamResources: [
                  props.dataBucket.arnForObjects(DATABASE_UPDATE_SUMMARY_KEY),
                ],
                resultSelector: {
                  // discard everything but Body
                  'Body': JsonPath.stringAt('$.Body'),
                },
                resultPath: '$.updateSummary',
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
          'FlightSchedules Cron {} succeeded:\nQueried:\n```json\n{}\n```\nUpdate Summary:\n```json\n{}\n```',
          JsonPath.stringAt('$.time'),
          JsonPath.jsonToString(JsonPath.objectAt('$.loadScheduleRanges.completed')),
          JsonPath.stringAt('$.updateSummary.Body'),
        ),
      ))
      .next(new Succeed(this, 'Success'));

    this.flightSchedules = new StateMachine(this, 'FlightSchedules', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });

    new StateMachine(this, 'UpdateDatabaseAndLayer', {
      definitionBody: DefinitionBody.fromChainable(
        new Pass(this, 'PrepareUpdateDatabaseCommand2', {
          parameters: {
            'args': JsonPath.array(
              JsonPath.format('--time={}', JsonPath.executionStartTime),
              `--database-bucket=${props.dataBucket.bucketName}`,
              '--full-database-key=processed/flights.db',
              '--basedata-database-key=processed/basedata.db',
              `--parquet-bucket=${props.parquetBucket.bucketName}`,
              '--variants-key=variants.parquet',
              '--report-key=report.parquet',
              '--connections-key=connections.parquet',
              '--history-prefix=history/',
              '--latest-prefix=latest/',
              '--skip-update-database=true',
            ),
          },
          resultPath: '$.updateDatabaseCommand',
        })
          .next(new EcsRunTask(this, 'UpdateDatabaseTask2', {
            integrationPattern: IntegrationPattern.RUN_JOB, // runTask.sync
            cluster: props.updateDatabaseCluster,
            taskDefinition: props.updateDatabaseTask,
            launchTarget: new EcsFargateLaunchTarget({
              platformVersion: FargatePlatformVersion.LATEST,
            }),
            containerOverrides: [
              {
                containerDefinition: props.updateDatabaseTaskContainer,
                command: JsonPath.listAt('$.updateDatabaseCommand.args'),
              }
            ],
            assignPublicIp: true, // required to access internet resources without NAT
            subnets: props.updateDatabaseSubnets,
            securityGroups: [updateDatabaseSecurityGroup],
            resultPath: '$.updateDatabaseResponse',
          }))
          .next(new LambdaInvoke(this, 'UpdateLambdaLayerTask2', {
            lambdaFunction: props.cronLambda_4G,
            payload: TaskInput.fromObject({
              'action': 'update_lambda_layer',
              'params': {
                'databaseBucket': props.dataBucket.bucketName,
                'baseDataDatabaseKey': 'processed/basedata.db',
                'parquetBucket': props.parquetBucket.bucketName,
                'variantsKey': 'variants.parquet',
                'reportKey': 'report.parquet',
                'connectionsKey': 'connections.parquet',
                'layerName': BASE_DATA_LAYER_NAME,
                'ssmParameterName': BASE_DATA_LAYER_SSM_PARAMETER_NAME,
              },
            }),
            payloadResponseOnly: true,
            resultPath: '$.updateLambdaLayerResponse',
            retryOnServiceExceptions: true,
          }))
      ),
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
