extern crate sqlite;

use sqlite::{Connection, State};
use super::{KeyPair, Secret, SecretStore};

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
			connection: sqlite::open(file).unwrap(),
			key_pair,
		}
	}
}

impl<T: KeyPair> SecretStore for SqliteStore<T> {
	fn list<'a>(&self) -> Result<Vec<Secret>, String> {
		let result = self.connection.prepare("SELECT id, name FROM secrets");
		let mut statement = result.map_err(|err| err.to_string())?;

		let mut secrets = Vec::<Secret>::new();
		while let State::Row = statement.next().unwrap() {
			secrets.push(Secret{
				id: statement.read::<i64>(0).unwrap(),
				name: statement.read::<String>(1).unwrap(),
				value: None,
			});
		}

		Ok(secrets)
	}

	fn add(&self, secret: &Secret) -> Result<(), String> {
		let mut statement = self.connection
			.prepare("INSERT OR REPLACE INTO secrets (name, value) VALUES (?, ?)")
			.unwrap();

		match &secret.value {
			None => Err("Value is required".to_string()),
			Some(value) => {
				statement.bind(1, secret.name.as_str()).unwrap();
				statement.bind(2, self.key_pair.encrypt_local(value.as_slice()).as_slice()).unwrap();

				match statement.next() {
					Err(err) => Err(err.to_string()),
					Ok(_) => Ok(()),
				}
			},
		}
	}

	fn get(&self, name: &str) -> Result<Secret, String> {
		let mut statement = self.connection
			.prepare("SELECT id, name, value FROM secrets WHERE name = ?")
			.unwrap();

		statement.bind(1, name).unwrap();

		match statement.next() {
			Err(err) => Err(err.to_string()),
			Ok(_) => Ok(Secret{
				id: statement.read(0).unwrap(),
				name: statement.read(1).unwrap(),
				value: Some(self.key_pair.decrypt_local(&statement.read::<Vec<u8>>(2).unwrap())),
			}),
		}
	}
}
