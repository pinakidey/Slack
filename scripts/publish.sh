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

# Create Zip
zip $FUNCTION_FILE $FUNCTION_JS

# Remove existing function with same name
aws lambda delete-function \
    --function-name $FUNCTION_NAME \

# Create new function
aws lambda create-function \
    --region $REGION \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://$FUNCTION_FILE \
    --role $EXEC_ROLE \
    --handler $MODULE_NAME.handler \
    --runtime nodejs12.x \
    --description $DESCRIPTION \
    --timeout 60 \
    --memory-size 128 \
    --debug

# Remove Zip
rm -f lambda.zip

# Test Locally
cd -
sh test.sh