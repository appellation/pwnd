import { Component } from 'react';

class Home extends Component {
	private randomString?: (len: number) => string;
	public state = {
		password: '',
	};

	private generatePassword() {
		this.setState({
			password: this.randomString(32),
		});
	}

	public componentDidMount() {
		import('&').then(({ random_string }) => {
			this.randomString = random_string;
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
