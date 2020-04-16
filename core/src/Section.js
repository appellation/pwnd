const Field = require('./Field');

module.exports = class Section {
  constructor({ name, fields }) {
    this.name = name;
    this.fields = fields;
  }

  toJSON() {
    return {
      name: this.name,
      fields: this.fields.map((x) => x.toJSON()),
    };
  }

  static fromJSON({ name, fields }) {
    return new Section({
      name,
      fields: fields.map((x) => Field.fromJSON(x)),
    });
  }
};
