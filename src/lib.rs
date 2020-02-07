extern crate aes;
extern crate rand;
extern crate typenum;
extern crate x25519_dalek;

use aes::{Aes256, block_cipher_trait::{BlockCipher, generic_array::{GenericArray, typenum::U16}}};
use rand::rngs::OsRng;
pub use x25519_dalek::{PublicKey, SharedSecret, StaticSecret};

pub mod local;

pub trait KeyPair {
	fn generate() -> Self;
	fn private_key(&self) -> Vec<u8>;
	fn public_key(&self) -> PublicKey;
	fn shared_secret(&self, other: &PublicKey) -> SharedSecret;
	fn encrypt_local(&self, data: &mut Vec<u8>);
	fn decrypt_local(&self, data: &mut Vec<u8>);
}

fn crypt(secret: &StaticSecret, data: &mut Vec<u8>, f: impl Fn(&Aes256, &mut GenericArray<u8, U16>)) {
	let pk = &secret.to_bytes();
	let key = GenericArray::from_slice(pk);
	let cipher = Aes256::new(&key);

	let new_len = (data.len() + 15) / 16 * 16;
	data.resize(new_len, 0);

	let mut chunks = data.chunks_exact_mut(16);
	for chunk in &mut chunks {
		f(&cipher, GenericArray::from_mut_slice(chunk));
	}
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

	fn encrypt_local(&self, data: &mut Vec<u8>) {
		crypt(self, data, Aes256::encrypt_block);
	}

	fn decrypt_local(&self, data: &mut Vec<u8>) {
		crypt(self, data, Aes256::decrypt_block);
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
