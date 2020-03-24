const Sequelize = require('sequelize');

const uuid = require('uuid');

const Client = require('./Client');
const DB = require('./DB');
const WebsiteLogin = require('./WebsiteLogin');
const CreditCard = require('./CreditCard');

class SqliteDB extends DB {
  constructor(path) {
    super();

    this.sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: path,
      logging: false,
    });

    this.Secret = this.sequelize.define('secret', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      data: {
        type: Sequelize.JSON,
        allowNull: false,
      },
    }, {
      define: {
        timestamps: false,
      },
    });

    this.Deleted = this.sequelize.define('deleted', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
      },
    });
  }

  async init() {
    await this.sequelize.sync();
  }

  async get(id) {
    const secret = await this.Secret.findByPk(id);

    if (!secret) return null;

    const type = secret.get('type');

    if (type === 'WebsiteLogin') {
      return new WebsiteLogin(JSON.parse(secret.get('data')));
    }

    if (type === 'CreditCard') {
      return new CreditCard(JSON.parse(secret.get('data')));
    }

    throw new Error(`Unknown type ${type}`);
  }

  async set(id, secret) {
    await this.Secret.upsert({ id, type: secret.type, data: JSON.stringify(secret.toJSON()), });
  }

  async delete(id) {
    await this.Secret.destroy({ where: { id }});
    await this.Deleted.findOrCreate({ where: { id } });
    // await this.Deleted.create({ id });
  }

  async getKeys() {
    const secrets = await this.Secret.findAll({ attributes: ['id' ]});

    const arr = [];
    for (const secret of secrets) {
      arr.push(secret.get('id'));
    }

    return arr;
  }

  async getDeleted() {
    const secrets = await this.Deleted.findAll({ attributes: ['id' ]});

    const arr = [];
    for (const secret of secrets) {
      arr.push(secret.get('id'));
    }

    return arr;
  }
}

(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

  const group = uuid.v1();

  const db1 = new SqliteDB(`${__dirname}/test11.sqlite`);
  const db2 = new SqliteDB(`${__dirname}/test21.sqlite`);
  const db3 = new SqliteDB(`${__dirname}/test3.sqlite`);

  await db1.init();
  await db2.init();
  await db3.init();

  // const google = new WebsiteLogin({
  //   website: 'https://www.google.com',
  //   username: 'zach@hackzzila.com',
  //   password: 'somehash',
  //   lastUpdated: Date.now(),
  //   created: Date.now(),
  //   lastUpdatedBy: 'Zacharys-Macbook-Pro2',
  //   createdBy: 'Zacharys-Macbook-Pro',
  // });

  // const id = uuid.v1();
  // await db1.set(id, google);
  // await db1.delete(id);

  // console.log(await db2.getKeys());

  const cc = new CreditCard({
    number: '1234-5678-9012-3456',
    cvc: '123',
    cardholder: 'POGCHAMPIUS',
    lastUpdated: Date.now(),
    created: Date.now(),
    lastUpdatedBy: 'Zacharys-Macbook-Pro2',
    createdBy: 'Zacharys-Macbook-Pro',
  });

  // const id = uuid.v1();
  // await db2.set(id, cc);
  // await db2.delete(id);

  // await db3.set(uuid.v1(), cc);

  // console.log(await db2.getKeys());

  const client1 = new Client({ group, db: db1, singallingServer: 'ws://localhost:8000' });

  // await client1.get('foo');

  client1.on('ready', async () => {
    console.log('client1 ready');
    const client2 = new Client({ group, db: db2, singallingServer: 'ws://localhost:8000' });

    client2.on('ready', () => {
      console.log('client2 ready');

      const client3 = new Client({ group, db: db3, singallingServer: 'ws://localhost:8000' });
      client3.on('ready', () => {
        console.log('client3 ready');

        console.log(Object.keys(client2._slavePeers), Object.keys(client2._masterPeers));
        console.log(Object.keys(client3._slavePeers), Object.keys(client3._masterPeers));

        setTimeout(async () => {
          const cc = new CreditCard({
            number: '999-777-777-777',
            cvc: '123',
            cardholder: 'POGCHAMPIUS',
            lastUpdated: Date.now(),
            created: Date.now(),
            lastUpdatedBy: 'Zacharys-Macbook-Pro2',
            createdBy: 'Zacharys-Macbook-Pro',
          });

          const id = uuid.v1();

          client1.on('update', async () => {
            console.log(await client1.get(id));
          });

          await client3.set(id, cc);
        }, 10000);
      })
    })
  })


  // const google = new WebsiteLogin({
  //   website: 'https://www.google.com',
  //   username: 'zach@hackzzila.com',
  //   password: 'somehash',
  //   lastUpdated: '1/1/2',
  //   created: '1/1/1',
  //   lastUpdatedBy: 'Zacharys-Macbook-Pro2',
  //   createdBy: 'Zacharys-Macbook-Pro',
  // });

  // const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

  // setTimeout(async () => {
  //   await client1.set('e28e9179-446e-4bc7-a14a-90e5685ca29a', google);

  //   await sleep(100);

  //   console.log(await client2.get('e28e9179-446e-4bc7-a14a-90e5685ca29a'));

  //   await client2.delete('e28e9179-446e-4bc7-a14a-90e5685ca29a');

  //   console.log(await client2.getKeys());

  //   await sleep(100);

  //   console.log(await client1.getKeys());
  // }, 2000);
})();

// (async () => {
//   try {
//     await db1.init();

//     await db1.set('e28e9179-446e-4bc7-a14a-90e5685ca29a', google);

//     console.log(await db1.getKeys());
//     console.log(await db1.get('e28e9179-446e-4bc7-a14a-90e5685ca29a'));

//     console.log(await db1.delete('e28e9179-446e-4bc7-a14a-90e5685ca29a'));

//     console.log(await db1.getKeys());

//   } catch (err) {
//     console.log(err);
//   }
// })();

// const init = new Client();
// const recv = new Client();

// var Peer = require('simple-peer')
// const wrtc = require('wrtc');

// var peer1 = new Peer({ initiator: true, wrtc })
// var peer2 = new Peer({ wrtc,  });

// peer1.on('signal', data => {
//   // when peer1 has signaling data, give it to peer2 somehow
//   console.log(data);
//   peer2.signal(data)
// })

// peer2.on('signal', data => {
//   // when peer2 has signaling data, give it to peer1 somehow
//   console.log('signal2', data);
//   peer1.signal(data)
// })

// peer1.on('connect', () => {
//   // wait for 'connect' event before using the data channel
//   peer1.send('hey peer2, how is it going?')
// })

// peer2.on('data', data => {
//   // got a data channel message
//   console.log('got a message from peer1: ' + data)
// })