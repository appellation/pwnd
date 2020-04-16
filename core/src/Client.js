const os = require('os');
const { EventEmitter } = require('events');
const msgpack = require('msgpack5')();
const Peer = require('simple-peer');
const uuid = require('uuid');
const fetch = require('node-fetch');

const Secret = require('./Secret');

const WebSocketOpCodes = {
  CONNECTION_REQUEST: 0,
  MESSAGE: 1,
};

const RTCOpCodes = {
  SYNC_REQUEST: 0,
  SYNC_RESPONSE: 1,
  SYNC_TRUTH: 2,
  UPDATE: 3,
  PING: 4,
  PONG: 5,
};

module.exports = (WebSocket, wrtc) => class Client extends EventEmitter {
  constructor({
    name = os.hostname(),
    group,
    key,
    db,
    singalingServer,
  } = {}) {
    super();

    this.id = uuid.v1();
    this.name = name;
    this.group = group;
    this.key = key;
    this.db = db;
    this.singalingServer = singalingServer;

    this.ready = false;
    this._connectionActive = false;
    this._connectionReady = false;

    this._syncResponses = [];

    // Peers we initiated the connection to, THEY ARE SLAVES TO US
    this._slavePeers = {};

    // Peers that initiated a connection with us, WE ARE SLAVES TO THEM
    this._masterPeers = {};

    this.once('alone', () => {
      this.ready = true;
      this.emit('ready');
    });

    this._ws = new WebSocket(`ws://${singalingServer}/${this.group}`);

    this._ws.on('open', () => {
      this._connect();
    });

    this._ws.on('message', (data) => {
      const msg = JSON.parse(data);

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
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = setTimeout(this._disconnect.bind(this), 300000);

          let peer = this._slavePeers[msg.id];
          if (!peer) {
            clearTimeout(this._readyTimeout);

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
                  op: RTCOpCodes.SYNC_REQUEST,
                }));
              }
            });

            peer.on('close', () => {
              delete this._slavePeers[msg.id];
            });

            peer.on('error', (err) => {
              this.emit(err);
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
    });
  }

  _close() {
    this._ws.close(1000);

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
        this.once('ready', async () => {
          this._close();
          resolve();
        });
      }

      if (this._lock) {
        this.once('unlocked', async () => {
          this._close();
          resolve();
        });
      }

      this._close();
      resolve();
    });
  }

  get(id) {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    return this.db.get(id);
  }

  async set(secret) {
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
          op: RTCOpCodes.UPDATE,
          d: {
            id: secret.id,
            data: secret.toJSON(),
          },
        }));
      }

      clearTimeout(this._connectionTimeout);
      this._connectionTimeout = setTimeout(this._disconnect.bind(this), 300000);

      return this.db.set(secret);
    }

    await this.db.set(secret);

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

  async delete(id) {
    if (!this.ready) {
      throw new Error('Cannot access database before client is ready');
    }

    if (this._lock) {
      throw new Error('Database is locked for syncing');
    }

    if (this._connectionActive && this._connectionReady) {
      for (const peer of Object.values(this._slavePeers)) {
        peer.send(msgpack.encode({
          op: RTCOpCodes.UPDATE,
          d: {
            id,
            data: null,
          },
        }));
      }

      clearTimeout(this._connectionTimeout);
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

    const res = await fetch(`http://${this.singalingServer}/${this.group}`, { method: 'POST' });
    const clients = (await res.text()).split(',');

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
          op: RTCOpCodes.PING,
        }));
      }
    }, 60000);
  }

  _disconnect() {
    console.log(`[Client: ${this.name} ${this.id}] _disconnect() called`);

    clearInterval(this._pingInterval);

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

    const secrets = {};
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

      secrets[id] = secret;
    }

    const truthPacket = msgpack.encode({
      op: RTCOpCodes.SYNC_TRUTH,
      d: {
        deleted,
        secrets,
      },
    });

    const promises = [];
    for (const secretData of Object.values(secrets)) {
      const secret = Secret.fromJSON(secretData);

      promises.push(this.db.set(secret));
    }

    for (const id of deleted) {
      promises.push(this.db.delete(id));
    }

    await Promise.all(promises);

    for (const peer of Object.values(this._slavePeers)) {
      peer.send(truthPacket);
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

  async _handlePeerData(peer, data) {
    const msg = msgpack.decode(data);

    if (msg.op === RTCOpCodes.SYNC_REQUEST) {
      this.emit('locked');
      this._lock = true;

      const secrets = {};
      const secretIds = await this.db.getKeys();
      for (const id of secretIds) {
        const secret = await this.db.get(id); // eslint-disable-line no-await-in-loop
        secrets[id] = secret.toJSON();
      }

      peer.send(msgpack.encode({
        op: RTCOpCodes.SYNC_RESPONSE,
        d: {
          secrets,
          deleted: await this.db.getDeleted(),
        },
      }));
    } else if (msg.op === RTCOpCodes.SYNC_RESPONSE) {
      this._syncResponses.push(msg.d);
    } else if (msg.op === RTCOpCodes.SYNC_TRUTH) {
      const promises = [];
      for (const secretData of Object.values(msg.d.secrets)) {
        const secret = Secret.fromJSON(secretData);

        promises.push(this.db.set(secret));
      }

      for (const id of msg.d.deleted) {
        promises.push(this.db.delete(id));
      }

      await Promise.all(promises);

      this._lock = false;

      this.emit('unlocked');
      this.emit('update');
      this.emit('sync');
    } else if (msg.op === RTCOpCodes.UPDATE) {
      if (msg.d.data === null) {
        await this.db.delete(msg.d.id);
        this.emit('update');
        return;
      }

      const secret = Secret.fromJSON(msg.d.data);

      await this.db.set(secret);

      this.emit('update', secret);
    } else if (msg.op === RTCOpCodes.PING) {
      peer.send(msgpack.encode({
        op: RTCOpCodes.PONG,
      }));
    }
  }
};
