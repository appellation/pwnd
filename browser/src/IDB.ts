import { get, set, del, keys, Store } from 'idb-keyval';
import { DB, Secret } from 'pwnd-core';

export default class IDB implements DB<string, Secret> {
	private static _instance?: IDB;

	public static get instance(): IDB {
		if (this._instance) return this._instance;
		return this._instance = new this('pwnd');
	}

	private deleted: Set<string> = new Set();
	private store: Store;

	constructor(name: string) {
		this.store = new Store(name);
	}

	public get(key: string): Promise<Secret> {
		return get(key, this.store);
	}

	public set(key: string, value: Secret): Promise<void> {
		return set(key, value, this.store);
	}

	public delete(key: string): Promise<void> {
		this.deleted.add(key);
		return del(key, this.store);
	}

	public async getKeys(): Promise<string[]> {
		const ks = await keys(this.store);
		return ks.map(k => k.toString());
	}

	public getDeleted(): Promise<string[]> {
		return Promise.resolve(Array.from(this.deleted));
	}
}
