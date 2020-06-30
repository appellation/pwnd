import { get, set, Store } from 'idb-keyval';
import { Client, ClientInstance } from 'pwnd-core';
import IDB from './IDB';

export default class ClientManager {
	public static async getInstance(): Promise<ClientInstance> {
		if (this.instance) return this.instance;
		return this.instance = await this.createInstance();
	}

	public static setGroup(group: string): Promise<void> {
		return set('group', group, this.store);
	}

	public static setKey(key: string): Promise<void> {
		return set('key', key, this.store);
	}

	public static setSignalingServer(server: string): Promise<void> {
		return set('signalingServer', server, this.store);
	}

	private static store = new Store('pwnd', 'internal');
	private static instance?: ClientInstance;

	private static async createInstance() {
		const group: string = await get('group', this.store);
		if (!group) throw new Error('group is unspecified');

		const key: string = await get('key', this.store);
		if (!key) throw new Error('key is unspecified');

		const signalingServer: string = await get('signalingServer', this.store);
		if (!signalingServer) throw new Error('signaling server is unspecified');

		return new Client({
			db: IDB.instance,
			group,
			key,
			signalingServer,
		});
	}

	private constructor() {}
}
