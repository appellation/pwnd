module.exports = async () => {
  const core = await import('../pkg');

  return {
    Client: require('./Client')(WebSocket, undefined),
    DB: require('./DB'),
    Field: require('./Field'),
    Secret: require('./Secret'),
    Section: require('./Section'),
    randomString: core.random_string,
  };
}
