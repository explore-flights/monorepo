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
import {
  CallAwsService,
  EcsFargateLaunchTarget,
  EcsRunTask,
  LambdaInvoke,
  StepFunctionsStartExecution
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
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
  readonly fetchSchedules: IStateMachine;
  readonly updateFlightData: IStateMachine;
  readonly flightSchedules: IStateMachine;

  constructor(scope: Construct, id: string, props: SfnConstructProps) {
    super(scope, id);

    const updateDatabaseSecurityGroup = new SecurityGroup(this, 'UpdateDatabaseSecurityGroup', {
      vpc: props.updateDatabaseVpc,
      allowAllOutbound: true,
      allowAllIpv6Outbound: false,
    });

    this.fetchSchedules = this.createFetchSchedulesStateMachine(props);
    this.updateFlightData = this.createUpdateFlightDataStateMachine(
      props,
      updateDatabaseSecurityGroup,
    );
    this.flightSchedules = this.createFlightSchedulesStateMachine(props);

    for (const stateMachine of [this.flightSchedules, this.fetchSchedules]) {
      stateMachine.grantExecution(props.cronLambda_1G, 'states:GetExecutionHistory');
    }
  }

  private createFetchSchedulesStateMachine(props: SfnConstructProps): IStateMachine {
    const flightSchedulesPrefix = 'raw/LH_Public_Data/flightschedules/';
    const checkRemaining = new Choice(this, 'FetchSchedulesCheckRemaining');

    const definition = checkRemaining
      .when(
        Condition.isPresent('$.loadScheduleRanges.remaining[0]'),
        new LambdaInvoke(this, 'FetchSchedulesLoadSchedules', {
          lambdaFunction: props.cronLambda_1G,
          payload: TaskInput.fromObject({
            'action': 'load_flight_schedules',
            'params': {
              'outputBucket': props.dataBucket.bucketName,
              'outputPrefix': flightSchedulesPrefix,
              'dateRanges': JsonPath.objectAt('$.loadScheduleRanges.remaining'),
              'allowPartial': true,
            },
          }),
          payloadResponseOnly: true,
          resultPath: '$.loadSchedulesResponse',
          retryOnServiceExceptions: true,
        })
          .next(new LambdaInvoke(this, 'FetchSchedulesMergeScheduleRanges', {
            lambdaFunction: props.cronLambda_1G,
            payload: TaskInput.fromObject({
              'action': 'cron',
              'params': {
                'mergeDateRanges': JsonPath.array(
                  JsonPath.array(
                    JsonPath.stringAt('$.loadScheduleRanges.completed'),
                    JsonPath.stringAt('$.loadSchedulesResponse.completed'),
                  ),
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
          .next(checkRemaining),
      )
      .otherwise(new Succeed(this, 'FetchSchedulesSuccess'));

    return new StateMachine(this, 'FetchSchedules', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });
  }

  private createUpdateFlightDataStateMachine(
    props: SfnConstructProps,
    updateDatabaseSecurityGroup: SecurityGroup,
  ): IStateMachine {
    const databaseUpdateSummaryKey = 'tmp/cron_database_update_summary.json';

    const prepareUpdateWithArchive = new Pass(this, 'PrepareUpdateDatabaseWithArchive', {
      parameters: {
        'args': JsonPath.array(
          JsonPath.format('--time={}', JsonPath.stringAt('$.time')),
          `--database-bucket=${props.dataBucket.bucketName}`,
          '--full-database-key=processed/flights.db',
          '--basedata-database-key=processed/basedata.db',
          `--parquet-bucket=${props.parquetBucket.bucketName}`,
          JsonPath.format('--parquet-prefix={}/', JsonPath.stringAt('$.time')),
          JsonPath.format('--input-bucket={}', JsonPath.stringAt('$.inputArchive.bucket')),
          JsonPath.format('--input-key={}', JsonPath.stringAt('$.inputArchive.key')),
          `--update-summary-bucket=${props.dataBucket.bucketName}`,
          `--update-summary-key=${databaseUpdateSummaryKey}`,
          '--skip-update-database=false',
        ),
      },
      resultPath: '$.updateDatabaseCommand',
    });

    const prepareUpdateWithoutArchive = new Pass(this, 'PrepareUpdateDatabaseWithoutArchive', {
      parameters: {
        'args': JsonPath.array(
          JsonPath.format('--time={}', JsonPath.stringAt('$.time')),
          `--database-bucket=${props.dataBucket.bucketName}`,
          '--full-database-key=processed/flights.db',
          '--basedata-database-key=processed/basedata.db',
          `--parquet-bucket=${props.parquetBucket.bucketName}`,
          JsonPath.format('--parquet-prefix={}/', JsonPath.stringAt('$.time')),
          '--skip-update-database=true',
        ),
      },
      resultPath: '$.updateDatabaseCommand',
    });

    const definition = new Choice(this, 'ConfigureUpdateDatabase')
      .when(Condition.isPresent('$.inputArchive'), prepareUpdateWithArchive)
      .otherwise(prepareUpdateWithoutArchive)
      .afterwards()
      .next(new EcsRunTask(this, 'UpdateDatabaseTask', {
        integrationPattern: IntegrationPattern.RUN_JOB,
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
        assignPublicIp: true,
        subnets: props.updateDatabaseSubnets,
        securityGroups: [updateDatabaseSecurityGroup],
        resultPath: '$.updateDatabaseResponse',
      }))
      .next(new LambdaInvoke(this, 'UpdateLambdaLayerTask', {
        lambdaFunction: props.cronLambda_4G,
        payload: TaskInput.fromObject({
          'action': 'update_lambda_layer',
          'params': {
            'version': JsonPath.stringAt('$.time'),
            'databaseBucket': props.dataBucket.bucketName,
            'baseDataDatabaseKey': 'processed/basedata.db',
            'parquetBucket': props.parquetBucket.bucketName,
            'parquetPrefix': JsonPath.format('{}/', JsonPath.stringAt('$.time')),
            'layerName': BASE_DATA_LAYER_NAME,
            'ssmParameterName': BASE_DATA_LAYER_SSM_PARAMETER_NAME,
          },
        }),
        payloadResponseOnly: true,
        resultPath: '$.updateLambdaLayerResponse',
        retryOnServiceExceptions: true,
      }))
      .next(new LambdaInvoke(this, 'DeleteOldS3DataTask', {
        lambdaFunction: props.cronLambda_1G,
        payload: TaskInput.fromObject({
          'action': 'delete_s3_data',
          'params': {
            'bucket': props.parquetBucket.bucketName,
            'excludePrefix': JsonPath.format('{}/', JsonPath.stringAt('$.time')),
          },
        }),
        payloadResponseOnly: true,
        resultPath: '$.deleteS3DataResponse',
        retryOnServiceExceptions: true,
      }));

    return new StateMachine(this, 'UpdateFlightData', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });
  }

  private createFlightSchedulesStateMachine(props: SfnConstructProps): IStateMachine {
    const databaseUpdateSummaryKey = 'tmp/cron_database_update_summary.json';

    const runFetchSchedules = new StepFunctionsStartExecution(this, 'RunFetchSchedules', {
      stateMachine: this.fetchSchedules,
      integrationPattern: IntegrationPattern.RUN_JOB,
      associateWithParent: true,
      input: TaskInput.fromObject({
        'loadScheduleRanges': JsonPath.objectAt('$.loadScheduleRanges'),
      }),
      resultSelector: {
        'loadScheduleRanges': JsonPath.objectAt('$.Output.loadScheduleRanges'),
      },
      resultPath: '$.fetchSchedules',
    })
      .next(new LambdaInvoke(this, 'CreateFlightSchedulesHistory', {
        lambdaFunction: props.cronLambda_4G,
        payload: TaskInput.fromObject({
          'action': 'create_flight_schedules_history',
          'params': {
            'time': JsonPath.stringAt('$.time'),
            'inputBucket': props.dataBucket.bucketName,
            'inputPrefix': 'raw/LH_Public_Data/flightschedules/',
            'outputBucket': props.dataBucket.bucketName,
            'outputPrefix': 'raw/LH_Public_Data/flightschedules_history/',
            'dateRanges': JsonPath.objectAt('$.fetchSchedules.loadScheduleRanges.completed'),
          },
        }),
        payloadResponseOnly: true,
        resultPath: '$.inputArchive',
        retryOnServiceExceptions: true,
      }))
      .next(new StepFunctionsStartExecution(this, 'RunUpdateFlightData', {
        stateMachine: this.updateFlightData,
        integrationPattern: IntegrationPattern.RUN_JOB,
        associateWithParent: true,
        input: TaskInput.fromObject({
          'time': JsonPath.stringAt('$.time'),
          'inputArchive': JsonPath.objectAt('$.inputArchive'),
        }),
        resultPath: JsonPath.DISCARD,
      }))
      .next(new CallAwsService(this, 'LoadUpdateSummary', {
        service: 's3',
        action: 'getObject',
        parameters: {
          'Bucket': props.dataBucket.bucketName,
          'Key': databaseUpdateSummaryKey,
        },
        iamAction: 's3:GetObject',
        iamResources: [
          props.dataBucket.arnForObjects(databaseUpdateSummaryKey),
        ],
        resultSelector: {
          'Body': JsonPath.stringAt('$.Body'),
        },
        resultPath: '$.updateSummary',
      }));

    const checkInitial = new Choice(this, 'FetchSchedulesCheckInitial')
      .when(
        Condition.isNotPresent('$.loadScheduleRanges'),
        new LambdaInvoke(this, 'FetchSchedulesPrepareDailyCron', {
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
      .next(runFetchSchedules);

    const definition = new Choice(this, 'CheckRetryExecution')
      .when(
        Condition.isPresent('$.retryExecutionArn'),
        new LambdaInvoke(this, 'PrepareRetryPayload', {
          lambdaFunction: props.cronLambda_1G,
          payload: TaskInput.fromObject({
            'action': 'prepare_retry_payload',
            'params': JsonPath.objectAt('$'),
          }),
          payloadResponseOnly: true,
          resultPath: '$',
          retryOnServiceExceptions: true,
        }),
      )
      .afterwards({ includeOtherwise: true })
      .next(checkInitial)
      .toSingleState('OrchestrationTry', { outputPath: '$[0]' })
      .addCatch(
        this.sendWebhookTask(
          'InvokeWebhookFailureTask',
          props.cronLambda_1G,
          props.webhookUrl,
          JsonPath.format(
            'FlightSchedules Cron {} ({}) failed',
            JsonPath.executionName,
            JsonPath.executionStartTime,
          ),
        )
          .next(new Fail(this, 'OrchestrationFailed')),
      )
      .next(this.sendWebhookTask(
        'InvokeWebhookSuccessTask',
        props.cronLambda_1G,
        props.webhookUrl,
        JsonPath.format(
          'FlightSchedules Cron {} succeeded:\nQueried:\n```json\n{}\n```\nUpdate Summary:\n```json\n{}\n```',
          JsonPath.stringAt('$.time'),
          JsonPath.jsonToString(JsonPath.objectAt('$.fetchSchedules.loadScheduleRanges.completed')),
          JsonPath.stringAt('$.updateSummary.Body'),
        ),
      ))
      .next(new Succeed(this, 'OrchestrationSuccess'));

    return new StateMachine(this, 'FlightSchedules', {
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
