const { EventEmitter } = require('events');
const WebSocket = require('ws');
const msgpack = require('msgpack5')();
const Peer = require('simple-peer');
const wrtc = require('wrtc');
const uuid = require('uuid');

const WebsiteLogin = require('./WebsiteLogin');
const CreditCard = require('./CreditCard');

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

module.exports = class Client extends EventEmitter {
  constructor({
    group,
    key,
    db,
    singallingServer,
  } = {}) {
    super();

    this.id = uuid.v1();
    this.group = group;
    this.key = key;
    this.db = db;

    this.ready = false;
    this._connectionActive = false;
    this._connectionReady = false;

    this._syncResponses = [];

    // Peers we initiated the connection to, THEY ARE SLAVES TO US
    this._slavePeers = {};

    // Peers that initiated a connection with us, WE ARE SLAVES TO THEM
    this._masterPeers = {};

    this._ws = new WebSocket(`${singallingServer}/${this.group}`);

    this._ws.on('open', () => {
      // this._ws.send(JSON.stringify({
      //   op: WebSocketOpCodes.CONNECTION_REQUEST,
      //   group: this.group,
      //   id: this.id,
      // }));
      this._connect();
    });

    this._ws.on('message', (data) => {
      // console.log('CLIENT', this.id, JSON.parse(data));
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
          console.log(`SLAVE PEER TO ${msg.id} CONNECTED`);
        });

        this._masterPeers[msg.id].on('close', () => {
          delete this._masterPeers[msg.id];
        });

        this._masterPeers[msg.id].on('error', (err) => {
          console.log('_masterPeers ERROR', this.id);
        });

        this._masterPeers[msg.id].on('data', (d) => this._handlePeerData(this._masterPeers[msg.id], d));
      } else if (msg.op === WebSocketOpCodes.MESSAGE) {
        if (msg.destination !== this.id) {
          console.log('DESTINATION MISMATCH');
          return;
        }

        // console.log(msg);

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
              console.log(`MASTER PEER TO ${msg.id} CONNECTED`);

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
              console.log('_slavePeers ERROR', this.id);
            });

            peer.on('data', (d) => this._handlePeerData(peer, d));
          }

          peer.signal(msg.d);
        } else {
          let peer = this._masterPeers[msg.id];
          if (!peer) {
            console.log('MISSING PEER');
            return;
          }

          peer.signal(msg.d);

          if (!this._slavePeers[msg.id] && this._connectionActive && msg.d.type === 'answer') {
            console.log(msg.id, Object.keys(this._slavePeers), Object.keys(this._masterPeers));

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

    this._readyTimeout = setTimeout(() => {
      this.ready = true;
      this.emit('ready');
    }, 500);
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

  async set(id, secret) {
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
            type: secret.type,
            data: secret.toJSON(),
          },
        }));
      }

      clearTimeout(this._connectionTimeout);
      this._connectionTimeout = setTimeout(this._disconnect.bind(this), 300000);

      return this.db.set(id, secret);
    }

    await this.db.set(id, secret);

    return new Promise((resolve, reject) => {
      this._connect();

      const timeout = setTimeout(() => {
        reject('Sync timed out');
      }, 5000);

      this.once('sync', () => {
        clearTimeout(timeout);
        resolve();
      });
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
            type: null,
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
      this._connect();

      const timeout = setTimeout(() => {
        reject('Sync timed out');
      }, 5000);

      this.once('sync', () => {
        clearTimeout(timeout);
        resolve();
      });
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

  _connect() {
    if (this._connectionActive || this._connectionReady) {
      throw new Error('Connection already exists');
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
        }))
      }
    }, 60000);
  }

  _disconnect() {
    console.log(this.id, 'DISCONNECT');

    clearInterval(this._pingInterval);

    this._connectionReady = false;
    this._connectionActive = false;

    for (const peer of Object.values(this._slavePeers)) {
      peer.destroy();
    }

    console.log(Object.keys(this._masterPeers), Object.keys(this._slavePeers));
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

        if (response.secrets[id].data.lastUpdated > lastUpdate) {
          secret = response.secrets[id];
          lastUpdate = secret.data.lastUpdated;
        }
      }

      const local = await this.db.get(id); // eslint-disable-line no-await-in-loop
      if (local && local.lastUpdated > lastUpdate) {
        secret = {
          type: local.type,
          data: local.toJSON(),
        };
        lastUpdate = local.lastUpdated;
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
    for (const [id, secretData] of Object.entries(secrets)) {
      let secret = null;
      if (secretData.type === 'WebsiteLogin') {
        secret = new WebsiteLogin(secretData.data);
      } else if (secretData.type === 'CreditCard') {
        secret = new CreditCard(secretData.data);
      } else {
        throw new Error(`Unknown type ${secretData.type}`);
      }

      promises.push(this.db.set(id, secret));
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

    console.log(msg.op);

    if (msg.op === RTCOpCodes.SYNC_REQUEST) {
      this.emit('locked');
      this._lock = true;

      const secrets = {};
      const secretIds = await this.db.getKeys();
      for (const id of secretIds) {
        const secret = await this.db.get(id); // eslint-disable-line no-await-in-loop
        secrets[id] = {
          type: secret.type,
          data: secret.toJSON(),
        };
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
      for (const [id, secretData] of Object.entries(msg.d.secrets)) {
        let secret = null;
        if (secretData.type === 'WebsiteLogin') {
          secret = new WebsiteLogin(secretData.data);
        } else if (secretData.type === 'CreditCard') {
          secret = new CreditCard(secretData.data);
        } else {
          throw new Error(`Unknown type ${secretData.type}`);
        }

        promises.push(this.db.set(id, secret));
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
      let secret = null;
      if (msg.d.type === null) {
        await this.db.delete(msg.d.id);
        this.emit('update');
        return;
      }

      if (msg.d.type === 'WebsiteLogin') {
        secret = new WebsiteLogin(msg.d.data);
      } else if (msg.d.type === 'CreditCard') {
        secret = new CreditCard(msg.d.data);
      } else {
        throw new Error(`Unknown type ${msg.d.type}`);
      }

      await this.db.set(msg.d.id, secret);

      this.emit('update', secret);
    } else if (msg.op === RTCOpCodes.PING) {
      peer.send(msgpack.encode({
        op: RTCOpCodes.PONG,
      }));
    }
  }
};
