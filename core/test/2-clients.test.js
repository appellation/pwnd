const uuid = require('uuid');

const { Client, Secret } = require('..')();
const DB = require('./db');

test('client2 can store secret', (done) => {
  const group = uuid.v1();
  const db1 = new DB();
  const client1 = new Client({ group, db: db1, singalingServer: 'localhost:8000' });

  const secret = Secret.createEmpty('test');

  client1.once('ready', async () => {
    const db2 = new DB();
    const client2 = new Client({ group, db: db2, singalingServer: 'localhost:8000' });

    client2.once('ready', async () => {
      await client2.set(secret);
      await client2.close();
      await client1.close();
      done();
    })
  });
});

test('client2 can store & get secret after connected, client1 can get secret', (done) => {
  expect.assertions(4);

  const group = uuid.v1();
  const db1 = new DB();
  const client1 = new Client({ group, db: db1, singalingServer: 'localhost:8000' });
  let client2 = null;

  const secret = Secret.createEmpty('test');

  client1.once('ready', async () => {
    const db2 = new DB();
    client2 = new Client({ group, db: db2, singalingServer: 'localhost:8000' });

    client2.once('ready', async () => {
      await client2.set(secret);
      expect(await client2.getKeys()).toEqual([secret.id]);
      expect(await client2.get(secret.id)).toEqual(secret);
    });
  });

  client1.on('update', async () => {
    if (!(await client1.getKeys()).length) return;
    expect(await client1.getKeys()).toEqual([secret.id]);
    expect(await client1.get(secret.id)).toEqual(secret);
    await client2.close();
    await client1.close();
    done();
  });
}, 10000);

test('client1 can store & get secret after client2 is connected, client2 can get secret', (done) => {
  expect.assertions(4);

  const group = uuid.v1();
  const db1 = new DB();
  const client1 = new Client({ group, db: db1, singalingServer: 'localhost:8000' });
  let client2 = null;

  const secret = Secret.createEmpty('test');

  client1.once('ready', async () => {
    const db2 = new DB();
    client2 = new Client({ group, db: db2, singalingServer: 'localhost:8000' });

    client2.once('ready', () => {
      client1.once('unlocked', async () => {
        await client1.set(secret);
        expect(await client1.getKeys()).toEqual([secret.id]);
        expect(await client1.get(secret.id)).toEqual(secret);
      });
    });

    client2.on('update', async () => {
      if (!(await client2.getKeys()).length) return;
      expect(await client2.getKeys()).toEqual([secret.id]);
      expect(await client2.get(secret.id)).toEqual(secret);
      await client2.close();
      await client1.close();
      done();
    });
  });
}, 10000);

test('client1 can store & get secret before client2 is connected, client2 can get secret', (done) => {
  expect.assertions(4);

  const group = uuid.v1();
  const db1 = new DB();
  const client1 = new Client({ group, db: db1, singalingServer: 'localhost:8000' });
  let client2 = null;

  const secret = Secret.createEmpty('test');

  client1.once('ready', async () => {
    await client1.set(secret);
    expect(await client1.getKeys()).toEqual([secret.id]);
    expect(await client1.get(secret.id)).toEqual(secret);

    const db2 = new DB();
    client2 = new Client({ group, db: db2, singalingServer: 'localhost:8000' });

    client2.once('ready', async () => {
      expect(await client2.getKeys()).toEqual([secret.id]);
      expect(await client2.get(secret.id)).toEqual(secret);
      await client2.close();
      await client1.close();
      done();
    });
  });
}, 10000);
