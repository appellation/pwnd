extern crate qrcode;

use crate::secret::KeyPair;
use std::net::IpAddr;
pub use qrcode::{QrCode, types::QrError};

const VERSION: u8 = 0;

pub trait Client {
	fn own_ip(&self) -> Result<IpAddr, Box<dyn std::error::Error>>;
	fn qr_code<T: KeyPair>(&self, key_pair: &T) -> Result<QrCode, Box<dyn std::error::Error>> {
		let ip = self.own_ip()?;
		let mut data: Vec<u8> = Vec::with_capacity(49);
		data.push(VERSION);

		match ip {
			IpAddr::V4(v4) => data.extend_from_slice(&v4.octets()),
			IpAddr::V6(v6) => data.extend_from_slice(&v6.octets()),
		};

		data.extend_from_slice(key_pair.public_key().as_bytes());
		QrCode::new(data).map_err(Box::from)
	}
}
