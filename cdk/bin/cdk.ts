#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Route53Stack } from '../lib/stacks/route53-stack';
import { WebsiteStack } from '../lib/stacks/website-stack';

const app = new cdk.App();

const websiteStack = new WebsiteStack(app, 'Website-Prod', {
  domain: 'explore.flights',
});

new Route53Stack(app, 'Route53-Prod', {
  zoneName: 'explore.flights',
  websiteDistribution: websiteStack.distribution,
});
