// feedback.mjs
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({ region: "us-east-1" });

export async function handleFeedback(event) {
    try {
        const { type, topic, message } = JSON.parse(event.body);

        if (!type || !topic || !message) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" }),
            };
        }

        const params = {
            TableName: process.env.FEEDBACK_TABLE, // Use env variable
            Item: {
                type: { S: type },
                topic: { S: topic },
                message: { S: message },
                timestamp: { S: new Date().toISOString() },
            },
        };

        await dynamoClient.send(new PutItemCommand(params));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Feedback stored successfully!" }),
        };
    } catch (error) {
        console.error("Error storing feedback:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to store feedback." }),
        };
    }
}
