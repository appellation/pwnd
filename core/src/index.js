/* eslint-disable global-require */

module.exports = () => ({
  Client: require('./Client')(require('ws'), require('wrtc')),
  DB: require('./DB'),
  Field: require('./Field'),
  Secret: require('./Secret'),
  Section: require('./Section'),
  randomString: require('../pkg').random_string, // eslint-disable-line import/no-unresolved
});
