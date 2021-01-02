use std::{
	fmt::{self, Debug, Formatter},
	sync::Arc,
};

use async_tungstenite::{
	tokio::{connect_async, ConnectStream},
	WebSocketStream,
};
use bincode::{deserialize, serialize};
use dashmap::DashMap;
use datachannel::{Config, RtcDataChannel, RtcPeerConnection};
use futures::{stream::SplitSink, SinkExt, Stream, StreamExt};
use serde::Serialize;
use thiserror::Error;
use tokio::{
	spawn,
	sync::{broadcast, mpsc, Mutex},
};
use tungstenite::Message;
use uuid::Uuid;

use crate::{
	models::packet::{rtc, ws},
	rtc::{Chan, Conn, Response},
};

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
	#[error("websocket error {0}")]
	Ws(#[from] tungstenite::Error),
	#[error("packet error {0}")]
	Serialization(#[from] bincode::Error),
	#[error("RTC error {0}")]
	Rtc(#[from] anyhow::Error),
	#[error("websocket closed")]
	WsClosed,
}

type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientOptions {
	pub id: Uuid,
	pub group: Uuid,
	pub signaling_server: String,
}

impl Default for ClientOptions {
	fn default() -> Self {
		Self {
			id: Uuid::new_v4(),
			group: Uuid::new_v4(),
			signaling_server: "localhost:8000".to_owned(),
		}
	}
}

type WS = WebSocketStream<ConnectStream>;

pub struct Network {
	pub id: Uuid,
	base_url: String,
	peers: DashMap<Uuid, Box<RtcPeerConnection<Conn, Chan>>>,
	peer_channels: DashMap<Uuid, Vec<Box<RtcDataChannel<Chan>>>>,
	responses: mpsc::Sender<Response>,
	peer_data: broadcast::Sender<rtc::Packet>,
	ws_tx: Mutex<SplitSink<WS, Message>>,
	http: reqwest::Client,
}

impl Network {
	pub async fn new(group_id: Uuid) -> Result<Arc<Self>> {
		Self::new_opts(&ClientOptions {
			group: group_id,
			..Default::default()
		})
		.await
	}

	pub async fn new_opts(options: &ClientOptions) -> Result<Arc<Self>> {
		let base_url = format!("{}/{}", options.signaling_server, options.group);
		let ws_url = format!("{}://{}/{}", WS_PROTOCOL, base_url, options.id);
		let (ws, _) = connect_async(&ws_url).await?;

		let (ws_tx, ws_rx) = ws.split();
		let (res_tx, res_rx) = mpsc::channel(1);
		let (peer_tx, _) = broadcast::channel(1);

		let client = Arc::new(Self {
			id: options.id,
			base_url,
			peers: Default::default(),
			peer_channels: Default::default(),
			responses: res_tx,
			peer_data: peer_tx,
			ws_tx: Mutex::new(ws_tx),
			http: Default::default(),
		});

		let ws_client = Arc::clone(&client);
		spawn(async move { ws_client.consume_ws(ws_rx).await });

		let res_client = Arc::clone(&client);
		spawn(async move { res_client.consume_responses(res_rx).await });

		log::info!("Created {:?}", client);
		Ok(client)
	}

	pub fn subscribe(&self) -> broadcast::Receiver<rtc::Packet> {
		self.peer_data.subscribe()
	}

	pub async fn send_signal(&self, data: ws::Op) -> Result<()> {
		log::debug!("[WS] ({}) -> {:?}", self.id, data);

		Ok(self
			.ws_tx
			.lock()
			.await
			.send(Message::Binary(serialize(&ws::Packet {
				client_id: self.id,
				op: data,
			})?))
			.await?)
	}

	pub fn send<T: Serialize + Debug>(&self, target_id: Uuid, data: &T) -> Option<()> {
		log::debug!("[RTC] ({}) -> {:?} to {}", self.id, data, target_id);

		let bytes = serialize(data).ok()?;
		for chan in self.peer_channels.get_mut(&target_id)?.iter_mut() {
			chan.send(&bytes).ok()?
		}

		Some(())
	}

	async fn consume_ws<T: Stream<Item = Result<Message, tungstenite::Error>> + Unpin>(
		&self,
		mut ws: T,
	) -> Result<()> {
		while let Some(Ok(msg)) = ws.next().await {
			self.handle_msg(msg).await?;
		}

		Ok(())
	}

	async fn consume_responses(&self, mut rx: mpsc::Receiver<Response>) {
		while let Some(res) = rx.recv().await {
			log::debug!("[WS] ({}) -> {:?}", self.id, res);

			let target_url = format!("{}://{}/{}", HTTP_PROTOCOL, self.base_url, res.target_id);
			let http = self.http.clone();
			let http_res = http
				.post(&target_url)
				.body(serialize(&res.packet).unwrap())
				.send()
				.await;

			if let Err(err) = http_res {
				log::error!("[WS] unable to send message {:?} {:?}", res.packet, err);
			}
		}

		log::debug!("Finished consuming responses");
	}

	async fn handle_msg(&self, msg: Message) -> Result<()> {
		log::trace!("[WS] ({}) <- {:?}", self.id, msg);

		let packet = match msg {
			Message::Binary(data) => deserialize::<ws::Packet>(&data),
			Message::Close(_) => return Err(Error::WsClosed),
			Message::Ping(data) => {
				self.ws_tx.lock().await.send(Message::Pong(data)).await?;
				return Ok(());
			}
			Message::Pong(_) => {
				// TODO: verify this
				return Ok(());
			}
			Message::Text(text) => deserialize::<ws::Packet>(text.as_bytes()),
		}?;

		log::debug!("[WS] ({}) <- {:?}", self.id, packet);

		if packet.client_id == self.id {
			return Ok(());
		}

		let mut conn = self.peers.entry(packet.client_id).or_insert_with(|| {
			let pc = Conn {
				local_id: self.id,
				remote_id: packet.client_id,
				signaling: self.responses.clone(),
			};
			let dc = Chan {
				output: self.peer_data.clone(),
			};
			RtcPeerConnection::new(&Config::new(vec!["stun:stun.l.google.com:19302".to_string()]), pc, dc).unwrap()
		});

		match packet.op {
			ws::Op::Announce(label) => {
				let mut chans = self.peer_channels.entry(packet.client_id).or_default();
				let new_chan = conn
					.create_data_channel(
						&label,
						Chan {
							output: self.peer_data.clone(),
						},
					)
					.map_err(anyhow::Error::new)?;
				chans.push(new_chan);

				log::debug!(
					"[WS] ({}) created channel {} for {} ({} total)",
					self.id,
					&label,
					packet.client_id,
					chans.len()
				);
			}
			ws::Op::SessionDescription(desc) => {
				conn.set_remote_description(&desc)
					.map_err(anyhow::Error::new)?;

				log::debug!(
					"[WS] ({}) set {:?} for peer {}",
					self.id,
					desc,
					packet.client_id
				);
			},
			ws::Op::IceCandidate(ice) => {
				conn.add_remote_candidate(&ice)
					.map_err(anyhow::Error::new)?;

				log::debug!(
					"[WS] ({}) set {:?} for peer {}",
					self.id,
					ice,
					packet.client_id
				);
			},
		}

		Ok(())
	}
}

impl Debug for Network {
	fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
		f.debug_struct("Network")
			.field("id", &self.id)
			.field("base_url", &self.base_url)
			.finish()
	}
}
