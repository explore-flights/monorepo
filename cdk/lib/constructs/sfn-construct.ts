import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { DefinitionBody, IStateMachine, StateMachine, TaskInput, JsonPath } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';

export interface SfnConstructProps {
  dataBucket: IBucket;
  cronLambda: IFunction;
}

export class SfnConstruct extends Construct {
  readonly flightSchedules: IStateMachine;

  constructor(scope: Construct, id: string, props: SfnConstructProps) {
    super(scope, id);

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

    this.flightSchedules = new StateMachine(this, 'FlightSchedules', {
      definitionBody: DefinitionBody.fromChainable(definition),
      tracingEnabled: false,
    });
  }
}