FUNCTION_NAME=ProcessSQSRecord


# Test Locally
aws lambda invoke --function-name $FUNCTION_NAME \
    --invocation-type RequestResponse \
    --payload file://../test/input.txt \
    --log-type Tail \
    --cli-binary-format raw-in-base64-out \
    ../test/outputfile.txt > ../test/log.json

jq -r '.LogResult' < ../test/log.json | base64 --decode
