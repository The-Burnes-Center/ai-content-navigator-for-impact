import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ChatBotApi } from "./chatbot-api";
import { UserInterface } from "./user-interface"

// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class GenAiMvpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const chatbotAPI = new ChatBotApi(this, "ChatbotAPI");
    const userInterface = new UserInterface(this, "UserInterface",
     {
      api : chatbotAPI
    })
    
  }
}
