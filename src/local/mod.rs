extern crate sqlite;

use sqlite::{Connection, Value};
use crate::secret::{KeyPair, Secret, SecretStore};

pub struct SqliteStore<T: KeyPair> {
	connection: Connection,
	key_pair: T,
}

impl<T: KeyPair> SqliteStore<T> {
	pub fn new(file: &str, key_pair: T) -> Self {
		let init = include_bytes!("schema.sql");
		let conn = sqlite::open(file).unwrap();
		conn.execute(String::from_utf8_lossy(init)).unwrap();

		SqliteStore{
			connection: conn,
			key_pair,
		}
	}
}

impl<T: KeyPair> SecretStore for SqliteStore<T> {
	fn list<'a>(&self) -> Result<Vec<Secret>, String> {
		let mut statement = self.connection
			.prepare("SELECT id, name FROM secrets")
			.map_err(|err| err.to_string())?
			.cursor();

		let mut secrets = Vec::<Secret>::with_capacity(statement.count());
		while let Ok(Some(row)) = statement.next() {
			secrets.push(Secret{
				id: row[0].as_integer().unwrap(),
				name: String::from_utf8(row[1].as_binary().unwrap().to_vec())
					.map_err(|err| err.to_string())?
					.to_string(),
				value: None,
			});
		}

		Ok(secrets)
	}

	fn add(&self, secret: &Secret) -> Result<(), String> {
		if secret.name.is_empty() {
			return Err("Name cannot be empty".to_string());
		}

		match &secret.value {
			None => Err("Value is required".to_string()),
			Some(value) => {
				let mut cursor = self.connection
					.prepare("INSERT OR REPLACE INTO secrets (name, value) VALUES (?, ?)")
					.map_err(|err| err.to_string())?
					.cursor();

				let mut cloned = value.to_vec();
				let status = self.key_pair.encrypt_local(&mut cloned);
				if let Err(status) = status {
					return Err(status.to_string());
				}

				cursor.bind(&[
					Value::Binary(secret.name.as_bytes().to_vec()),
					Value::Binary(cloned),
				]).unwrap();

				match cursor.next() {
					Err(err) => Err(err.to_string()),
					Ok(_) => Ok(()),
				}
			},
		}
	}

	fn get(&self, name: &str) -> Result<Option<Secret>, String> {
		let mut statement = self.connection
			.prepare("SELECT id, name, value FROM secrets WHERE name = ?")
			.map_err(|err| err.to_string())?
			.cursor();

		statement.bind(&[
			Value::Binary(name.as_bytes().to_vec()),
		]).unwrap();

		match statement.next() {
			Err(err) => Err(err.to_string()),
			Ok(Some(row)) => {
				let mut value = row[2].as_binary().unwrap().to_vec();
				self.key_pair.decrypt_local(&mut value);

				Ok(Some(Secret{
					id: row[0].as_integer().unwrap(),
					name: String::from_utf8(row[1].as_binary().unwrap().to_vec())
						.map_err(|err| err.to_string())?
						.to_string(),
					value: Some(value),
				}))
			},
			Ok(None) => Ok(None),
		}
	}
}

#[cfg(test)]
mod test {
	use quickcheck::TestResult;
	use quickcheck_macros::quickcheck;
	use super::{SqliteStore};
	use crate::secret::{KeyPair, Secret, SecretStore, StaticSecret};

	const NAME: &'static str = ":memory:";

	#[test]
	fn connects() {
		let key_pair = StaticSecret::generate();
		SqliteStore::new(NAME, key_pair);
	}

	#[test]
	fn lists() {
		let key_pair = StaticSecret::generate();
		let store = SqliteStore::new(NAME, key_pair);

		let res = store.list();
		assert!(res.is_ok());

		let list = res.unwrap();
		assert_eq!(list.len(), 0);
	}

	#[quickcheck]
	fn adds(name: String, value: Option<Vec<u8>>) -> TestResult {
		let key_pair = StaticSecret::generate();
		let store = SqliteStore::new(NAME, key_pair);
		let is_invalid_value = value.as_ref().map_or(true, |v| v.ends_with(&[0]));
		let secret = Secret{
			id: 1, // SQLite sets the first ID to 1 automatically, otherwise this doesn't matter
			name: name.clone(),
			value,
		};

		let res = store.add(&secret);
		if is_invalid_value || name.is_empty() {
			return TestResult::from_bool(res.is_err());
		}
		assert!(res.is_ok());

		let saved = store.get(&name);
		assert!(saved.is_ok());

		let saved_secret = saved.unwrap();
		assert!(saved_secret.is_some());
		assert!(secret == saved_secret.unwrap());
		TestResult::passed()
	}
}
