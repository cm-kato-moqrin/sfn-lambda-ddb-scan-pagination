#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SfnLambdaDdbScanPaginationStack } from '../lib/sfn-lambda-ddb-scan-pagination-stack';

const app = new cdk.App();

const ddbTableName: string = app.node.tryGetContext('DDB_TABLE_NAME');
const ddbTableArn: string = app.node.tryGetContext('DDB_TABLE_ARN');

new SfnLambdaDdbScanPaginationStack(app, 'SfnLambdaDdbScanPaginationStack', {
  ddbTableName,
  ddbTableArn,
});
