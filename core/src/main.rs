use pwnd_core::{
	models::packet::{rtc, ws},
	network::Network,
};
use tokio::{spawn, sync::broadcast};
use uuid::Uuid;

#[tokio::main]
async fn main() {
	pretty_env_logger::init();

	let group_id = Uuid::new_v4();

	let a = Network::new(group_id)
		.await
		.expect("unable to create network");
	let b = Network::new(group_id)
		.await
		.expect("unable to create network");

	let ah = spawn(handle_packet(a.subscribe()));
	let bh = spawn(handle_packet(b.subscribe()));

	a.send_signal(ws::Op::Announce("hello".to_owned()))
		.await
		.expect("unable to send announcement");

	// a.send_peer(b.id, rtc::Packet::Ping);

	let _ = tokio::join!(ah, bh);
}

async fn handle_packet(mut receiver: broadcast::Receiver<rtc::Packet>) {
	while let Ok(packet) = receiver.recv().await {
		println!("{:?}", packet);
	}
}
