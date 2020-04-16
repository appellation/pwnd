const uuid = require('uuid');

const { Client, Secret } = require('..')();
const DB = require('./db');

test('standalone client can store secret', (done) => {
  const group = uuid.v1();
  const db = new DB();
  const client = new Client({ group, db, singalingServer: 'localhost:8000' });

  const secret = Secret.createEmpty('test');

  client.on('ready', async () => {
    await client.set(secret);
    await client.close();
    done();
  });
});

test('standalone client can store and recall secret', (done) => {
  expect.assertions(2);

  const group = uuid.v1();
  const db = new DB();
  const client = new Client({ group, db, singalingServer: 'localhost:8000' });

  const secret = Secret.createEmpty('test');

  client.on('ready', async () => {
    await client.set(secret);
    expect(await client.getKeys()).toEqual([secret.id]);
    expect(await client.get(secret.id)).toEqual(secret);
    await client.close();
    done();
  });
});

test('standalone client can store, recall, and delete secret', (done) => {
  expect.assertions(5);

  const group = uuid.v1();
  const db = new DB();
  const client = new Client({ group, db, singalingServer: 'localhost:8000' });

  const secret = Secret.createEmpty('test');

  client.on('ready', async () => {
    await client.set(secret);
    expect(await client.getKeys()).toEqual([secret.id]);
    expect(await client.get(secret.id)).toEqual(secret);
    await client.delete(secret.id);
    expect(await client.getDeleted()).toEqual([secret.id]);
    expect(await client.getKeys()).toEqual([]);
    expect(await client.get(secret.id)).toEqual(null);
    await client.close();
    done();
  });
});
