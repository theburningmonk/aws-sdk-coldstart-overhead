const _ = require('lodash')
const AWS = require('aws-sdk')
const XRay = new AWS.XRay()

module.exports.handler = async ({ startTime, functionName }) => {
  const stats = await getFuncTraces(new Date(startTime), functionName)
  console.log(`get [${stats.length}] traces`)

  const details = await getTraceDetails(stats.map(stat => stat.id))
  console.log(`got [${details.length}] trace details`)

  const findDuration = (trace, name) => {
    return parseFloat(trace.durations.find(info => info.name === name).duration)
  }

  const datapoints = details
    .filter(trace => trace.durations.length > 0)
    .map(trace => ({
      lambdaDuration: findDuration(trace, 'AWS::Lambda'),
      functionDuration: findDuration(trace, 'AWS::Lambda::Function'),
      setup: findDuration(trace, 'Setup'),
      initialization: findDuration(trace, 'Initialization')
    }))

  const initTimes = datapoints.map(x => x.initialization)
  const average = _.sum(initTimes) / initTimes.length
  const min = _.min(initTimes)
  const max = _.max(initTimes)

  const sorted = _.sortBy(initTimes)
  const median = sorted[Math.ceil(initTimes.length / 2)]

  const ninetieth = sorted[Math.ceil(initTimes.length * 0.9)]

  return {
    functionName,
    datapoints: datapoints.length,
    average,
    min,
    max,
    median,
    ninetieth,
    rawData: sorted.join(',')
  }
}

const getFuncTraces = async (startTime, funcName) => {
  const getTraces = async (startTime, endTime, nextToken = null, acc = []) => {
    const xReq = {
      EndTime: endTime,
      StartTime: startTime,
      FilterExpression: `service("${funcName}")`,
      NextToken: nextToken
    }
    const xResp = await XRay.getTraceSummaries(xReq).promise()
    const traces = xResp
      .TraceSummaries
      .map(summary => ({
        id: summary.Id,
        duration: summary.Duration,
        responseTime: summary.ResponseTime
      }))

    if (xResp.NextToken) {
      return getTraces(startTime, endTime, xResp.NextToken, acc.concat(...traces))
    } else {
      return acc.concat(...traces)
    }
  }

  return getTraces(startTime, new Date())
}

// This method will return an array of traces with the following shape:
// {
//   functionName: 'aws-coldstart-ruby25vpc-dev-outside-1536',
//   traceId: '1-5c7954d9-560bf598fb3f88607c3751e0',
//   timestamp: '2019-03-06T15:38:27.308Z',
//   durations:
//     [
//       { name: 'AWS::Lambda', id: '2cd1290ee882c1b0', duration: '376.0' },
//       { name: 'AWS::Lambda::Function', id: '3f252a557b9d011f', duration: '2.5' },
//       { name: 'Overhead', id: '51b1a64aa8e9f0f3', duration: '0.7' },
//       { name: 'Initialization', id: '1b94ef3ef1233694', duration: '173.4' },
//       { name: 'Invocation', id: 'f7a89c8152f3451b', duration: '1.3' },
//       { name: 'Setup', id: null, duration: '200.1' }
//     ]
// ]
const getTraceDetails = async (traceIds, acc = []) => {
  if (traceIds.length === 0) {
    return acc
  }

  // batchGetTraces accepts a max of 5 IDs: so we need to call it in chunks
  const chunkIds = traceIds.slice(0, 5)
  const restIds = traceIds.slice(5)

  const xReq = {
    TraceIds: chunkIds
  }
  const xResp = await XRay.batchGetTraces(xReq).promise()

  const chunkDetails = xResp.Traces.map(getTraceDetail)

  return getTraceDetails(restIds, acc.concat(...chunkDetails))
}

const getTraceDetail = (trace) => {
  const traceId = trace.Id
  const lambdaSegment = trace
    .Segments
    .find(segment => JSON.parse(segment.Document).origin === 'AWS::Lambda')
  const lambdaSegmentDocument = JSON.parse(lambdaSegment.Document)

  const functionName = lambdaSegmentDocument.name
  const timestamp = new Date(lambdaSegmentDocument.start_time * 1000).toISOString()

  const lambdaFunctionSegment = trace
    .Segments
    .find(segment => JSON.parse(segment.Document).origin === 'AWS::Lambda::Function')

  if (!lambdaFunctionSegment) {
    console.error('Missing lambda function segment for', traceId)
    return {
      functionName,
      traceId,
      timestamp,
      durations: []
    }
  }

  const lambdaFunctionSegmentDocument = JSON.parse(lambdaFunctionSegment.Document)

  const lambdaSegmentTime = ((lambdaSegmentDocument.end_time - lambdaSegmentDocument.start_time) * 1000).toFixed(1)
  const lambdaFunctionSegmentTime = ((lambdaFunctionSegmentDocument.end_time - lambdaFunctionSegmentDocument.start_time) * 1000).toFixed(1)

  const segments = [
    {
      name: lambdaSegmentDocument.origin,
      id: lambdaSegment.Id,
      duration: lambdaSegmentTime
    },
    {
      name: lambdaFunctionSegmentDocument.origin,
      id: lambdaFunctionSegment.Id,
      duration: lambdaFunctionSegmentTime
    }
  ]

  // somehow a non-coldstart trace got in the mix
  if (!lambdaFunctionSegmentDocument.subsegments) {
    console.error('Missing Initialization subsegment for', traceId)
    return {
      functionName,
      traceId,
      timestamp,
      durations: []
    }
  }

  const subsegments = lambdaFunctionSegmentDocument.subsegments.map(subsegment => {
    return {
      name: subsegment.name,
      id: subsegment.id,
      duration: ((subsegment.end_time - subsegment.start_time) * 1000).toFixed(1)
    }
  })

  const initializationSubsegment = subsegments.find(subsegment => subsegment.name === 'Initialization')

  if (!initializationSubsegment) {
    console.error('Missing Initialization subsegment for', traceId)
    return {
      functionName,
      traceId,
      timestamp,
      durations: []
    }
  }

  const initializationTime = initializationSubsegment.duration

  const setup = {
    name: 'Setup',
    id: null,
    duration: (lambdaSegmentTime - lambdaFunctionSegmentTime - initializationTime).toFixed(1)
  }

  return {
    functionName,
    traceId,
    timestamp,
    durations: [...segments, ...subsegments, setup]
  }
}
