extern crate aes;
extern crate rand;
extern crate typenum;
extern crate x25519_dalek;

use aes::{Aes256, block_cipher_trait::{BlockCipher, generic_array::{GenericArray, typenum::U16}}};
use rand::rngs::OsRng;
pub use x25519_dalek::{PublicKey, SharedSecret, StaticSecret};

pub trait KeyPair {
	fn generate() -> Self;
	fn private_key(&self) -> [u8; 32];
	fn public_key(&self) -> PublicKey;
	fn shared_secret(&self, other: &PublicKey) -> SharedSecret;
	fn encrypt_local(&self, data: &mut Vec<u8>) -> Result<(), &str>;
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

	fn private_key(&self) -> [u8; 32] {
		self.to_bytes()
	}

	fn public_key(&self) -> PublicKey {
		PublicKey::from(self)
	}

	fn shared_secret(&self, other: &PublicKey) -> SharedSecret {
		self.diffie_hellman(other)
	}

	fn encrypt_local(&self, data: &mut Vec<u8>) -> Result<(), &str> {
		if data.ends_with(&[0]) {
			return Err("Cannot encrypt null-terminated data");
		}

		crypt(self, data, Aes256::encrypt_block);
		Ok(())
	}

	fn decrypt_local(&self, data: &mut Vec<u8>) {
		crypt(self, data, Aes256::decrypt_block);
		let mut i = data.len();
		while i > 0 && data[i-1] == 0 {
			i -= 1;
		}

		data.truncate(i);
	}
}

#[derive(PartialEq, Eq, Debug)]
pub struct Secret {
	pub id: i64,
	pub name: String,
	pub value: Option<Vec<u8>>,
}

pub trait SecretStore {
	fn list(&self) -> Result<Vec<Secret>, String>;
	fn add(&self, secret: &Secret) -> Result<(), String>;
	fn get(&self, name: &str) -> Result<Option<Secret>, String>;
}

#[cfg(test)]
mod test {
	use quickcheck::TestResult;
	use quickcheck_macros::quickcheck;
	use super::{KeyPair, StaticSecret};

	#[quickcheck]
	fn encrypt_decrypt_identity(xs: Vec<u8>) -> bool {
		let key_pair = StaticSecret::generate();

		let mut encrypted = xs.to_vec();
		let status = key_pair.encrypt_local(&mut encrypted);
		if status.is_err() {
			return xs.ends_with(&[0]);
		}

		key_pair.decrypt_local(&mut encrypted);

		xs == encrypted
	}

	#[quickcheck]
	fn encrypts_differently(xs: Vec<u8>) -> TestResult {
		if xs.len() == 0 {
			return TestResult::discard();
		}

		let key_pair = StaticSecret::generate();

		let mut encrypted = xs.to_vec();
		let status = key_pair.encrypt_local(&mut encrypted);
		if status.is_err() {
			return TestResult::from_bool(xs.ends_with(&[0]));
		}

		let mut xs2 = xs.clone();
		xs2.resize(encrypted.len(), 0);
		TestResult::from_bool(xs2 != encrypted)
	}
}
