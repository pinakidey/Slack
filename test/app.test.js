require('../src/index.js');
const { server, validateRequest } = require('../src/app.js');
const assert = require('assert');
const dayjs = require('dayjs');
const request = require('supertest');

exports.mochaHooks = {
    beforeAll() {
        process.env.ENV_TEST = true;
        if (!process.env.SLACK_APP_VERIFICATION_TOKEN) {
            console.log("Environment variable SLACK_APP_VERIFICATION_TOKEN not set.")
            return this.skip();
        }
    }
};

describe('Unit Test: app.js', function () {
    describe('GET /', function () {
        it('returns app status', function () {
            return request(server)
                .get('/')
                .expect(200)
                //.expect('Content-Type', /json/)
                .expect('Slack Bot Application is Running!')
        })
    })
    describe('POST /slack/events/', function () {
        let body = {
            token: process.env.SLACK_APP_VERIFICATION_TOKEN,
            challenge: 'challenge-text',
            type: 'url_verification'
        }
        it('should return token verification response', function () {
            return request(server)
                .post('/slack/events/')
                .send(body)
                .expect(200)
                .expect('challenge-text')
        });
        it('should fail token verification', function () {
            body.token = 'fake_token';
            return request(server)
                .post('/slack/events/')
                .send(body)
                .expect(401)
        })
    })
    describe('POST /slack/commands/', function () {
        let body = {
            command: '/review',
            channel_id: 'C01STHWH789',
            user_id: 'U0H9KJEQP',
        }
        it('should return valid response', function () {
            return request(server)
                .post('/slack/commands/')
                .send(body)
                .expect(200)
                .expect('{"response_type":"ephemeral","text":"Processing request..."}')
        });
        it('should return error response', function () {
            body.command = '/foo'
            return request(server)
                .post('/slack/commands/')
                .send(body)
                .expect(400)
                .expect('{"response_type":"ephemeral","text":"Command not found. Try /review"}')
        });
    })
    describe('POST /slack/actions/', function () {
        let body = {
            actions: [{
                action_id: 'load_more_action'
            }]
        }
        it('should return valid response', function () {
            return request(server)
                .post('/slack/actions/')
                .send({ payload: JSON.stringify(body) })
                .expect(200)
                .expect(((res) => {
                    if (!('Fetching more reviews...' === res.body.text))
                        throw new Error("Invalid response")
                }))
        });
        it('should return error response', function () {
            body.actions[0].action_id = 'invalid_action';
            return request(server)
                .post('/slack/actions/')
                .send({ payload: JSON.stringify(body) })
                .expect(400)
                .expect(((res) => {
                    if (!('Invalid action' === res.body.text))
                        throw new Error("Invalid response")
                }))
        });
    })
    // It's impossible to return true, since Slack uses a different headers['x-slack-signature'] each time
    describe('#validateRequest()', function () {
        let req = {};
        req.body = {
            token: process.env.SLACK_APP_VERIFICATION_TOKEN,
            challenge: 'challenge-text',
            type: 'url_verification'
        }
        let headers = {};
        headers['x-slack-request-timestamp'] = dayjs().unix().toString();
        headers['x-slack-signature'] = 'v0=4a5759b3c65b5ffb76ffebaa2870ce7410fc6d15c7c8a070e3f283e9a96ff249';
        req.headers = headers;

        it('should return true', function () {
            assert.strictEqual(validateRequest(req), true);
        });
    });
});