const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamoClient = new DynamoDBClient({ region: "us-east-1" }); 

exports.handler = async (event) => {
    try {
        const { feedbackType, feedbackTopic, feedbackMessage} = JSON.parse(event.body);

        if (!feedbackType || !feedbackTopic || !feedbackMessage) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields" }),
            };
        }

        const params = {
            TableName: "UserFeedbackTableEEA",
            Item: {
                type: { S: feedbackType },
                topic: { S: feedbackTopic },
                message: { S: feedbackMessage },
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
};
