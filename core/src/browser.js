module.exports = async () => {
  const core = await import('../pkg-browser'); // eslint-disable-line import/no-unresolved

  return {
    Client: require('./Client')(WebSocket, undefined, core, require('./KeyPair')(core)),
    DB: require('./DB'),
    Field: require('./Field'),
    KeyPair: require('./KeyPair')(core),
    PublicKey: require('./PublicKey')(core),
    Secret: require('./Secret'),
    Section: require('./Section'),
    randomString: core.randomString,
  };
}
