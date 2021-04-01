FUNCTION_JS=lambda.js
FUNCTION_FILE=lambda.zip
MODULE_NAME=lambda
FUNCTION_NAME=ProcessSQSRecord
ROLE_NAME=slack
REGION=ap-northeast-1
DESCRIPTION=sqs-comprehend-sqs-pipeline

EXEC_ROLE="arn:aws:iam::$AWS_ACCOUNT_ID:role/$ROLE_NAME"

cd ../src/
pwd

zip $FUNCTION_FILE $FUNCTION_JS


aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://$FUNCTION_FILE \

# Test Locally
aws lambda invoke --function-name $FUNCTION_NAME \
    --payload file://../test/input.txt ../test/outputfile.txt \
    --cli-binary-format raw-in-base64-out

rm -f lambda.zip