module.exports = class WebsiteLogin {
  constructor({ website, username, password, lastUpdated, created, lastUpdatedBy, createdBy } = {}) {
    this.type = 'WebsiteLogin';

    this.website = website;
    this.username = username;
    this.password = password;

    this.lastUpdated = lastUpdated;
    this.created = created;

    this.lastUpdatedBy = lastUpdatedBy;
    this.createdBy = createdBy;
  }

  static createUnencrypted({ website, username, password, lastUpdated, created, lastUpdatedBy, createdBy } = {}) {
    throw new Error('not implemented');
  }

  toJSON() {
    return {
      website: this.website,
      username: this.username,
      password: this.password,
      lastUpdated: this.lastUpdated,
      created: this.created,
      lastUpdatedBy: this.lastUpdatedBy,
      createdBy: this.createdBy,
    };
  }

  getUnencryptedPassword(key) {
    throw new Error('not implemented');
  }

  setUnencryptedPassword(key, password) {
    throw new Error('not implemented');
  }
};
