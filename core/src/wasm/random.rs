use rand::{thread_rng, Rng};
use std::char;
use wasm_bindgen::prelude::*;

pub const NUMERIC: &'static str = "01234567890";
pub const ALPHA: &'static str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
pub const SPECIAL_CHARACTERS: &'static str = "~!@#$%^&*()-=_+,./;'[]<>?:\"{}|";

pub const ALL: &'static str = "01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@#$%^&*()-=_+,./;'[]<>?:\"{}|";

#[wasm_bindgen]
pub fn random_string(len: usize, charset: &str) -> String {
	let mut pwd = String::with_capacity(len);
	let mut rng = thread_rng();
	for _ in 0..len {
		pwd.push(random_char(&mut rng, charset));
	}
	pwd
}

pub fn random_char<T: Rng>(rng: &mut T, charset: &str) -> char {
	let num = rng.gen_range(0, charset.len());
	charset.as_bytes()[num] as char
}
