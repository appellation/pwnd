use std::{
	fmt::{self, Debug, Formatter},
	sync::Arc,
};

use bincode::{deserialize, serialize};
use bytes::Bytes;
use dashmap::DashMap;
use datachannel::{Config, RtcDataChannel, RtcPeerConnection};
use serde::Serialize;
use thiserror::Error;
use tokio::{
	spawn,
	sync::{broadcast, mpsc},
};
use uuid::Uuid;

use crate::{
	models::packet::{rtc, ws},
	rtc::{Chan, ChanFactory, ChanReady, Conn},
};

const DATA_CHANNEL_LABEL: &'static str = "PWND";

#[derive(Debug, Error)]
pub enum Error {
	#[error("signaler error {0}")]
	Signaler(#[from] pwnd_signaler::Error),
	#[error("packet error {0}")]
	Serialization(#[from] bincode::Error),
	#[error("RTC error {0}")]
	Rtc(#[from] anyhow::Error),
	#[error("websocket closed")]
	WsClosed,
}

type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkOptions {
	pub id: Uuid,
	pub group: Uuid,
	pub signaling_server: String,
}

impl Default for NetworkOptions {
	fn default() -> Self {
		Self {
			id: Uuid::new_v4(),
			group: Uuid::new_v4(),
			signaling_server: "localhost:8000".to_owned(),
		}
	}
}

pub struct Network {
	/// The client ID of this network.
	pub id: Uuid,
	/// Map of client IDs to the RTC connection for that ID.
	peers: DashMap<Uuid, Box<RtcPeerConnection<Conn, ChanFactory>>>,
	/// Map of client IDs to a list of RTC data channels for that ID.
	peer_channels: DashMap<Uuid, Vec<Box<RtcDataChannel<Chan>>>>,
	/// The signaler to use for this network.
	signaler: pwnd_signaler::Group,
	/// The websocket to use for signaling on this network.
	ws: pwnd_signaler::ws::WebSocket,
	/// Channel over which new RTC data is received.
	peer_data: broadcast::Sender<rtc::Packet>,
	/// Channel over which new channels are received.
	new_channels: mpsc::Sender<ChanReady>,
}

impl Network {
	pub async fn new(group_id: Uuid) -> Result<Arc<Self>> {
		Self::new_opts(&NetworkOptions {
			group: group_id,
			..Default::default()
		})
		.await
	}

	pub async fn new_opts(options: &NetworkOptions) -> Result<Arc<Self>> {
		let signaler = pwnd_signaler::Group::new(&options.signaling_server, options.group);
		let ws = signaler.connect(options.id).await?;
		let ws_recv = ws.subscribe().await;

		let (peer_tx, _) = broadcast::channel(1);
		let (chan_tx, chan_rx) = mpsc::channel(1);

		let client = Arc::new(Self {
			id: options.id,
			peers: Default::default(),
			peer_channels: Default::default(),
			signaler,
			ws,
			peer_data: peer_tx,
			new_channels: chan_tx,
		});

		let ws_client = Arc::clone(&client);
		spawn(async move { ws_client.consume_ws(ws_recv).await });

		let chans_client = Arc::clone(&client);
		spawn(async move { chans_client.consume_new_chans(chan_rx).await });

		log::info!("Created {:?}", client);
		Ok(client)
	}

	pub fn subscribe(&self) -> broadcast::Receiver<rtc::Packet> {
		self.peer_data.subscribe()
	}

	pub async fn announce(&self) -> Result<()> {
		// let ready = Default::default();
		self.ws
			.send(serialize(&ws::Packet {
				client_id: self.id,
				op: ws::Op::Announce,
			})?)
			.await;

		// ready.wait().await;
		Ok(())
	}

	pub fn send<T: Serialize + Debug>(&self, target_id: Uuid, data: &T) -> Option<()> {
		let bytes = serialize(data).ok()?;
		for chan in self.peer_channels.get_mut(&target_id)?.iter_mut() {
			chan.send(&bytes).ok()?
		}

		Some(())
	}

	async fn consume_new_chans(&self, mut chan_rx: mpsc::Receiver<ChanReady>) {
		while let Some(chan) = chan_rx.recv().await {
			self.peer_channels
				.entry(chan.0)
				.or_default()
				.value_mut()
				.push(chan.1);
		}
	}

	async fn consume_ws(&self, mut ws: broadcast::Receiver<Bytes>) -> Result<()> {
		loop {
			let maybe_msg = ws.recv().await;
			match maybe_msg {
				Err(broadcast::error::RecvError::Closed) => break,
				Err(broadcast::error::RecvError::Lagged(count)) => log::warn!(
					"skipped {} messages while consuming WebSocket messages",
					count
				),
				Ok(msg) => self.handle_msg(msg)?,
			}
		}

		Ok(())
	}

	fn handle_msg(&self, data: Bytes) -> Result<()> {
		let packet = deserialize::<ws::Packet>(&data)?;

		if packet.client_id == self.id {
			return Ok(());
		}

		let mut conn = self
			.peers
			.entry(packet.client_id)
			.or_insert_with(|| self.create_peer_connection(packet.client_id));

		match packet.op {
			ws::Op::Announce => {
				let mut chans = self.peer_channels.entry(packet.client_id).or_default();
				let new_chan = conn
					.create_data_channel(
						DATA_CHANNEL_LABEL,
						Chan {
							output: self.peer_data.clone(),
						},
					)
					.map_err(anyhow::Error::new)?;
				chans.push(new_chan);

				log::debug!(
					"({}) created channel for {} ({} total)",
					self.id,
					packet.client_id,
					chans.len()
				);
			}
			ws::Op::SessionDescription(desc) => {
				conn.set_remote_description(&desc)
					.map_err(anyhow::Error::new)?;

				log::debug!("({}) set {:?} for peer {}", self.id, desc, packet.client_id);
			}
			ws::Op::IceCandidate(ice) => {
				conn.add_remote_candidate(&ice)
					.map_err(anyhow::Error::new)?;

				log::debug!("({}) set {:?} for peer {}", self.id, ice, packet.client_id);
			}
		}

		Ok(())
	}

	fn create_peer_connection(&self, client_id: Uuid) -> Box<RtcPeerConnection<Conn, ChanFactory>> {
		log::trace!("creating peer connection for {}", client_id);

		let pc = Conn {
			local_id: self.id,
			remote_id: client_id,
			signaler: self.signaler.clone(),
			new: self.new_channels.clone(),
		};

		let dc = ChanFactory(self.peer_data.clone());

		RtcPeerConnection::new(
			&Config::new(vec!["stun:stun.l.google.com:19302".to_string()]),
			pc,
			dc,
		)
		.unwrap()
	}
}

impl Debug for Network {
	fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
		f.debug_struct("Network").field("id", &self.id).finish()
	}
}
