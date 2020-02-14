use rand::{thread_rng, Rng};
use std::char;

const BOTTOM_GAP: u32 = 0xD7FF; // the bottom of the valid character range
const GAP_SIZE: u32 = 0xE000 - BOTTOM_GAP; // the size of the gap between valid characters
const CONTROL_LENGTH: u32 = 0x21; // the top of the ASCII control code range
const MAX_UTF8: u32 = 0x10000; // the maximum UTF-8 value to generate, exclusive
const MAX_RANGE: u32 = MAX_UTF8 - GAP_SIZE - CONTROL_LENGTH;

pub fn random_string(len: usize) -> String {
	let mut rng = thread_rng();
	let mut pwd = String::with_capacity(len);
	for _ in 0..len {
		pwd.push(random_char(&mut rng));
	}
	pwd
}

pub fn random_char<T: Rng>(rng: &mut T) -> char {
	let mut num = rng.gen_range(0, MAX_RANGE) + CONTROL_LENGTH;
	if num > BOTTOM_GAP {
		num += GAP_SIZE;
	}

	char::from_u32(num).unwrap()
}
