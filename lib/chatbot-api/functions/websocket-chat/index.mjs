import { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { BedrockAgentRuntimeClient, RetrieveCommand as KBRetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import ClaudeModel from "./models/claude3Sonnet.mjs";

const ENDPOINT = process.env.WEBSOCKET_ENDPOINT;
const wsConnectionClient = new ApiGatewayManagementApiClient({ endpoint: ENDPOINT });

async function processBedrockStream(id, modelStream, model, links) {

  try {
    let model_response = ''
    for await (const event of modelStream) {
      const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
      const parsedChunk = await model.parseChunk(chunk);
      if (parsedChunk) {
        let responseParams = {
          ConnectionId: id,
          Data: parsedChunk.toString()
        }
        model_response = model_response.concat(parsedChunk)
        // model_response = model_response.concat(links)
        let command = new PostToConnectionCommand(responseParams);
        // new command and send with metadata of sources - cit
        try {
          await wsConnectionClient.send(command);
        } catch {

        }
      }
    }
    // send end of stream message
    let eofParams = {
      ConnectionId: id,
      Data: "!<|EOF_STREAM|>!"
    }
    let command = new PostToConnectionCommand(eofParams);
    await wsConnectionClient.send(command);

    // send sources
    let responseParams = {
      ConnectionId: id,
      Data: JSON.stringify(links)
    }
    command = new PostToConnectionCommand(responseParams);
    await wsConnectionClient.send(command);

  } catch (error) {
    console.error("Stream processing error:", error);
  }
}

async function retrieveKBDocs(query, knowledgeBase, knowledgeBaseID) {
  const input = { // RetrieveRequest
    knowledgeBaseId: knowledgeBaseID, // required
    retrievalQuery: { // KnowledgeBaseQuery
      text: query, // required
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        "numberOfResults": 100,
      }
    },
  }


  try {
    const command = new KBRetrieveCommand(input);
    const response = await knowledgeBase.send(command);

    // filter the items based on confidence, we do not want LOW confidence results
    const confidenceFilteredResults = response.retrievalResults.filter(item =>
      item.score > 0.1
    )
    // console.log(confidenceFilteredResults)
    let fullContent = confidenceFilteredResults.map(item => item.content.text + item.location.s3Location.uri).join('\n');
    const documentUris = confidenceFilteredResults.map(item => {
      return { title: item.location.s3Location.uri.slice((item.location.s3Location.uri).lastIndexOf("/") + 1) + " (Bedrock Knowledge Base)", uri: item.location.s3Location.uri }
    });

    // removes duplicate sources based on URI
    const flags = new Set();
    const uniqueUris = documentUris.filter(entry => {
      if (flags.has(entry.uri)) {
        return false;
      }
      flags.add(entry.uri);
      return true;
    });

    // console.log(fullContent);

    //Returning both full content and list of document URIs
    if (fullContent == '') {
      fullContent = `No knowledge available! This query is likely outside the scope of your knowledge.
      Please provide a general answer but do not attempt to provide specific details.`
      console.log("Warning: no relevant sources found")
    }

    return {
      content: fullContent,
      uris: uniqueUris
    };
  } catch (error) {
    console.error("Caught error: could not retreive Knowledge Base documents:", error);
    // return no context
    return {
      content: `No knowledge available! There is something wrong with the search tool. Please tell the user to submit feedback.
      Please provide a general answer but do not attempt to provide specific details.`,
      uris: []
    };
  }
}

function injectKBDocsInPrompt(prompt, docs) {
  // Assuming buildPrompt concatenates query and docs into a single string
  console.log(docs);
  return `Context: ${docs}, Instructions: ${prompt}. You must cite exact links provided in the context. Don't include link if not found.`;
}

const getUserResponse = async (id, requestJSON) => {
  try {
    const data = requestJSON.data;
    const systemPrompt = data.systemPrompt;
    const userMessage = data.userMessage;
    const knowledgeBase = new BedrockAgentRuntimeClient({ region: 'us-east-1' });

    const docString = await retrieveKBDocs(userMessage, knowledgeBase, process.env.INDEX_ID);
    const enhancedSystemPrompt = injectKBDocsInPrompt(systemPrompt, docString.content);
    let claude = new ClaudeModel();
    const stream = await claude.getStreamedResponse(enhancedSystemPrompt,[], userMessage);

    await processBedrockStream(id, stream, claude, docString.uris);

    const input = {
      ConnectionId: id,
    };
    await wsConnectionClient.send(new DeleteConnectionCommand(input));

  } catch (error) {
    console.error("Error:", error);
  }
}

export const handler = async (event) => {
  if (event.requestContext) {
    const connectionId = event.requestContext.connectionId;
    const routeKey = event.requestContext.routeKey;
    let body = {};
    try {
      if (event.body) {
        body = JSON.parse(event.body);
      }
    } catch (err) {
      // Handle Error
    }

    switch (routeKey) {
      case '$connect':
        console.log('CONNECT')
        return { statusCode: 200 };
      case '$disconnect':
        console.log('DISCONNECT')
        return { statusCode: 200 };
      case '$default':
        console.log('DEFAULT')
        return { 'action': 'Default Response Triggered' }
      case "getChatbotResponse":
        console.log('GET CHATBOT RESPONSE')
        await getUserResponse(connectionId, body)
        return { statusCode: 200 };
      default:
        console.log('????')
      // Do Nothing?
    }
  }
  return {
    statusCode: 200,
  };
};