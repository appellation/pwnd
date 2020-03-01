extern crate getrandom;
extern crate wasm_bindgen;

use std::convert::TryInto;
use std::char;
use wasm_bindgen::prelude::*;

const BOTTOM_GAP: u16 = 0xD7FF; // the bottom of the valid character range
const GAP_SIZE: u16 = 0xE000 - BOTTOM_GAP; // the size of the gap between valid characters
const CONTROL_LENGTH: u16 = 0x21; // the top of the ASCII control code range

#[wasm_bindgen]
pub fn random_string(len: usize) -> String {
	let mut pwd = String::with_capacity(len);
	for _ in 0..len {
		pwd.push(random_char());
	}
	pwd
}

#[wasm_bindgen]
pub fn random_char() -> char {
	let mut bytes = [0u8; 2];
	getrandom::getrandom(&mut bytes).expect("Unable to generate random values on this platform");

	let mut num = u16::from_le_bytes(bytes);
	if num < CONTROL_LENGTH {
		num += CONTROL_LENGTH;
	}

	if num > BOTTOM_GAP {
		num += GAP_SIZE;
	}

	match char::from_u32(num.try_into().unwrap()) {
		None => random_char(),
		Some(c) => c,
	}
}
