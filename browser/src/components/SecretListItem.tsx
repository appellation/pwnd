import Link from 'next/link';
import { Component } from 'react';

export interface SecretListItemProps {
	id: string;
	title: string;
	subtitle?: string;
}

export default class SecretListItem extends Component<SecretListItemProps> {
	public render() {
		return (
			<Link href={this.props.id} passHref={true}>
				<a className="rounded block p-4 m-2">
					<p className="text-lg mb-2">{this.props.title}</p>
					<p className="text-gray-600">{this.props.subtitle}</p>
				</a>
			</Link>
		);
	}
}
