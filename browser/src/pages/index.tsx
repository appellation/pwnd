import { get, keys } from 'idb-keyval';
import Link from 'next/link';
import { Component } from 'react';
import Secret from '../types/Secret';
import SecretDisplay from '../components/SecretDisplay';
import SecretList from '../components/SecretList';

interface SecretsPageState {
	secrets: Secret[];
	selectedSecret?: Secret;
}

export default class SecretsPage extends Component {
	public state: SecretsPageState = { secrets: [] };

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
				<div className="flex-auto max-w-md h-screen border-r-2">
					<div className="p-4 border-b">
						<Link href="/generate">
							<a className="p-4 w-full rounded border block text-lg font-bold hover:bg-gray-100 hover:shadow"><i className="fas fa-plus mr-2" />Add new</a>
						</Link>
					</div>
					<SecretList secrets={this.state.secrets} />
				</div>
				{this.state.selectedSecret ?? <SecretDisplay secret={this.state.selectedSecret} />}
			</div>
		);
	}
}
