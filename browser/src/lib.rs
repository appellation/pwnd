#![recursion_limit="256"]

use pwnd::random;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn random_string(len: usize) -> String {
	random::random_string(len, random::ALL)
}
