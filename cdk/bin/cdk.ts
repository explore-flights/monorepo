#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Route53Stack } from '../lib/stacks/route53-stack';

const app = new cdk.App();

new Route53Stack(app, 'Route53-Prod', {
  zoneName: 'explore.flights',
});
