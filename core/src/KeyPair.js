module.exports = ({
  generate,
  publicKey,
  encrypt,
  decrypt,
}) => {
  const PublicKey = require('./PublicKey')(); // eslint-disable-line global-require

  return class KeyPair {
    constructor(pk) {
      this.private = pk;
      this.public = new PublicKey(publicKey(pk));
    }

    static generate() {
      return new KeyPair(generate());
    }

    encrypt(data) {
      return encrypt(this.private, data);
    }

    decrypt(data) {
      return decrypt(this.private, data);
    }
  };
};
