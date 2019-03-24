
module.exports = {
  entry: {
    'functions/analyze': './functions/analyze.js',
    'functions/aws-sdk': './functions/aws-sdk.js',
    'functions/aws-xray-sdk-core': './functions/aws-xray-sdk-core.js',
    'functions/aws-xray-sdk-require-only': './functions/aws-xray-sdk-require-only.js',
    'functions/aws-xray-sdk': './functions/aws-xray-sdk.js',
    'functions/dynamodb-only': './functions/dynamodb-only.js',
    'functions/loop': './functions/loop.js',
    'functions/no-aws-sdk': './functions/no-aws-sdk.js',
    'functions/set-start-time': './functions/set-start-time.js',
    'functions/trace-dynamodb-only': './functions/trace-dynamodb-only.js'
  },
  mode: 'production',
  target: 'node'
}
