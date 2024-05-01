#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Route53Stack } from '../lib/stacks/route53-stack';
import { WebsiteStack } from '../lib/stacks/website-stack';

const app = new cdk.App();

const r53 = new Route53Stack(app, 'Route53-Prod', {
  env: { region: 'eu-central-1' },
  zoneName: 'explore.flights',
});

new WebsiteStack(app, 'Website-Prod', {
  env: { region: 'eu-central-1' },
  crossRegionReferences: true,
  domain: 'explore.flights',
  hostedZone: r53.zone,
});
