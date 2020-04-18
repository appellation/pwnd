const os = require('os');
const { EventEmitter } = require('events');
const msgpack = require('msgpack5')();
const Peer = require('simple-peer');
const uuid = require('uuid');
const fetch = require('node-fetch');

const Secret = require('./Secret');

const WebSocketOpCodes = {
  MASTER_SIGNAL: 0,
  SLAVE_SIGNAL: 1,
  JOIN_REQUEST: 2,
  JOIN: 3,
  JOIN_INITIATOR_SIGNAL: 4,
  JOIN_SIGNAL: 5,
  JOIN_SUCCESS: 6,
};

const RTCOpCodes = {
  SYNC_REQUEST: 0,
  SYNC_RESPONSE: 1,
  SYNC_TRUTH: 2,
  UPDATE: 3,
  PING: 4,
  PONG: 5,
  JOIN_RESPONSE: 6,
};

module.exports = (WebSocket, wrtc, { randomString }, KeyPair) => class Client extends EventEmitter {
  constructor({
    name = os.hostname(),
    group,
    keyPair,
    db,
    signalingServer,
  } = {}) {
    super();

    this.id = uuid.v1();
    this.name = name;
    this.group = group;
    this.keyPair = keyPair;
    this.db = db;
    this.signalingServer = signalingServer;

    this.ready = false;
    this._connectionActive = false;
    this._connectionReady = false;

    this._syncResponses = [];

    // Peers we initiated the connection to, THEY ARE SLAVES TO US
    this._slavePeers = new Map();

    // Peers that initiated a connection with us, WE ARE SLAVES TO THEM
    this._masterPeers = new Map();

    this._pins = new Map();
    this._joinPeer = null;
    this._joinPeers = new Map();

    this.once('alone', () => {
      this.ready = true;
      this.emit('ready');
    });

    this._ws = new WebSocket(`ws://${signalingServer}/${this.group}/${this.id}`);

    this._ws.onopen = async () => {
      if (this.keyPair) this._connect();
      else {
        const res = await fetch(`http://${this.signalingServer}/${this.group}`);
        const clients = msgpack.decode(await (await res.blob()).arrayBuffer());

        if (clients.length === 1) {
          this._close();
          this.emit('error', new Error('cannot join empty group'));
          return;
        }

        this._join();
      }
    };

    this._ws.onerror = (err) => {
      this.emit(err);
    };

    this._ws.onmessage = (e) => {
      const msg = msgpack.decode(e.data);

      if (msg.op === WebSocketOpCodes.MASTER_SIGNAL) {
        let peer = null;
        if (!this._masterPeers.has(msg.id)) {
          peer = new Peer({ initiator: false, wrtc });

          peer.on('signal', (signal) => {
            fetch(`http://${this.signalingServer}/${this.group}/${msg.id}`, {
              method: 'POST',
              body: msgpack.encode({
                op: WebSocketOpCodes.SLAVE_SIGNAL,
                id: this.id,
                d: this.keyPair.encrypt(Buffer.from(JSON.stringify(signal))),
              }),
            });
          });

          peer.on('connect', () => {
            console.log(`[Client: ${this.name} ${this.id}] Master peer ${msg.id} connected`);
          });

          peer.on('close', () => {
            this._masterPeers.delete(msg.id);
          });

          peer.on('error', (err) => {
            this.emit('error', err);
          });

          peer.on('data', (d) => this._handlePeerData(peer, d));

          this._masterPeers.set(msg.id, peer);
        } else {
          peer = this._masterPeers.get(msg.id);
        }

        const signal = JSON.parse(Buffer.from(this.keyPair.decrypt(msg.d)));
        peer.signal(signal);

        if (!this._slavePeers.has(msg.id) && this._connectionActive && signal.type === 'offer') {
          this._connectToSlave(msg.id);
        }
      } else if (msg.op === WebSocketOpCodes.SLAVE_SIGNAL) {
        if (!this._slavePeers.has(msg.id)) {
          console.log(`[Client: ${this.name} ${this.id}] Missing slave peer ${msg.id}`);
          return;
        }

        this._slavePeers.get(msg.id).signal(JSON.parse(Buffer.from(this.keyPair.decrypt(msg.d))));
      } else if (msg.op === WebSocketOpCodes.JOIN_REQUEST) {
        this.emit('join-request', msg.id, msg.d, () => {
          const pin = randomString(6, '1234567890');
          this._pins.set(msg.id, pin);
          return pin;
        });
      } else if (msg.op === WebSocketOpCodes.JOIN) {
        if (!this._pins.has(msg.id)) return;
        if (this._pins.get(msg.id) !== msg.d.pin) return;

        const peer = new Peer({ initiator: true, wrtc });

        peer.on('signal', (signal) => {
          fetch(`http://${this.signalingServer}/${this.group}/${msg.id}`, {
            method: 'POST',
            body: msgpack.encode({
              op: WebSocketOpCodes.JOIN_INITIATOR_SIGNAL,
              id: this.id,
              d: signal,
            }),
          });
        });

        peer.on('connect', () => {
          console.log(`[Client: ${this.name} ${this.id}] Join peer slave ${msg.id} connected`);
          peer.send(Buffer.from(JSON.stringify({
            op: RTCOpCodes.JOIN_RESPONSE,
            d: [...this.keyPair.private],
          })));
        });

        peer.on('close', () => {
          this._joinPeers.delete(msg.id);
        });

        peer.on('error', (err) => {
          this.emit('error', err);
        });

        this._joinPeers.set(msg.id, peer);
      } else if (msg.op === WebSocketOpCodes.JOIN_INITIATOR_SIGNAL) {
        if (!this._joinPeer) {
          this._joinPeer = new Peer({ initiator: false, wrtc });

          this._joinPeer.on('signal', (signal) => {
            fetch(`http://${this.signalingServer}/${this.group}/${msg.id}`, {
              method: 'POST',
              body: msgpack.encode({
                op: WebSocketOpCodes.JOIN_SIGNAL,
                id: this.id,
                d: signal,
              }),
            });
          });

          this._joinPeer.on('connect', () => {
            console.log(`[Client: ${this.name} ${this.id}] Join peer master ${msg.id} connected`);
          });

          this._joinPeer.on('close', () => {
            this._joinPeer = null;
          });

          this._joinPeer.on('error', (err) => {
            this.emit('error', err);
          });

          this._joinPeer.on('data', (data) => {
            this.keyPair = new KeyPair(JSON.parse(data).d);
            this.emit('key-pair', this.keyPair);

            this._ws.send(msgpack.encode({
              op: WebSocketOpCodes.JOIN_SUCCESS,
              id: this.id,
            }));

            this._connect();
            this._joinPeer.destroy();
          });
        }

        this._joinPeer.signal(msg.d);
      } else if (msg.op === WebSocketOpCodes.JOIN_SIGNAL) {
        if (!this._joinPeers.has(msg.id)) {
          console.log(`[Client: ${this.name} ${this.id}] Missing join peer ${msg.id}`);
          return;
        }

        this._joinPeers.get(msg.id).signal(msg.d);
      } else if (msg.op === WebSocketOpCodes.JOIN_SUCCESS) {
        this._pins.delete(msg.id);
        this.emit('join-success', msg.id);
      }
    };
  }

  join(pin) {
    this._joinKeyPair = KeyPair.generate();
    this._ws.send(msgpack.encode({
      op: WebSocketOpCodes.JOIN,
      id: this.id,
      d: {
        pin,
        publicKey: this._joinKeyPair.public.key,
      },
    }));
  }

  _close() {
    clearInterval(this._pingInterval);
    clearTimeout(this._connectionTimeout);

    this._ws.close(1000);

    for (const [, peer] of this._slavePeers) {
      peer.destroy();
    }

    for (const [, peer] of this._masterPeers) {
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
      } else if (this._lock) {
        this.once('unlocked', async () => {
          this._close();
          resolve();
        });
      } else {
        this._close();
        resolve();
      }
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
      for (const [, peer] of this._slavePeers) {
        peer.send(this.keyPair.encrypt(Buffer.from(JSON.stringify({
          op: RTCOpCodes.UPDATE,
          d: {
            id: secret.id,
            data: secret.toJSON(),
          },
        }))));
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
      for (const [, peer] of this._slavePeers) {
        peer.send(this.keyPair.encrypt(Buffer.from(JSON.stringify({
          op: RTCOpCodes.UPDATE,
          d: {
            id,
            data: null,
          },
        }))));
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

  _connectToSlave(id) {
    const peer = new Peer({ initiator: true, wrtc });

    peer.on('signal', (signal) => {
      fetch(`http://${this.signalingServer}/${this.group}/${id}`, {
        method: 'POST',
        body: msgpack.encode({
          op: WebSocketOpCodes.MASTER_SIGNAL,
          id: this.id,
          d: this.keyPair.encrypt(Buffer.from(JSON.stringify(signal))),
        }),
      });
    });

    peer.on('connect', () => {
      console.log(`[Client: ${this.name} ${this.id}] Slave peer ${id} connected`);

      if (!this._connectionReady) {
        if (!this._lock) {
          setTimeout(() => {
            this._sync();
          }, 1000);
        }

        this.emit('lock');
        this._lock = true;
        peer.send(this.keyPair.encrypt(Buffer.from(JSON.stringify({
          op: RTCOpCodes.SYNC_REQUEST,
        }))));
      }
    });

    peer.on('close', () => {
      this._slavePeers.delete(id);
    });

    peer.on('error', (err) => {
      this.emit(err);
    });

    peer.on('data', (d) => this._handlePeerData(peer, d));

    this._slavePeers.set(id, peer);
  }

  _join() {
    this.emit('join');
    this._ws.send(msgpack.encode({
      op: WebSocketOpCodes.JOIN_REQUEST,
      id: this.id,
      d: this.name,
    }));
  }

  async _connect() {
    if (this._connectionActive || this._connectionReady) {
      throw new Error('Connection already exists');
    }

    const res = await fetch(`http://${this.signalingServer}/${this.group}`);
    const clients = msgpack.decode(await (await res.blob()).arrayBuffer());

    if (clients.length === 1) {
      this.emit('alone');
      return;
    }

    this._connectionActive = true;
    this._connectionReady = false;

    clearTimeout(this._connectionTimeout);
    this._connectionTimeout = setTimeout(this._disconnect.bind(this), 300000);

    for (const id of clients) {
      if (id === this.id) continue;
      if (this._slavePeers.has(id)) continue;

      this._connectToSlave(id);
    }

    this._pingInterval = setInterval(() => {
      for (const [, peer] of this._slavePeers) {
        peer.send(this.keyPair.encrypt(Buffer.from(JSON.stringify({
          op: RTCOpCodes.PING,
        }))));
      }
    }, 60000);
  }

  _disconnect() {
    console.log(`[Client: ${this.name} ${this.id}] _disconnect() called`);

    clearInterval(this._pingInterval);
    clearTimeout(this._connectionTimeout);

    this._connectionReady = false;
    this._connectionActive = false;

    for (const [, peer] of this._slavePeers) {
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

    const truthPacket = this.keyPair.encrypt(Buffer.from(JSON.stringify({
      op: RTCOpCodes.SYNC_TRUTH,
      d: {
        deleted,
        secrets,
      },
    })));

    const promises = [];
    for (const secretData of Object.values(secrets)) {
      const secret = Secret.fromJSON(secretData);

      promises.push(this.db.set(secret));
    }

    for (const id of deleted) {
      promises.push(this.db.delete(id));
    }

    await Promise.all(promises);

    for (const [, peer] of this._slavePeers) {
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
    let msg = null;
    try {
      msg = JSON.parse(Buffer.from(this.keyPair.decrypt(data)).toString());
    } catch (err) {
      return;
    }


    if (msg.op === RTCOpCodes.SYNC_REQUEST) {
      this.emit('locked');
      this._lock = true;

      const secrets = {};
      const secretIds = await this.db.getKeys();
      for (const id of secretIds) {
        const secret = await this.db.get(id); // eslint-disable-line no-await-in-loop
        secrets[id] = secret.toJSON();
      }

      peer.send(this.keyPair.encrypt(Buffer.from(JSON.stringify({
        op: RTCOpCodes.SYNC_RESPONSE,
        d: {
          secrets,
          deleted: await this.db.getDeleted(),
        },
      }))));
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
      peer.send(this.keyPair.encrypt(Buffer.from(JSON.stringify({
        op: RTCOpCodes.PONG,
      }))));
    }
  }
};
