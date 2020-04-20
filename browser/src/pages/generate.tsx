import { Component } from 'react';
import Link from 'next/link';
import pwnd from 'pwnd-core';

export default class Generate extends Component {
	private randomString?: (len: number, charset: string) => string;
	public state = {
		password: '',
	};

	private generatePassword() {
		this.setState({
			password: this.randomString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'),
		});
	}

	public async componentDidMount() {
		const { randomString } = await pwnd();
		this.randomString = randomString;
		this.generatePassword();
	}

	public render() {
		return (
			<>
				<Link href="..">
					<a className="p-3 m-2 hover:bg-gray-300 rounded-full inline-block absolute"><i className="fas fa-arrow-left fa-2x" /></a>
				</Link>
				<div className="container mx-auto">
					<div className="pt-4 mb-4">
						<h1 className="inline-block text-2xl font-semibold">Add new secret</h1>
					</div>
					<button onClick={this.generatePassword.bind(this)}>Regenerate</button>
					<input className="font-mono p-2 border rounded focus:shadow-inner" type="text" readOnly value={this.state.password} />
				</div>
			</>
		);
	}
}
