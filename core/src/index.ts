import WebSocket = require('ws');
import wrtc = require('wrtc');

import Client from './client/Client';
import DB from './models/DB';
import Field from './models/Field';
import Secret from './models/Secret';
import Section from './models/Section';

import wasm = require('../pkg');

export { DB };

export default () => ({
  Client: Client(WebSocket, wrtc),
  Field,
  Secret,
  Section,
  wasm,
});
