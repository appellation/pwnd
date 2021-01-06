pub mod ws {
	use datachannel::{IceCandidate, SessionDescription};
	use serde::{Deserialize, Serialize};
	use uuid::Uuid;

	#[derive(Debug, Serialize, Deserialize)]
	pub struct Packet {
		pub client_id: Uuid,
		pub op: Op,
	}

	#[derive(Debug, Serialize, Deserialize)]
	pub enum Op {
		Announce,
		SessionDescription(SessionDescription),
		IceCandidate(IceCandidate),
	}
}

pub mod rtc {
	use crate::models::secret::Secret;
	use serde::{Deserialize, Serialize};
	use uuid::Uuid;

	#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
	#[serde(tag = "op", content = "d")]
	pub enum Packet {
		SyncRequest,
		SyncResponse {
			secrets: Vec<Secret>,
			deleted: Vec<Secret>,
		},
		SyncTruth {
			secrets: Vec<Secret>,
			deleted: Vec<Secret>,
		},
		Update {
			id: Uuid,
			data: Secret,
		},
		Ping,
		Pong,
	}
}
