extern crate wasm_bindgen;

use crate::secret::{KeyPair, StaticSecret};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn generate_secret() -> Vec<u8> {
	StaticSecret::generate().private_key().to_vec()
}
