use reqwest::Body;
use std::fmt::Display;
use thiserror::Error;
use tokio::runtime::Handle;
use ws::WebSocket;

pub mod ws;

#[cfg(feature = "insecure")]
const WS_PROTOCOL: &str = "ws";
#[cfg(not(feature = "insecure"))]
const WS_PROTOCOL: &str = "wss";

#[cfg(feature = "insecure")]
const HTTP_PROTOCOL: &str = "http";
#[cfg(not(feature = "insecure"))]
const HTTP_PROTOCOL: &str = "https";

#[derive(Debug, Error)]
pub enum Error {
	#[error("WebSocket error {0}")]
	#[cfg(not(target = "wasm32-unknown-unknown"))]
	Ws(#[from] tungstenite::Error),
	#[error("HTTP error {0}")]
	Http(#[from] reqwest::Error),
}

type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, Clone)]
pub struct Group {
	base_url: String,
	http: reqwest::Client,
	handle: Handle,
}

impl Group {
	pub fn new(url: impl Display, group_id: impl Display) -> Self {
		let base_url = format!("{}/{}", url, group_id);

		Self {
			base_url,
			http: Default::default(),
			handle: Handle::current(),
		}
	}

	pub async fn connect(&self, client_id: impl Display) -> Result<WebSocket> {
		let ws_url = format!("{}://{}/{}", WS_PROTOCOL, self.base_url, client_id);
		Ok(ws::WebSocket::connect(&ws_url).await?)
	}

	pub async fn send(&self, client_id: impl Display, data: impl Into<Body>) -> Result<()> {
		let target_url = format!("{}://{}/{}", HTTP_PROTOCOL, self.base_url, client_id);
		self.http.post(&target_url).body(data).send().await?;
		Ok(())
	}

	pub fn spawn_send(&self, client_id: impl Display, data: impl Into<Body>) {
		let target_url = format!("{}://{}/{}", HTTP_PROTOCOL, self.base_url, client_id);
		self.handle
			.spawn(self.http.post(&target_url).body(data).send());
	}
}
