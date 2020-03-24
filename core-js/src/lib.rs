#![recursion_limit="256"]

extern crate pwnd;
extern crate wasm_bindgen;

#[macro_use]
extern crate arrayref;

// use pwnd::random;
use pwnd::{
  secret::{KeyPair, Secret, SecretStore, StaticSecret},
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn random_string(len: usize, charset: &str) -> String {
  pwnd::random::random_string(len, charset)
}

// #[wasm_bindgen]
// pub fn encrypt(private: &[u8], data: &mut [u8], out: &mut [u8]) -> bool {
//   let pk = array_ref![private, 0, 32];
//   let key_pair = StaticSecret::from(pk.to_owned());

//   // let key_pair = StaticSecret::from(private as &[u8; 32]);
//   let vec: &mut Vec<u8> = &mut data.to_vec();
//   let status = key_pair.encrypt_local(vec);
//   if status.is_err() {
//     // return Err(JsValue::from(status.unwrap()));
//     return false;
//   }

//   // out = &mut vec.as_slice();
//   // data = vec.as_slice();

//   true

//   // Ok(())
// }