
import express, { urlencoded, json } from 'express';
import { SQS_REGION, SQS_QUEUE_URL, COMMAND_REVIEW, ASANA_WORKSPACE_ID, ASANA_PROJECT_ID } from "./constants";
import { WebClient, LogLevel } from '@slack/web-api';
import { isEmpty, uniqBy, get } from 'lodash';
import crypto from 'crypto';
import qs from 'qs'; // Support RFC1738 space encoding
import dayjs from 'dayjs';
import asana from 'asana'; // Asana is a Task management tool, much like JIRA.
import * as AWS from 'aws-sdk'; //aws-sdk v3 has a bug: https://github.com/aws/aws-sdk-js-v3/issues/1893, using v2


// Read environment variables
const token = process.env.SLACK_BOT_TOKEN;
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const asanaAccessToken = process.env.ASANA_PAT;
const port = process.env.PORT || 3000;

// Initialize WebAPI Client
const client = new WebClient(token, { logLevel: LogLevel.DEBUG });

// Initialize Asana Client
const asanaClient = asana.Client.create({ "defaultHeaders": { "asana-enable": "string_ids,new_user_task_lists" } }).useAccessToken(asanaAccessToken);
asanaClient.users.me().then(() => console.log("Connected to Asana."));

// Set AWS region
AWS.config.update({ region: SQS_REGION });

// Create an Amazon SQS client service object
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

// Create an express application
const app = express();

// Plug in middlewares
app.use(urlencoded({ extended: true }));
app.use(json());

// Use a middleware as interceptor for client verification
app.all('/slack/*', function (req, res, next) {
    // Validate request
    if (validateRequest(req)) {
        console.log("Request: Valid");
        next();
    } else {
        console.log("Request: Invalid");
        return res.status(200).send('Verification failed'); // Slack expects a 200 response withing 3 sec.
    }
});


// Default route for showing app status
app.get('/', function (req, res) {
    res.send('Slack Bot Application is Running!');
})

// Route for Event Subsription. It's only used for initial verification.
app.post('/slack/events/', (request, response) => {
    const payload = request.body;
    if (payload.type === 'url_verification') {
        if (payload.token === process.env.SLACK_APP_VERIFICATION_TOKEN) {
            response.send(payload.challenge);
        } else {
            response.status(401).send();
        }
    } else {
        response.send();
    }
})

// Route for handing Slash commands
app.post('/slack/commands/', (request, response) => {
    const payload = request.body;
    const channel = payload.channel_id;
    const user = payload.user_id;
    //console.log(payload);
    if (payload && payload.command) {
        if (payload.command === COMMAND_REVIEW) {
            response.json({
                "response_type": "ephemeral",
                "text": "Processing request..."
            });
            fetchMessages(channel, user);
        } else {
            response.status(400).json({
                "response_type": "ephemeral",
                "text": `Command not found. Try ${COMMAND_REVIEW}`
            });
        }
    }
})

// Route for handing Interactive requests
app.post('/slack/actions/', (request, response) => {
    const payload = JSON.parse(get(request, "body.payload", "")) || {};
    const action_id = get(payload, "actions[0].action_id");
    const value = get(payload, "actions[0].value");
    const channel = get(payload, "channel.id");
    const channel_name = get(payload, "channel.name");
    const username = get(payload, "user.name");
    const user = get(payload, "user.id");

    if (action_id === 'create_task_action') {
        let payload = {
            "name": `New Task from #${channel_name}/${username}`,
            "notes": value,
            "workspace": ASANA_WORKSPACE_ID,
            "projects": ASANA_PROJECT_ID
        }
        createAsanaTask(payload, channel, user);
        response.send();
    } else if (action_id === 'load_more_action') {
        response.json({
            "response_type": "ephemeral",
            "text": "Fetching more reviews..."
        });
        fetchMessages(channel, user);
    } else {
        response.status(400).json({
            "response_type": "ephemeral",
            "text": "Invalid action"
        });
    }
})

// Start Express Server
const server = app.listen(port, () => console.log(`Slack Bot API is running on port ${port}`));



/**
 * Fetches messages (Negative Reviews) from Amazon SQS, processes the messages and then deletes the retrieved messages from SQS.
 * @param {String} channel
 * @param {String} user
 */
