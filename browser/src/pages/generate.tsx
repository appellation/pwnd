import { Component } from 'react';
import Link from 'next/link';
import { SecretType } from 'pwnd-core';
import CreateSecret from 'src/components/CreateSecret';

export default class Generate extends Component<{}, { type: SecretType }> {
	public state = { type: SecretType.LOGIN };

	private secretTypeChanged: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
		this.setState({ type: Number(event.target.value) });
	}

	private getSecretCreator(): JSX.Element {
		return <CreateSecret type={this.state.type} />;
	}

	public render() {
		return (
			<>
				<Link href="..">
					<a className="p-3 m-2 hover:bg-gray-300 rounded-full inline-block absolute"><i className="fas fa-arrow-left fa-2x" /></a>
				</Link>
				<div className="container mx-auto">
					<div className="pt-4 mb-4">
						<h1 className="inline-block text-2xl font-semibold">Add new <select value={this.state.type} onChange={this.secretTypeChanged}>
							<option value={SecretType.LOGIN}>login</option>
							<option value={SecretType.EMPTY}>secret</option>
						</select></h1>
					</div>
					{this.getSecretCreator()}
				</div>
			</>
		);
	}
}
