
import express, { urlencoded, json } from 'express';
import { BOT_CHANNEL, SQS_REGION, SQS_QUEUE_URL, COMMAND_REVIEW } from "./constants";
import { WebClient, LogLevel } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';
import * as AWS from 'aws-sdk'; //aws-sdk v3 has a bug: https://github.com/aws/aws-sdk-js-v3/issues/1893, using v2



// Read environment variables
const token = process.env.SLACK_BOT_TOKEN; //xoxb-***
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const port = process.env.PORT || 3000;

// Initialize WebAPI Client
const client = new WebClient(token, { logLevel: LogLevel.DEBUG });

// Initialize EventAdapter
const slackEvents = createEventAdapter(signingSecret);

// Set AWS region
AWS.config.update({ region: SQS_REGION });
// Create an Amazon SQS client service object
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });


// Create an express application
const app = express();
// Plug in middlewares
app.use('/slack/events', slackEvents.requestListener());
app.use(urlencoded({ extended: true }));
app.use(json());

app.get('/', function (req, res) {
    res.send('Slack Bot Application is Running!');
})

app.post('/slack/events/', (request, response) => {
    console.log(request);
})

app.post('/slack/actions/', (request, response) => {
    console.log(request);
})

/* Accepts and processes Slack Slash Commands */
app.post('/slack/commands/', (request, response) => {
    const payload = request.body;
    if (payload && payload.command) {
        if (payload.command === COMMAND_REVIEW) {
            response.json({
                "response_type": "in_channel",
                "text": "Processing request..."
            });
            fetchMessages();
        }
    }
})

// Start Express Server
app.listen(port, () => console.log(`Listening for events on port ${port}`));


// Listen to events
// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', (event) => {
    //console.log(`Received a message event: user <@${event.user}> in channel ${event.channel} says ${event.text}`);
    if (event.text === "Hi") {
        sendMessage(event.channel, `Hi there, <@${event.user}>`);
    }
});



/* (async () => {
    // Post a message to the channel, and await the result.
    const result = await sendMessage(BOT_CHANNEL, "Review Bot is Online...");

    // The result contains an identifier for the message, `ts`.
    console.log(`Successfully send message ${result.ts}`);
})(); */

/**
 * Async helper method to send a message to a Slack channel.
 * @param {String} channel
 * @param {String} message
 */
async function sendMessage(channel, message) {
    return client.chat.postMessage({
        channel: channel,
        text: message,
    });
}

/**
 * Helper method to send a generic error message to a Slack channel.
 */
function sendError() {
    sendMessage(BOT_CHANNEL, "There was an error processing the request.");
}

/* SQS Operations */

/**
 * Fetches messages (Negative Reviews) from Amazon SQS and then deletes the retrieved messages from SQS.
 */
const fetchMessages = async () => {
    // Set parameters
    const params = {
        AttributeNames: ["SentTimestamp"],
        MaxNumberOfMessages: 10,
        MessageAttributeNames: ["All"],
        QueueUrl: SQS_QUEUE_URL,
        VisibilityTimeout: 20,
        WaitTimeSeconds: 0
    };
    let messages = [];

    sqs.receiveMessage(params, function (err, data) {
        if (err) {
            console.log("Receive Error", err);
            sendError();
        } else if (data.Messages) {
            //console.log(data.Messages);
            messages = data.Messages || [];
            messages.forEach(m => {
                var deleteParams = {
                    QueueUrl: SQS_QUEUE_URL,
                    ReceiptHandle: m.ReceiptHandle
                };
                sqs.deleteMessage(deleteParams, function (err, data) {
                    if (err) {
                        console.log("Delete Error", err);
                        sendError();
                    } else {
                        console.log("Message Deleted: ", data);
                    }
                });
            });
            const parsedMessages = messages.map(m => JSON.parse(m.Body));
            console.log(parsedMessages);
            parsedMessages.forEach(item => sendMessage(BOT_CHANNEL, item.text));
        } else {
            console.log("No message found.");
            sendMessage(BOT_CHANNEL, "There are no new reviews.");
        }
    });
};