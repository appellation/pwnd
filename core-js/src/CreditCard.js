module.exports = class CreditCard {
  constructor({ number, cvc, cardholder, lastUpdated, created, lastUpdatedBy, createdBy } = {}) {
    this.type = 'CreditCard';

    this.number = number;
    this.cvc = cvc;

    this.cardholder = cardholder;

    this.lastUpdated = lastUpdated;
    this.created = created;

    this.lastUpdatedBy = lastUpdatedBy;
    this.createdBy = createdBy;
  }

  static createUnencrypted({ number, cvc, cardholder, lastUpdated, created, lastUpdatedBy, createdBy } = {}) {
    throw new Error('not implemented');
  }

  toJSON() {
    return {
      number: this.number,
      cvc: this.cvc,
      cardholder: this.cardholder,
      lastUpdated: this.lastUpdated,
      created: this.created,
      lastUpdatedBy: this.lastUpdatedBy,
      createdBy: this.createdBy,
    };
  }

  getUnencryptedNumber(key) {
    throw new Error('not implemented');
  }

  setUnencryptedNumber(key, number) {
    throw new Error('not implemented');
  }

  getUnencryptedCVC(key) {
    throw new Error('not implemented');
  }

  setUnencryptedCVC(key, cvc) {
    throw new Error('not implemented');
  }
};
