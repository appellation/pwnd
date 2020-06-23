import Field, { RawField } from './Field';

export interface RawSection {
  name: string | null;
  fields: RawField[];
}

export default class Section {
  public name: string | null;

  public fields: Field[];

  constructor({ name, fields }: { name: string | null, fields: Field[] }) {
    this.name = name;
    this.fields = fields;
  }

  toJSON() {
    return {
      name: this.name,
      fields: this.fields,
    };
  }

  static fromJSON({ name, fields }: RawSection) {
    return new Section({
      name,
      fields: fields.map((x) => Field.fromJSON(x)),
    });
  }
}
