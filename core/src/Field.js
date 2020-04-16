class Field {
  constructor({ name, value, type }) {
    this.name = name;
    this.value = value;
    this.type = type;
  }

  toJSON() {
    return {
      name: this.name,
      value: this.value,
      type: this.type,
    };
  }

  static fromJSON(obj) {
    return new Field(obj);
  }
}

Field.TEXT = 0;
Field.HIDDEN = 1;
Field.CREDITCARD = 2;

module.exports = Field;
