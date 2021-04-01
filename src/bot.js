"use strict"

const Slack = require("slack");
const CONSTANTS = require("./constants.js");

module.exports.run = async (data) => {
    const dataObject = JSON.parse(data.body);
    let response = {
        statusCode: 200,
        body: {},
        headers: {'X-Slack-No-Retry': 1}
    };
    try {
        if(!('X-Slack-Retry-Num' in data.headers)) {
            switch (dataObject.type) {
                case "url_verification":
                    response.body = verifyCall(dataObject);
                    break;
                case "event_callback":
                    if(!dataObject.event.thread_ts && dataObject.event.text !== "Message received.") {
                        const params = {
                            token: CONSTANTS.app_oauth_token,
                            channel: dataObject.event.channel,
                            text: "Message received.",
                            thread_ts: dataObject.event.ts
                        }
                        Slack.chat.postMessage(params);
                    }
                    response.body = {ok: true}
                    break;
                default:
                    break;
            }
        }
    } catch (error) {
        console.log(error);
    } finally {
        return response;
    }
}

function verifyCall(data) {
    if(data.token === CONSTANTS.app_verification_token) {
        return data.challenge;
    } else {
        throw "Verification Failed.";
    }
}