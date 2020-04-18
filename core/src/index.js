/* eslint-disable global-require */

module.exports = () => {
  const core = require('../pkg'); // eslint-disable-line import/no-unresolved

  return {
    Client: require('./Client')(require('ws'), require('wrtc'), core, require('./KeyPair')(core)),
    DB: require('./DB'),
    Field: require('./Field'),
    KeyPair: require('./KeyPair')(core),
    PublicKey: require('./PublicKey')(core),
    Secret: require('./Secret'),
    Section: require('./Section'),
    randomString: core.randomString,
  };
};
