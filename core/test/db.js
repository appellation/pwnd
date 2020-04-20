module.exports = class InMemoryDB {
  constructor() {
    this.deleted = [];
    this.secrets = new Map();
  }

  async get(id) {
    if (!this.secrets.has(id)) return null;

    return this.secrets.get(id);
  }

  async set(secret) {
    this.secrets.set(secret.id, secret);
  }

  async delete(id) {
    this.secrets.delete(id);
    this.deleted.push(id);
  }

  async getKeys() {
    return Array.from(this.secrets.keys());
  }

  async getDeleted() {
    return this.deleted;
  }
};
