export default interface DB<K, V> {
  get(id: K): Promise<V>;
  set(id: K, entry: V): Promise<void>;
  delete(id: K): Promise<void>;
  getKeys(): Promise<K[]>;
  getDeleted(): Promise<K[]>;
}
