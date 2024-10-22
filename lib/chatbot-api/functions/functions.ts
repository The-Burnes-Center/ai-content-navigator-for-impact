import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

// Import Lambda L2 construct
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kendra from 'aws-cdk-lib/aws-kendra';
import * as s3 from "aws-cdk-lib/aws-s3";

interface LambdaFunctionStackProps {  
  readonly wsApiEndpoint : string;    
  readonly kendraIndex : kendra.CfnIndex;
  readonly kendraSource : kendra.CfnDataSource;  
  readonly knowledgeBucket : s3.Bucket;
}

export class LambdaFunctionStack extends cdk.Stack {  
  public readonly chatFunction : lambda.Function;  

  constructor(scope: Construct, id: string, props: LambdaFunctionStackProps) {
    super(scope, id);    

      // Define the Lambda function resource
      const websocketAPIFunction = new lambda.Function(this, 'ChatHandlerFunction', {
        runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
        code: lambda.Code.fromAsset(path.join(__dirname, 'websocket-chat')), // Points to the lambda directory
        handler: 'index.handler', // Points to the 'hello' file in the lambda directory
        environment : {
          "WEBSOCKET_ENDPOINT" : props.wsApiEndpoint.replace("wss","https"),
          "INDEX_ID" : props.kendraIndex.attrId
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
          'kendra:Retrieve'
        ],
        resources: [props.kendraIndex.attrArn]
      })); 
      
      const scraperFunction = new lambda.Function(this, 'ScraperFunction', {
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
        timeout: cdk.Duration.seconds(300)
      });
      
      this.chatFunction = websocketAPIFunction;    

  }
}
