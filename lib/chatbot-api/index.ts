import { aws_bedrock as bedrock } from 'aws-cdk-lib';
import * as cdk from "aws-cdk-lib";

import { WebsocketBackendAPI } from "./gateway/websocket-api"
import { LambdaFunctionStack } from "./functions/functions"
import { S3BucketStack } from "./buckets/buckets"
import { OpenSearchStack } from "./opensearch/opensearch";
import { KnowledgeBaseStack } from "./knowledge-base/knowledge-base"

import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from "constructs";

export class ChatBotApi extends Construct {  
  public readonly wsAPI: WebsocketBackendAPI;  

  constructor(scope: Construct, id: string) {
    super(scope, id);
    
    const buckets = new S3BucketStack(this, "BucketStack");
    
    const openSearch = new OpenSearchStack(this,"OpenSearchStack",{})
    const knowledgeBase = new KnowledgeBaseStack(this,"KnowledgeBaseStack",{ openSearch : openSearch,
      s3bucket : buckets.knowledgeBucket})
    
    const websocketBackend = new WebsocketBackendAPI(this, "WebsocketBackend", {})
    this.wsAPI = websocketBackend;

    const lambdaFunctions = new LambdaFunctionStack(this, "LambdaFunctions",
      {
        wsApiEndpoint: websocketBackend.wsAPIStage.url,        
        KBIndex: knowledgeBase.knowledgeBase,
        KBSource: knowledgeBase.dataSource,      
        knowledgeBucket: buckets.knowledgeBucket
      })

    websocketBackend.wsAPI.addRoute('getChatbotResponse', {
      integration: new WebSocketLambdaIntegration('chatbotResponseIntegration', lambdaFunctions.chatFunction),      
    });
    websocketBackend.wsAPI.addRoute('$connect', {
      integration: new WebSocketLambdaIntegration('chatbotConnectionIntegration', lambdaFunctions.chatFunction),      
    });
    websocketBackend.wsAPI.addRoute('$default', {
      integration: new WebSocketLambdaIntegration('chatbotConnectionIntegration', lambdaFunctions.chatFunction),      
    });
    websocketBackend.wsAPI.addRoute('$disconnect', {
      integration: new WebSocketLambdaIntegration('chatbotDisconnectionIntegration', lambdaFunctions.chatFunction),      
    });
    
    // Prints out the AppSync GraphQL API key to the terminal
    new cdk.CfnOutput(this, "WS-API - apiEndpoint", {
      value: websocketBackend.wsAPI.apiEndpoint || "",
    });    
    
  }
}
