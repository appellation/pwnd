use crate::secret::{KeyPair, StaticSecret};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = randomString)]
pub fn random_string(len: usize, charset: &str) -> String {
	crate::random::random_string(len, charset)
}

#[wasm_bindgen]
pub fn generate() -> Box<[u8]> {
	let key_pair = StaticSecret::generate();
	Box::new(key_pair.private_key())
}

#[wasm_bindgen(js_name = publicKey)]
pub fn public_key(pk: &[u8]) -> Box<[u8]> {
	let key_pair = StaticSecret::from(*array_ref![pk,0,32]);
	key_pair.public_key().as_bytes().to_vec().into_boxed_slice()
}

#[wasm_bindgen]
pub fn encrypt(pk: &[u8], data: &[u8]) -> Result<Box<[u8]>, JsValue> {
	let key_pair = StaticSecret::from(*array_ref![pk,0,32]);
	let mut vec = data.to_vec();

	key_pair.encrypt_local(&mut vec)
		.map(|_| vec.into_boxed_slice())
		.map_err(JsValue::from)
}

#[wasm_bindgen]
pub fn decrypt(pk: &[u8], data: &[u8]) -> Box<[u8]> {
	let key_pair = StaticSecret::from(*array_ref![pk,0,32]);
	let mut vec = data.to_vec();

	key_pair.decrypt_local(&mut vec);
	vec.into_boxed_slice()
}
