export enum FieldType {
  TEXT,
  HIDDEN,
  CREDITCARD,
}

export interface RawField {
  name: string;
  value: string;
  type: FieldType;
}

export default class Field {
  public name: string;

  public value: string;

  public type: FieldType;

  constructor({ name, value, type }: RawField) {
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

  static fromJSON(obj: RawField) {
    return new Field(obj);
  }
}
