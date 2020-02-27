extern crate reqwest;
extern crate pwnd;

use pwnd::sync::Client;
use std::collections::HashMap;
use std::net::IpAddr;
use std::str::FromStr;

pub struct LocalClient;

impl Client for LocalClient {
	fn own_ip(&self) -> Result<IpAddr, Box<dyn std::error::Error>> {
		let resp = reqwest::blocking::get("https://httpbin.org/ip")?
			.json::<HashMap<String, String>>()?;

		IpAddr::from_str(&resp["origin"]).map_err(Box::from)
	}
}
