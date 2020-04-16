export enum SecretType {
	PASSWORD,
}

export interface BaseSecret {
	id: string;
	type: SecretType;
}

export interface PasswordSecret extends BaseSecret {
	type: SecretType.PASSWORD;
	site: string;
	username: string;
	password: string;
}

type Secret = PasswordSecret; // | others
export default Secret;
