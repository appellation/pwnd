import { Component } from 'react';
import pwnd from 'pwnd-core';

class Home extends Component {
	private randomString?: (len: number, charset: string) => string;
	public state = {
		password: '',
	};

	private generatePassword() {
		this.setState({
			password: this.randomString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'),
		});
	}

	public componentDidMount() {
		pwnd().then(({ randomString }) => {
			this.randomString = randomString;
			this.generatePassword();
		});
	}

	public render() {
		return (
			<div>
				<button onClick={this.generatePassword.bind(this)}>Regenerate</button>
				{this.state.password}
			</div>
		);
	}
}

export default Home;
