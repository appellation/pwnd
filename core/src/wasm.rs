use crate::secret::{KeyPair, StaticSecret};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn random_string(len: usize, charset: &str) -> String {
	crate::random::random_string(len, charset)
}

#[wasm_bindgen]
pub fn encrypt(pk: &[u8], data: &[u8]) -> Result<Box<[u8]>, JsValue> {
	let key_pair = StaticSecret::from(*array_ref![pk,0,32]);
	let mut vec = data.to_vec();

	key_pair.encrypt_local(&mut vec)
		.map(|_| vec.into_boxed_slice())
		.map_err(JsValue::from)
}
