import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { CronLambdaConstruct } from '../constructs/cron-lambda-construct';
import { SfnConstruct } from '../constructs/sfn-construct';
import { EventField, Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { UpdateDatabaseConstruct } from '../constructs/update-database-task';

export interface CronStackProps extends cdk.StackProps {
  cronLambdaZipPath: string;
  dataBucket: IBucket;
}

export class CronStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);

    const cronLambda = new CronLambdaConstruct(this, 'CronLambda', {
      cronLambdaZipPath: props.cronLambdaZipPath,
      dataBucket: props.dataBucket,
    });

    const updateDatabaseTask = new UpdateDatabaseConstruct(this, 'UpdateDatabase', {
      dataBucket: props.dataBucket,
    });

    const sfn = new SfnConstruct(this, 'SFN', {
      dataBucket: props.dataBucket,
      cronLambda_1G: cronLambda.lambda_1G,
      cronLambda_4G: cronLambda.lambda_4G,
      updateDatabaseCluster: updateDatabaseTask.cluster,
      updateDatabaseTask: updateDatabaseTask.task,
      updateDatabaseTaskContainer: updateDatabaseTask.taskContainer,
      webhookUrl: cdk.SecretValue.cfnParameter(new cdk.CfnParameter(this, 'webhookUrl', {
        type: 'String',
        noEcho: true,
      })),
    });

    new Rule(this, 'FlightSchedulesDaily', {
      schedule: Schedule.cron({
        minute: '0',
        hour: '10',
        day: '*',
        month: '*',
        year: '*',
      }),
      targets: [
        new SfnStateMachine(sfn.flightSchedules, {
          input: RuleTargetInput.fromObject({
            time: EventField.time,
            schedule: 'daily',
          }),
        }),
      ],
    })
  }
}