import { EventEmitter } from 'events';
import fetch from 'node-fetch';

import { RTCPacket, RTCSync, WebSocketOpCodes, RTCOpCode } from './Op';
import Secret, { RawSecret } from '../models/Secret';
import * as os from 'os';
import * as mp5 from 'msgpack5';
import * as Peer from 'simple-peer';
import * as uuid from 'uuid';
import DB from '../models/DB';

const msgpack = mp5();

export interface ClientOptions {
  name?: string;
  group: string;
  key: string;
  db: DB<string, Secret>;
  signalingServer: string;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export default (WebSocket: any, wrtc?: {}) => class Client extends EventEmitter {
  public id: string;
  public name: string;
  public group: string;
  public key: string;
  public db: DB<string, Secret>;
  public signalingServer: string;
  public ready = false;

  protected _connectionActive = false;
  protected _connectionReady = false;
  protected _syncResponses: RTCSync[] = [];
  protected _connectionTimeout?: NodeJS.Timeout;
  protected _readyTimeout?: NodeJS.Timeout;
  protected _pingInterval?: NodeJS.Timeout;
  protected _lock = false;

  // Peers we initiated the connection to, THEY ARE SLAVES TO US
  protected _slavePeers: Record<string, Peer.Instance> = {};

  // Peers that initiated a connection with us, WE ARE SLAVES TO THEM
  protected _masterPeers: Record<string, Peer.Instance> = {};
  protected _ws: WebSocket;

  constructor({
    name = os.hostname(),
    group,
    key,
    db,
    signalingServer,
  }: ClientOptions) {
    super();

    this.id = uuid.v1();
    this.name = name;
    this.group = group;
    this.key = key;
    this.db = db;
    this.signalingServer = signalingServer;

    this.once('alone', () => {
      this.ready = true;
      this.emit('ready');
    });

    this._ws = new WebSocket(`ws://${signalingServer}/${this.group}/${this.id}`);

    this._ws.onopen = () => {
      this._connect();
    };

    this._ws.onerror = (err) => {
      this.emit('error', err);
    };

    this._ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.destination && msg.destination !== this.id) return;

      if (msg.op === WebSocketOpCodes.CONNECTION_REQUEST) {
        this._masterPeers[msg.id] = new Peer({ initiator: true, wrtc });

        this._masterPeers[msg.id].on('signal', (signal) => {
          this._ws.send(JSON.stringify({
            op: WebSocketOpCodes.MESSAGE,
            id: this.id,
            group: this.group,
            destination: msg.id,
            d: signal,
            type: 1,
          }));
        });

        this._masterPeers[msg.id].on('connect', () => {
          console.log(`[Client: ${this.name} ${this.id}] SLAVE PEER TO ${msg.id} CONNECTED`);
        });

        this._masterPeers[msg.id].on('close', () => {
          delete this._masterPeers[msg.id];
        });

        this._masterPeers[msg.id].on('error', (err) => {
          this.emit('error', err);
        });

        this._masterPeers[msg.id].on('data', (d) => this._handlePeerData(this._masterPeers[msg.id], d));
      } else if (msg.op === WebSocketOpCodes.MESSAGE) {
        if (msg.destination !== this.id) {
          return;
        }

        if (msg.type) {
          this._connectionActive = true;
          this._connectionTimeout?.refresh();

          let peer = this._slavePeers[msg.id];
          if (!peer) {
            clearTimeout(this._readyTimeout!);

            this._slavePeers[msg.id] = new Peer({ initiator: false, wrtc });
            peer = this._slavePeers[msg.id];

            peer.on('signal', (signal) => {
              this._ws.send(JSON.stringify({
                op: WebSocketOpCodes.MESSAGE,
                id: this.id,
                group: this.group,
                destination: msg.id,
                d: signal,
                type: 0,
              }));
            });

            peer.on('connect', () => {
              console.log(`[Client: ${this.name} ${this.id}] MASTER PEER TO ${msg.id} CONNECTED`);

              if (!this._connectionReady) {
                if (!this._lock) {
                  setTimeout(() => {
                    this._sync();
                  }, 1000);
                }

                this.emit('lock');
                this._lock = true;
                peer.send(msgpack.encode({
                  op: RTCOpCode.SYNC_REQUEST,
                }).slice());
              }
            });

            peer.on('close', () => {
              delete this._slavePeers[msg.id];
            });

            peer.on('error', (err) => {
              this.emit('error', err);
            });

            peer.on('data', (d) => this._handlePeerData(peer, d));
          }

          peer.signal(msg.d);
        } else {
          const peer = this._masterPeers[msg.id];
          if (!peer) {
            this.emit('error', `[Client: ${this.name} ${this.id}] Missing master peer ${msg.id}`);
            return;
          }

          peer.signal(msg.d);

          if (!this._slavePeers[msg.id] && this._connectionActive && msg.d.type === 'answer') {
            this._ws.send(JSON.stringify({
              op: WebSocketOpCodes.CONNECTION_REQUEST,
              id: this.id,
              group: this.group,
              destination: msg.id,
            }));
          }
        }
      }
    };
  }

  _close() {
    this._ws.close(1000);
    clearInterval(this._pingInterval!);
    clearTimeout(this._connectionTimeout!);

    for (const peer of Object.values(this._slavePeers)) {
      peer.destroy();
    }

    for (const peer of Object.values(this._masterPeers)) {
      peer.destroy();
    }
  }

  close() {
    return new Promise((resolve) => {
      if (!this.ready) {
        this.once('ready', () => {
          this._close();
          resolve();
        });
      } else if (this._lock) {
        this.once('unlocked', () => {
          this._close();
          resolve();
        });
      } else {
        this._close();
        resolve();
      }
    });
  }

  get(id: string) {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    return this.db.get(id);
  }

  async set(secret: Secret) {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    if (!secret.created[0]) secret.created = [Date.now(), this.name]; // eslint-disable-line no-param-reassign
    secret.updated = [Date.now(), this.name]; // eslint-disable-line no-param-reassign

    if (this._connectionActive && this._connectionReady) {
      for (const peer of Object.values(this._slavePeers)) {
        peer.send(msgpack.encode({
          op: RTCOpCode.UPDATE,
          d: {
            id: secret.id,
            data: secret.toJSON(),
          },
        }).slice());
      }

      clearTimeout(this._connectionTimeout!);
      this._connectionTimeout = setTimeout(this._disconnect.bind(this), 300000);

      return this.db.set(secret.id, secret);
    }

    await this.db.set(secret.id, secret);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sync timed out'));
      }, 5000);

      this.once('sync', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('alone', () => {
        clearTimeout(timeout);
        resolve();
      });

      this._connect();
    });
  }

  async delete(id: string) {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    if (this._connectionActive && this._connectionReady) {
      for (const peer of Object.values(this._slavePeers)) {
        peer.send(msgpack.encode({
          op: RTCOpCode.UPDATE,
          d: {
            id,
            data: null,
          },
        }).slice());
      }

      clearTimeout(this._connectionTimeout!);
      this._connectionTimeout = setTimeout(this._disconnect.bind(this), 300000);

      return this.db.delete(id);
    }

    await this.db.delete(id);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sync timed out'));
      }, 5000);

      this.once('sync', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('alone', () => {
        clearTimeout(timeout);
        resolve();
      });

      this._connect();
    });
  }

  getKeys() {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    return this.db.getKeys();
  }

  getDeleted() {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    return this.db.getDeleted();
  }

  async _connect() {
    if (this._connectionActive || this._connectionReady) {
      throw new Error('Connection already exists');
    }

    const res = await fetch(`http://${this.signalingServer}/${this.group}`);
    const clients = msgpack.decode(await res.buffer());

    if (clients.length === 1) {
      this.emit('alone');
      return;
    }

    this._connectionActive = false;
    this._connectionReady = false;

    this._ws.send(JSON.stringify({
      op: WebSocketOpCodes.CONNECTION_REQUEST,
      group: this.group,
      id: this.id,
    }));

    this._pingInterval = setInterval(() => {
      for (const peer of Object.values(this._slavePeers)) {
        peer.send(msgpack.encode({
          op: RTCOpCode.PING,
        }).slice());
      }
    }, 60000);
  }

  _disconnect() {
    console.log(`[Client: ${this.name} ${this.id}] _disconnect() called`);

    clearInterval(this._pingInterval!);

    this._connectionReady = false;
    this._connectionActive = false;

    for (const peer of Object.values(this._slavePeers)) {
      peer.destroy();
    }
  }

  async _sync() {
    let deletedArr = await this.db.getDeleted();
    let secretIdArr = await this.db.getKeys();

    for (const response of this._syncResponses) {
      deletedArr = deletedArr.concat(response.deleted);
      secretIdArr = secretIdArr.concat(Object.keys(response.secrets));
    }

    const deleted = Array.from(new Set(deletedArr));
    const secretIds = Array.from(new Set(secretIdArr));

    let i = secretIds.length;
    while (i--) {
      if (deleted.includes(secretIds[i])) {
        secretIds.splice(i, 1);
      }
    }

    const secrets: Record<string, RawSecret> = {};
    for (const id of secretIds) {
      let lastUpdate = 0;
      let secret = null;

      for (const response of this._syncResponses) {
        if (!response.secrets[id]) continue;

        if (response.secrets[id].updated[0] > lastUpdate) {
          secret = response.secrets[id];
          [lastUpdate] = secret.updated;
        }
      }

      const local = await this.db.get(id); // eslint-disable-line no-await-in-loop
      if (local && local.updated[0] > lastUpdate) {
        secret = local.toJSON();
        [lastUpdate] = local.updated;
      }

      if (secret === null) continue;
      secrets[id] = secret;
    }

    const truthPacket = msgpack.encode({
      op: RTCOpCode.SYNC_TRUTH,
      d: {
        deleted,
        secrets,
      },
    });

    const promises = [];
    for (const secretData of Object.values(secrets)) {
      const secret = Secret.fromJSON(secretData);

      promises.push(this.db.set(secret.id, secret));
    }

    for (const id of deleted) {
      promises.push(this.db.delete(id));
    }

    await Promise.all(promises);

    for (const peer of Object.values(this._slavePeers)) {
      peer.send(truthPacket.slice());
    }

    this._syncResponses = [];

    this._lock = false;

    this._connectionReady = true;

    this.emit('unlocked');

    if (!this.ready) {
      this.ready = true;
      this.emit('ready');
    }

    this.emit('update');
    this.emit('sync');
  }

  async _handlePeerData(peer: Peer.Instance, data: Buffer) {
    const msg: RTCPacket = msgpack.decode(data);

    if (msg.op === RTCOpCode.SYNC_REQUEST) {
      this.emit('locked');
      this._lock = true;

      const secrets: Record<string, RawSecret> = {};
      const secretIds = await this.db.getKeys();
      for (const id of secretIds) {
        const secret = await this.db.get(id); // eslint-disable-line no-await-in-loop
        secrets[id] = secret.toJSON();
      }

      peer.send(msgpack.encode({
        op: RTCOpCode.SYNC_RESPONSE,
        d: {
          secrets,
          deleted: await this.db.getDeleted(),
        },
      }).slice());
    } else if (msg.op === RTCOpCode.SYNC_RESPONSE) {
      this._syncResponses.push(msg.d);
    } else if (msg.op === RTCOpCode.SYNC_TRUTH) {
      const promises = [];
      for (const secretData of Object.values(msg.d.secrets)) {
        const secret = Secret.fromJSON(secretData);

        promises.push(this.db.set(secret.id, secret));
      }

      for (const id of msg.d.deleted) {
        promises.push(this.db.delete(id));
      }

      await Promise.all(promises);

      this._lock = false;

      this.emit('unlocked');
      this.emit('update');
      this.emit('sync');
    } else if (msg.op === RTCOpCode.UPDATE) {
      if (msg.d.data === null) {
        await this.db.delete(msg.d.id);
        this.emit('update');
        return;
      }

      const secret = Secret.fromJSON(msg.d.data);

      await this.db.set(secret.id, secret);

      this.emit('update', secret);
    } else if (msg.op === RTCOpCode.PING) {
      peer.send(msgpack.encode({
        op: RTCOpCode.PONG,
      }).slice());
    }
  }
};
