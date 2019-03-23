const AWSXRay = require('aws-xray-sdk-core')
const DynamoDB = require('aws-sdk/clients/dynamodb')
const dynamodb = new DynamoDB.DocumentClient()
AWSXRay.captureAWSClient(dynamodb.service)

module.exports.handler = async () => {
}
