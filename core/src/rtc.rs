use bincode::deserialize;
use datachannel::{ConnectionState, DataChannel, GatheringState, IceCandidate, PeerConnection, RtcDataChannel, SessionDescription};
use tokio::sync::{broadcast, mpsc::Sender};
use uuid::Uuid;

use crate::models::packet::{rtc, ws};

#[derive(Debug)]
pub struct Response {
	pub target_id: Uuid,
	pub packet: ws::Packet,
}

#[derive(Debug, Clone)]
pub struct Chan {
	pub output: broadcast::Sender<rtc::Packet>,
}

impl DataChannel for Chan {
	fn on_message(&mut self, msg: &[u8]) {
		log::debug!("<- {:?}", msg);
		deserialize(msg).map(|pkt| self.output.send(pkt));
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
		log::info!("opened");
	}
}

#[derive(Debug, Clone)]
pub struct Conn {
	pub local_id: Uuid,
	pub remote_id: Uuid,
	pub signaling: Sender<Response>,
}

impl PeerConnection for Conn {
	type DC = Chan;

	fn on_description(&mut self, sess_desc: SessionDescription) {
		log::debug!("({}) signaling {:?}", self.local_id, sess_desc);

		self.signaling.blocking_send(Response {
			target_id: self.remote_id,
			packet: ws::Packet {
				client_id: self.local_id,
				op: ws::Op::SessionDescription(sess_desc),
			},
		});
	}

	fn on_candidate(&mut self, cand: IceCandidate) {
		log::debug!("({}) signaling {:?}", self.local_id, cand);

		self.signaling.blocking_send(Response {
			target_id: self.remote_id,
			packet: ws::Packet {
				client_id: self.local_id,
				op: ws::Op::IceCandidate(cand),
			},
		});
	}

	fn on_connection_state_change(&mut self, state: ConnectionState) {
		log::debug!("({}) connection state changed {:?}", self.local_id, state);
	}

	fn on_data_channel(&mut self, data_channel: Box<RtcDataChannel<Self::DC>>) {
		Box::leak(data_channel); // TODO: do something with this
		log::debug!("({}) data channel opened", self.local_id);
	}

	fn on_gathering_state_change(&mut self, state: GatheringState) {
		log::debug!("({}) gathering state change {:?}", self.local_id, state);
	}
}
