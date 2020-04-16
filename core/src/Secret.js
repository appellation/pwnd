const uuid = require('uuid');

const Field = require('./Field');
const Section = require('./Section');

class Secret {
  constructor({
    id,
    type,
    name,
    icon,
    data,
    custom,
    notes,
    updated,
    created,
  }) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.icon = icon;

    this.data = data;
    this.custom = custom;

    this.notes = notes;

    this.updated = updated;
    this.created = created;
  }

  static createEmpty(name) {
    return new Secret({
      id: uuid.v1(),
      type: Secret.EMPTY,
      name,
      icon: null,
      data: [],
      custom: [],
      notes: '',
      updated: [null, null],
      created: [null, null],
    });
  }

  static createLogin(name, username, password) {
    return new Secret({
      id: uuid.v1(),
      type: Secret.EMPTY,
      name,
      icon: null,
      data: [
        new Section({
          name: null,
          fields: [
            new Field({
              name: 'username',
              value: username,
              type: Field.TEXT,
            }),
            new Field({
              name: 'password',
              value: password,
              type: Field.HIDDEN,
            }),
          ],
        }),
      ],
      custom: [],
      notes: '',
      updated: [null, null],
      created: [null, null],
    });
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      icon: this.icon,
      data: this.data.map((x) => x.toJSON()),
      custom: this.data.map((x) => x.toJSON()),
      notes: this.notes,
      updated: this.updated,
      created: this.created,
    };
  }

  static fromJSON({
    id,
    type,
    name,
    icon,
    data,
    custom,
    notes,
    updated,
    created,
  }) {
    return new Secret({
      id,
      type,
      name,
      icon,
      data: data.map((x) => Section.fromJSON(x)),
      custom: custom.map((x) => Section.fromJSON(x)),
      notes,
      updated,
      created,
    });
  }
}

Secret.EMPTY = 0;
Secret.LOGIN = 1;

module.exports = Secret;
