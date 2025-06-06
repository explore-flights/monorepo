import { Construct } from 'constructs';
import {
  Cluster,
  ContainerDefinition,
  ContainerImage,
  ContainerInsights,
  CpuArchitecture,
  FargateTaskDefinition,
  ICluster,
  LogDriver,
  OperatingSystemFamily,
  TaskDefinition
} from 'aws-cdk-lib/aws-ecs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { IVpc } from 'aws-cdk-lib/aws-ec2';

export interface UpdateDatabaseConstructProps {
  vpc: IVpc;
  dataBucket: IBucket;
  parquetBucket: IBucket;
}

export class UpdateDatabaseConstruct extends Construct {
  readonly cluster: ICluster;
  readonly task: TaskDefinition;
  readonly taskContainer: ContainerDefinition;

  constructor(scope: Construct, id: string, props: UpdateDatabaseConstructProps) {
    super(scope, id);

    this.cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
      containerInsightsV2: ContainerInsights.DISABLED,
    });

    const ecsLogGroup = new LogGroup(this, 'EcsLogGroup', {
      logGroupName: `ecs/${this.cluster.clusterName}`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const taskExecutionRole = new Role(this, 'TaskExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    const taskRole = new Role(this, 'TaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    props.dataBucket.grantRead(taskRole, 'raw/LH_Public_Data/flightschedules_history/*');
    props.dataBucket.grantReadWrite(taskRole, 'processed/flights.db');
    props.dataBucket.grantReadWrite(taskRole, 'processed/basedata.db');
    props.dataBucket.grantWrite(taskRole, 'tmp/cron_database_update_summary.json');
    props.parquetBucket.grantReadWrite(taskRole);

    this.task = new FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 4096,
      memoryLimitMiB: 1024 * 18,
      taskRole: taskRole,
      executionRole: taskExecutionRole,
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.ARM64
      },
      ephemeralStorageGiB: 30,
    });

    this.taskContainer = this.task.addContainer('DatabaseContainer', {
      image: ContainerImage.fromDockerImageAsset(new DockerImageAsset(this, 'DatabaseImage', {
        directory: '../go',
        file: 'database/Dockerfile',
        platform: Platform.LINUX_ARM64,
      })),
      essential: true,
      logging: LogDriver.awsLogs({
        logGroup: ecsLogGroup,
        streamPrefix: 'database',
      }),
    });
  }
}