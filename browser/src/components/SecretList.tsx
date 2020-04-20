import { Component } from 'react';
import Secret, { SecretType } from '../types/Secret';
import SecretListItem from './SecretListItem';

export default class SecretList extends Component<{ secrets: Secret[] }> {
	public get sortedSecrets(): Secret[] {
		return this.props.secrets.sort((a, b) => a.name.localeCompare(b.name));
	}

	public render() {
		return (
			<div>
				{this.sortedSecrets.map(secret => <SecretListItem id={secret.id} title={secret.name} />)}
			</div>
		);
	}
}
