import * as WebSocket from 'ws';
import * as wrtc from 'wrtc';

import Client from './client/Client';
import DB from './models/DB';
import Field from './models/Field';
import Secret from './models/Secret';
import Section from './models/Section';

import * as wasm from '../pkg';

export { DB };

export default () => ({
  Client: Client(WebSocket, wrtc),
  Field,
  Secret,
  Section,
  wasm,
});
