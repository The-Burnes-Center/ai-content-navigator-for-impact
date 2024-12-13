import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

// Import Lambda L2 construct
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from "aws-cdk-lib/aws-s3";
import { aws_bedrock as bedrock } from 'aws-cdk-lib';

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';


interface LambdaFunctionStackProps {  
  readonly wsApiEndpoint : string;    
  readonly KBIndex : bedrock.CfnKnowledgeBase;
  readonly KBSource : bedrock.CfnDataSource;  
  readonly knowledgeBucket : s3.Bucket;
}

export class LambdaFunctionStack extends cdk.Stack {  
  public readonly chatFunction : lambda.Function;  

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);    

      // Define the Lambda function resource
      const websocketAPIFunction = new lambda.Function(scope, 'ChatHandlerFunction', {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-chat')), // Points to the lambda directory
        handler: 'index.handler', // Points to the 'hello' file in the lambda directory
        environment : {
          "WEBSOCKET_ENDPOINT" : props.wsApiEndpoint.replace("wss","https"),
          "INDEX_ID" : props.KBIndex.attrKnowledgeBaseId
        },
        timeout: cdk.Duration.seconds(300)
      });
      websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:InvokeModel'
        ],
        resources: ["*"]
      }));
      websocketAPIFunction.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:Retrieve'
        ],
        resources: [props.KBIndex.attrKnowledgeBaseArn]
      })); 
      
      const scraperFunction = new lambda.Function(scope, 'ScraperFunction', {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(path.join(__dirname, 'crawler'), {
          bundling: {
            command: [
              "bash",
              "-c",
              "npm install -g pnpm && pnpm install && pnpm run build && cp -rT /asset-input/dist/ /asset-output/",
            ],
            image: lambda.Runtime.NODEJS_20_X.bundlingImage,
            user: "root",
          },
        }), // Points to the lambda directory
        handler: 'index.handler', // Points to the 'hello' file in the lambda directory
        environment : {
          "BUCKET" : props.knowledgeBucket.bucketName
        },
        timeout: cdk.Duration.seconds(900)
      });

      scraperFunction.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:*'
        ],
        resources: [props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn+"/*" ]
      }));

      this.chatFunction = websocketAPIFunction;    

    // Create an EventBridge rule to trigger ScraperFunction
    const scraperRule = new events.Rule(this, 'ScraperScheduleRule', {
      schedule: events.Schedule.expression('rate(14 days)'), // Called every two weeks
    });
    
    scraperRule.addTarget(new targets.LambdaFunction(scraperFunction));

      const syncFunction = new lambda.Function(scope, 'SyncFunction', {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(path.join(__dirname, 'sync-handler')), // Points to the sync handler directory
        handler: 'index.handler', // Entry point of the function
        environment: {
          "BUCKET" : props.knowledgeBucket.bucketName,
          "INDEX_ID": props.KBIndex.attrKnowledgeBaseId,
          "DATA_SOURCE_ID": props.KBSource.attrDataSourceId,
        },
        timeout: cdk.Duration.seconds(900),
      });

      syncFunction.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject', 's3:ListBucket'],
          resources: [props.knowledgeBucket.bucketArn, props.knowledgeBucket.bucketArn+"/*"],
        })
      );

      syncFunction.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['bedrock:SyncKnowledgeBase'],
          resources: [props.KBIndex.attrKnowledgeBaseArn],
        })
      );

      const scraperSyncRule = new events.Rule(this, 'ScraperSyncRule', {
        eventPattern: {
          source: ['aws.lambda'],
          detail: {
            functionName: [scraperFunction.functionName],
            status: ['SUCCEEDED'],
          },
        },
      });

      scraperSyncRule.addTarget(new targets.LambdaFunction(syncFunction));


  }
}
