module.exports.handler = async (input) => {
  const startTime = Date.now()
  return { startTime, ...input }
}
