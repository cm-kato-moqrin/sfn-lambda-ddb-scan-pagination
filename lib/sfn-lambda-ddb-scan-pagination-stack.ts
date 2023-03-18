import * as cdk from 'aws-cdk-lib';
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
// import * as events from 'aws-cdk-lib/aws-events';
// import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';

interface myProps extends cdk.StackProps {
  ddbTableName: string;
  ddbTableArn: string;
  s3BucketName: string;
  s3BucketArn: string;
}

export class SfnLambdaDdbScanPaginationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: myProps) {
    super(scope, id, props);
    const nodeJsFunctionProps: NodejsFunctionProps = {
      depsLockFilePath: join(__dirname, 'ts-lambdas', 'package-lock.json'),
      runtime: Runtime.NODEJS_18_X,
    };

    const scanAndUploadLambda = new NodejsFunction(
      this,
      'ScanAndUploadLambda',
      {
        entry: join(__dirname, 'ts-lambdas', 'scan-and-upload-csv-to-s3.ts'),
        environment: {
          DDB_TABLE_NAME: props.ddbTableName,
          BUCKET_NAME: props.s3BucketName,
        },
        ...nodeJsFunctionProps,
      }
    );

    const ddbTable = Table.fromTableArn(
      this,
      props.ddbTableName,
      props.ddbTableArn
    );
    ddbTable.grantReadWriteData(scanAndUploadLambda);

    const bucket = Bucket.fromBucketArn(
      this,
      props.s3BucketName,
      props.s3BucketArn
    );
    bucket.grantReadWrite(scanAndUploadLambda);

    const scanAndUploadJob = new tasks.LambdaInvoke(
      this,
      'DDB ScanAndUploadJob',
      {
        lambdaFunction: scanAndUploadLambda,
        outputPath: '$.Payload',
      }
    );

    const jobFailed = new sfn.Fail(this, 'Job Failed', {
      cause: 'DDB Scan Job Failed',
      error: 'DescribeJob returned FAILED',
    });

    const success = new sfn.Succeed(this, 'Done!');

    const definition = scanAndUploadJob.next(
      new sfn.Choice(this, 'DDB ScanJob Complete?')
        .when(sfn.Condition.isNotNull('$.LastEvaluatedKey'), scanAndUploadJob)
        .when(sfn.Condition.isNull('$.LastEvaluatedKey'), success)
        .otherwise(jobFailed)
    );

    const logGroup = new logs.LogGroup(
      this,
      'DdbScanAndUploadCsvToS3StateMachineLogGroup'
    );

    // Create state machine
    const stateMachine = new sfn.StateMachine(
      this,
      'DdbScanAndUploadCsvToS3StateMachine',
      {
        definition,
        logs: {
          destination: logGroup,
          level: sfn.LogLevel.ALL,
        },
        // 5分でタイムアウト
        timeout: cdk.Duration.minutes(5),
      }
    );

    // Grant lambda execution roles
    scanAndUploadLambda.grantInvoke(stateMachine.role);

    /**
     *  Run every day at 6PM UTC
     * See https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
     */
    // const rule = new events.Rule(this, 'Rule', {
    //   schedule: events.Schedule.expression('cron(0 18 ? * MON-FRI *)'),
    // });
    // rule.addTarget(new targets.SfnStateMachine(stateMachine));
  }
}
