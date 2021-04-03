FUNCTION_JS=lambda.js
FUNCTION_FILE=lambda.zip
FUNCTION_NAME=ProcessSQSRecord

cd ../src/
pwd

# Create Zip
zip $FUNCTION_FILE $FUNCTION_JS

# Update Code
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://$FUNCTION_FILE \

# Remove Zip
rm -f lambda.zip

# Test Locally
cd -
sh test.sh