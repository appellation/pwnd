use bincode::{deserialize, serialize};
use datachannel::{
	ConnectionState, DataChannel, GatheringState, IceCandidate, MakeDataChannel, PeerConnection,
	RtcDataChannel, SessionDescription,
};
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::models::packet::{rtc, ws};

pub type ChanReady = (Uuid, Box<RtcDataChannel<Chan>>);

pub struct ChanFactory(pub broadcast::Sender<rtc::Packet>);

impl MakeDataChannel<Chan> for ChanFactory {
	fn make(&mut self) -> Chan {
		Chan {
			output: self.0.clone(),
		}
	}
}

#[derive(Debug, Clone)]
pub struct Chan {
	pub output: broadcast::Sender<rtc::Packet>,
}

impl DataChannel for Chan {
	fn on_message(&mut self, msg: &[u8]) {
		log::debug!("<- {:?}", msg);
		let _ = deserialize(msg).map(|pkt| self.output.send(pkt));
	}

	fn on_available(&mut self) {
		log::debug!("available");
	}

	fn on_buffered_amount_low(&mut self) {
		log::warn!("buffered amount low");
	}

	fn on_closed(&mut self) {
		log::info!("closed");
	}

	fn on_error(&mut self, err: &str) {
		log::error!("error {}", err);
	}

	fn on_open(&mut self) {
		// self.ready
		// 	.as_ref()
		// 	.and_then(|weak_ready| weak_ready.upgrade())
		// 	.map(|ready| ready.notify());
	}
}

#[derive(Debug, Clone)]
pub struct Conn {
	pub local_id: Uuid,
	pub remote_id: Uuid,
	pub signaler: pwnd_signaler::Group,
	pub new: mpsc::Sender<ChanReady>,
}

impl Conn {
	fn send(&self, data: &ws::Packet) {
		let _ = self
			.signaler
			.spawn_send(self.remote_id, serialize(data).unwrap());
	}
}

impl PeerConnection for Conn {
	type DC = Chan;

	fn on_description(&mut self, sess_desc: SessionDescription) {
		log::debug!("({}) signaling {:?}", self.local_id, sess_desc);

		self.send(&ws::Packet {
			client_id: self.local_id,
			op: ws::Op::SessionDescription(sess_desc),
		});
	}

	fn on_candidate(&mut self, cand: IceCandidate) {
		log::debug!("({}) signaling {:?}", self.local_id, cand);

		self.send(&ws::Packet {
			client_id: self.local_id,
			op: ws::Op::IceCandidate(cand),
		});
	}

	fn on_connection_state_change(&mut self, state: ConnectionState) {
		log::debug!("({}) connection state changed {:?}", self.local_id, state);
	}

	fn on_data_channel(&mut self, data_channel: Box<RtcDataChannel<Self::DC>>) {
		let _ = self.new.blocking_send((self.remote_id, data_channel));
		log::debug!("({}) data channel opened", self.local_id);
	}

	fn on_gathering_state_change(&mut self, state: GatheringState) {
		log::debug!("({}) gathering state change {:?}", self.local_id, state);
	}
}
