import { get, keys } from 'idb-keyval';
import { Component } from 'react';
import Secret, { SecretType, PasswordSecret } from 'src/types/Secret';
import SecretListItem from 'src/components/SecretListItem';
import SecretList from 'src/components/SecretList';

interface SecretsPageState {
	secrets: Secret[];
}

export default class SecretsPage extends Component<{}, SecretsPageState> {
	public async loadSecrets() {
		const secrets = await Promise.all((await keys()).map(k => get<Secret>(k)));
		this.setState({ secrets });
	}

	public componentDidMount() {
		this.loadSecrets();
	}

	public render() {
		return (
			<div className="flex">
				<div className="flex-auto max-w-md">
					<SecretList secrets={this.state.secrets} />
				</div>
			</div>
		);
	}
}
