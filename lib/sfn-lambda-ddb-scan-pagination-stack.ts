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

interface myProps extends cdk.StackProps {
  ddbTableName: string;
  ddbTableArn: string;
}

export class SfnLambdaDdbScanPaginationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: myProps) {
    super(scope, id, props);
    const nodeJsFunctionProps: NodejsFunctionProps = {
      depsLockFilePath: join(__dirname, 'ts-lambdas', 'package-lock.json'),
      runtime: Runtime.NODEJS_18_X,
    };

    const scanLambda = new NodejsFunction(this, 'ScanLambda', {
      entry: join(__dirname, 'ts-lambdas', 'scan.ts'),
      environment: {
        DDB_TABLE_NAME: props.ddbTableName,
      },
      ...nodeJsFunctionProps,
    });

    const ddbTable = Table.fromTableArn(
      this,
      props.ddbTableName,
      props.ddbTableArn
    );
    ddbTable.grantReadWriteData(scanLambda);

    const scanJob = new tasks.LambdaInvoke(this, 'DDB ScanJob', {
      lambdaFunction: scanLambda,
      outputPath: '$.Payload',
    });

    const jobFailed = new sfn.Fail(this, 'Job Failed', {
      cause: 'DDB Scan Job Failed',
      error: 'DescribeJob returned FAILED',
    });

    const success = new sfn.Succeed(this, 'Done!');

    const definition = scanJob.next(
      new sfn.Choice(this, 'DDB ScanJob Complete?')
        .when(sfn.Condition.isNotNull('$.LastEvaluatedKey'), scanJob)
        .when(sfn.Condition.isNull('$.LastEvaluatedKey'), success)
        .otherwise(jobFailed)
    );

    const logGroup = new logs.LogGroup(this, 'DdbScanStateMachineLogGroup');

    // Create state machine
    const stateMachine = new sfn.StateMachine(this, 'DdbScanStateMachine', {
      definition,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
      },
      // 5分でタイムアウト
      timeout: cdk.Duration.minutes(5),
    });

    // Grant lambda execution roles
    scanLambda.grantInvoke(stateMachine.role);

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