const fetchMessages = async (channel, user) => {
    if (process.env.ENV_TEST) return;
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
    try {
        sqs.receiveMessage(params, function (err, data) {
            if (err) {
                console.log("Receive Error", err);
                sendEphemeralMessage(channel, "An error occurred while fetching messages from SQS.", user);
            } else if (!isEmpty(data.Messages)) {
                messages = data.Messages;

                // Parse messages
                const parsedMessages = uniqBy(messages.map(m => JSON.parse(m.Body)), 'body.id')
                    .filter(item => item.body && item.sentiment && item.sentiment.Sentiment === 'NEGATIVE');
                console.log(parsedMessages);

                // Process each message and send to Slack
                if (parsedMessages.length > 0) {
                    processMessages(parsedMessages, channel, user);
                } else {
                    sendEphemeralMessage(channel, "There are no new negative reviews.", user);
                }

                // Delete fetched messages from SQS queue
                messages.forEach(m => {
                    var deleteParams = {
                        QueueUrl: SQS_QUEUE_URL,
                        ReceiptHandle: m.ReceiptHandle
                    };
                    sqs.deleteMessage(deleteParams, function (err, data) {
                        if (err) {
                            console.log("Delete Error", err);
                            sendEphemeralMessage(channel, "An error occurred while deleting messages from SQS.", user);
                        } else {
                            console.log("Message Deleted: ", data);
                        }
                    });
                });
            } else {
                console.log("No message found.");
                sendEphemeralMessage(channel, "There are no new reviews.", user);
            }
        });
    } catch (error) {
        console.log(error)
        sendEphemeralMessage(channel, typeof error === 'object' ? JSON.stringify(error) : error, user);
    }
};

/**
 * Creates Block message using `message` and sends to `channel` as an ephemeral message.
 * @param {Object} messages
 * @param {String} channel
 * @param {String} user
 */
const processMessages = (messages, channel, user) => {
    let blocks = [];
    blocks.push({
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": ":mag: Latest Negative Reviews"
        }
    });
    blocks.push({
        "type": "divider"
    });

    messages.forEach(item => {
        let link = `https://twitter.com/${item.body.username}/status/${item.body.id}`;
        let text = `${item.body.text}\n*<${link}|Link>*`;
        blocks.push({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": text
            },
            "accessory": {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "Create Task",
                },
                "value": `${item.body.text}\n${link}`,
                "action_id": "create_task_action"
            }
        });
    });

    blocks.push({
        "type": "divider"
    });

    blocks.push({
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "style": "primary",
                "text": {
                    "type": "plain_text",
                    "text": "Load more"
                },
                "value": "load_more",
                "action_id": "load_more_action"
            }
        ]
    });

    sendEphemeralMessage(channel, "Found new reviews", user, blocks);
}

/**
 * Sends an ephemeral message in Slack `channel`, only visible to the `user`. `user` must be a member of the `channel`.
 * @param {String} channel
 * @param {String} text
 * @param {String} user
 * @param {Array} blocks
 */
const sendEphemeralMessage = (channel, text, user, blocks = []) => {
    return client.chat.postEphemeral({
        channel,
        user,
        text,
        blocks
    });
}

/**
 * A wrapper function to create a new task on Asana and send a block message back to `channel`
 * @param {Object} payload
 * @param {String} channel
 * @param {String} user
 */
const createAsanaTask = async (payload, channel, user) => {
    asanaClient.tasks.createTask(payload)
        .then((result) => {
            if (!isEmpty(result)) {
                let blocks = [];
                blocks.push({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `Task Created:\n*<${result.permalink_url}|${result.name}>*`
                    }
                });
                blocks.push({
                    "type": "section",
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": `*Workspace:*\n${get(result, "workspace.name")}`
                        },
                        {
                            "type": "mrkdwn",
                            "text": `*Project:*\n${get(result, "memberships[0].project.name")}`
                        },
                        {
                            "type": "mrkdwn",
                            "text": `*Section:*\n${get(result, "memberships[0].section.name")}`
                        },
                        {
                            "type": "mrkdwn",
                            "text": `*When:*\nSubmitted ${dayjs(result.created_at)}`
                        }
                    ]
                });
                blocks.push({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `*Description:*\n${result.notes}`
                    }
                });
                sendEphemeralMessage(channel, `A new Task is Created.`, user, blocks);
            }
        })
        .catch(error => {
            console.log(typeof error === 'object' ? JSON.stringify(error) : error);
            sendEphemeralMessage(channel, `Failed to create task on Asana.`, user);
        });
}

/**
 * Validates `request` with Signing Secret
 * @param {Request} request
 */
const validateRequest = (request) => {
    if (process.env.ENV_TEST) return true;
    if (isEmpty(request.body)) return false;
    let body = request.body;

    try {
        let request_body = body.type === 'url_verification' ? JSON.stringify(body) : qs.stringify(request.body, { format: 'RFC1738' });
        let timestamp = request.headers['x-slack-request-timestamp'];
        let request_signature = request.headers['x-slack-signature'];
        let now = dayjs().unix().toString();
        if (Math.abs(now - timestamp) > 60 * 5) return false;
        let sig_basestring = 'v0:' + timestamp + ':' + request_body;
        let signature = 'v0=' + crypto.createHmac('sha256', signingSecret || "").update(sig_basestring, 'utf8').digest('hex');
        //console.log([request_body, request.headers, now, timestamp, signature, request_signature]);
        return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(request_signature, 'utf8'));
    } catch (error) {
        console.log(error);
        return false;
    }
}



module.exports = { server, validateRequest };