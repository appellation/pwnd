import * as WebSocket from 'ws';
import * as wrtc from 'wrtc';

import c from './client/Client';
import DB from './models/DB';
import Field from './models/Field';
import Secret from './models/Secret';
import Section from './models/Section';

export const Client = c(WebSocket, wrtc);

export * from './client/Client';
export * from './models/DB';
export * from './models/Field';
export * from './models/Secret';
export * from './models/Section';

export {
  DB,
  Field,
  Secret,
  Section,
};
