import { Component } from 'react';
import Secret, { SecretType, PasswordSecret } from '../types/Secret';
import SecretListItem from './SecretListItem';

export default class SecretList extends Component<{ secrets: Secret[] }> {
	public get passwords(): PasswordSecret[] {
		return this.props.secrets.filter(secret => secret.type === SecretType.PASSWORD);
	}

	public render() {
		return (
			<div>
				<h1 className="text-lg font-bold">Passwords</h1>
				{this.passwords.map(secret => <SecretListItem id={secret.id} title={secret.site} subtitle={secret.username} />)}
			</div>
		);
	}
}
