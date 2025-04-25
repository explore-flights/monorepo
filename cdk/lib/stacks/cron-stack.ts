import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { CronLambdaConstruct } from '../constructs/cron-lambda-construct';
import { SfnConstruct } from '../constructs/sfn-construct';
import { EventField, Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { UpdateDatabaseConstruct } from '../constructs/update-database-task';
import { IpProtocol, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';

export interface CronStackProps extends cdk.StackProps {
  cronLambdaZipPath: string;
  dataBucket: IBucket;
}

export class CronStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, 'VPC', {
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: SubnetType.PUBLIC,
        },
      ],
      natGateways: 0,
      createInternetGateway: true,
    });

    const cronLambda = new CronLambdaConstruct(this, 'CronLambda', {
      cronLambdaZipPath: props.cronLambdaZipPath,
      dataBucket: props.dataBucket,
    });

    const updateDatabaseTask = new UpdateDatabaseConstruct(this, 'UpdateDatabase', {
      vpc: vpc,
      dataBucket: props.dataBucket,
    });

    const sfn = new SfnConstruct(this, 'SFN', {
      dataBucket: props.dataBucket,
      cronLambda_1G: cronLambda.lambda_1G,
      cronLambda_4G: cronLambda.lambda_4G,
      updateDatabaseVpc: vpc,
      updateDatabaseSubnets: {
        subnets: vpc.publicSubnets,
      },
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