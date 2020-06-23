import Client from './client/Client';
import DB from './models/DB';
import Field from './models/Field';
import Secret from './models/Secret';
import Section from './models/Section';

export { DB };

export default async () => {
  const wasm = await import('../pkg-browser');

  return {
    Client: Client(WebSocket, undefined),
    Field,
    Secret,
    Section,
    wasm,
  };
};
