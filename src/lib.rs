extern crate aes;
extern crate rand;
extern crate typenum;
extern crate x25519_dalek;

use aes::{Aes256, block_cipher_trait::{BlockCipher, generic_array::GenericArray}};
use rand::rngs::OsRng;
use typenum::consts::U16;
pub use x25519_dalek::{PublicKey, SharedSecret, StaticSecret};

pub mod local;
pub mod encrypt;

pub trait KeyPair {
	fn generate() -> Self;
	fn private_key(&self) -> Vec<u8>;
	fn public_key(&self) -> PublicKey;
	fn shared_secret(&self, other: &PublicKey) -> SharedSecret;
	fn encrypt_local(&self, data: &[u8]) -> Vec<u8>;
	fn decrypt_local(&self, data: &[u8]) -> Vec<u8>;
}

impl KeyPair for StaticSecret {
	fn generate() -> Self {
		Self::new(&mut OsRng{})
	}

	fn private_key(&self) -> Vec<u8> {
		self.to_bytes().to_vec()
	}

	fn public_key(&self) -> PublicKey {
		PublicKey::from(self)
	}

	fn shared_secret(&self, other: &PublicKey) -> SharedSecret {
		self.diffie_hellman(other)
	}

	fn encrypt_local(&self, data: &[u8]) -> Vec<u8> {
		let pk = &self.to_bytes();
		let key = GenericArray::from_slice(pk);
		let cipher = Aes256::new(&key);

		let mut chunks = encrypt::AesChunks::from(data);
		for mut chunk in &mut chunks {
			cipher.encrypt_block(&mut chunk);
		}

		println!("{:?}", chunks);
		chunks.flatten().collect()
	}

	fn decrypt_local(&self, data: &[u8]) -> Vec<u8> {
		let pk = &self.to_bytes();
		let key = GenericArray::from_slice(pk);
		let cipher = Aes256::new(&key);

		let mut chunks = encrypt::AesChunks::from(data);
		for mut chunk in &mut chunks {
			cipher.decrypt_block(&mut chunk);
		}

		chunks.flatten().collect()
	}
}

pub struct Secret {
	pub id: i64,
	pub name: String,
	pub value: Option<Vec<u8>>,
}

pub trait SecretStore {
	fn list(&self) -> Result<Vec<Secret>, String>;
	fn add(&self, secret: &Secret) -> Result<(), String>;
	fn get(&self, name: &str) -> Result<Secret, String>;
}
