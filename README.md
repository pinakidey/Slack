
# ReviewBot - A Slack App

## Overview
ReviewBot is a Slack App which does the following:

* Fetches, directly or indirectly, the negative reviews (tweets with mention) from a target Twitter handle. (For this project we are using @SlackHQ.)

* Provides a way to open each review in a browser to verify the context.

* Provides a way to create a task against any of the above reviews on an integrated Task management platform (For this project we are using Asana.)

## Assumptions
* The app is not meant/ready for distribution via app directory yet.
* The admin must set the environment variables / credentials beforehand.


## Environment Variables
```
export SLACK_SIGNING_SECRET=<Slack Signing Secret>
export SLACK_APP_VERIFICATION_TOKEN=<Slack App Verification Token>
export SLACK_BOT_TOKEN=<Bot User OAuth Token>
export AWS_ACCESS_KEY_ID=<AWS Access Key>
export AWS_SECRET_ACCESS_KEY=<AWS Secret Key>
export AWS_ACCOUNT_ID=<AWS Account Id>
export ASANA_PAT=<Asana PAT Token>
export NEW_RELIC_LICENSE_KEY=<New Relic License Key>
```

## Slack channel name
`#slack-demo` (`ReviewBot` must be added into this channel)

## Test & Run
```
npm test
npm start
```
## Usage
Inside `#slack-demo` channel, use `/review` command to fetch the reviews.