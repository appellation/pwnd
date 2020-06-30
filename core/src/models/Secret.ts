import * as uuid from 'uuid';
import Field, { FieldType } from './Field';
import Section, { RawSection } from './Section';

export type RawSecret = BaseSecret<RawSection>;

export interface BaseSecret<S> {
  id: string;
  type: SecretType;
  name: string;
  icon: string | null;
  data: S[];
  custom: S[];
  notes: string;
  updated: any;
  created: any;
}

export enum SecretType {
  EMPTY,
  LOGIN,
}

export default class Secret {
  public id: string;
  public type: SecretType;
  public name: string;
  public icon: string | null;
  public data: Section[];
  public custom: Section[];
  public notes: string;
  public updated: any;
  public created: any;

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
  }: BaseSecret<Section>) {
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

  static createEmpty(name: string) {
    return new Secret({
      id: uuid.v1(),
      type: SecretType.EMPTY,
      name,
      icon: null,
      data: [],
      custom: [],
      notes: '',
      updated: [null, null],
      created: [null, null],
    });
  }

  static createLogin(name: string, username: string, password: string) {
    return new Secret({
      id: uuid.v1(),
      type: SecretType.LOGIN,
      name,
      icon: null,
      data: [
        new Section({
          name: null,
          fields: [
            new Field({
              name: 'username',
              value: username,
              type: FieldType.TEXT,
            }),
            new Field({
              name: 'password',
              value: password,
              type: FieldType.HIDDEN,
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
      data: this.data,
      custom: this.data,
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
  }: RawSecret) {
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
