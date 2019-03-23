const uuid = require('uuid/v4')
const AWS = require('aws-sdk')
const Lambda = new AWS.Lambda()

module.exports.handler = async (input, context) => {
  const { functionName, count } = input
  let done = 0
  for (let i = 0; i < count; i++) {
    await updateEnvVar(functionName)
    await invoke(functionName)
    done++

    if (context.getRemainingTimeInMillis() < 10000) {
      return { ...input, count: count - done }
    }
  }

  return { ...input, count: count - done }
}

const updateEnvVar = async (functionName) => {
  console.log(`touching environment variable: ${functionName}`)
  const req = {
    FunctionName: functionName,
    Environment: {
      Variables: {
        'uuid': uuid()
      }
    }
  }
  await Lambda.updateFunctionConfiguration(req).promise()
}

const invoke = async (functionName) => {
  console.log(`invoking: ${functionName}`)
  const req = {
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: '{}'
  }
  await Lambda.invoke(req).promise()
}
