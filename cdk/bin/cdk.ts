#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Route53Stack } from '../lib/stacks/route53-stack';
import { WebsiteStack } from '../lib/stacks/website-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { CronStack } from '../lib/stacks/cron-stack';

const app = new cdk.App();

const dataStack = new DataStack(app, 'Data-Prod', {});

const websiteStack = new WebsiteStack(app, 'Website-Prod', {
  domain: 'explore.flights',
  certificateId: 'a96a703e-5454-4fc5-98eb-43b2f881be37',
  apiLambdaZipPath: 'api_lambda_bundle.zip',
  uiResourcesZipPath: 'explore_flights_ui_artifact.zip',
  dataBucket: dataStack.dataBucket,
});

new CronStack(app, 'Cron-Prod', {
  cronLambdaZipPath: 'cron_lambda_bundle.zip',
  dataBucket: dataStack.dataBucket,
  parquetBucket: dataStack.parquetBucket,
});

new Route53Stack(app, 'Route53-Prod', {
  zoneName: 'explore.flights',
  websiteDistribution: websiteStack.distribution,
});
