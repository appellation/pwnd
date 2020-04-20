export enum SecretType {
	EMPTY,
	PASSWORD,
	CREDIT_CARD,
}

export enum FieldType {
	TEXT,
	HIDDEN,
}

export interface SecretSection {
	name: string | null;
	fields: SecretField[];
}

export interface SecretField {
	name: string;
	value: string;
	type: FieldType;
}

export default interface Secret {
	id: string;
	name: string;
	type: SecretType;
	icon: string | null;
	data: SecretSection[];
	custom: SecretSection[];
	notes: string;
	updated: [string, string];
	update: [string, string];
}
