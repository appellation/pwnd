use futures::StreamExt;
use std::{
	collections::hash_map::Entry,
	sync::Arc,
};
use tokio::sync::mpsc;
use warp::{
	http::{
		Response,
		status::StatusCode,
	},
	ws::{
		Message,
		WebSocket,
		Ws,
	},
};

use super::{UserConnections, Users};

async fn ws_connection_handler(ws: WebSocket, connection_id: String, conns: UserConnections) {
	let (user_ws_tx, mut user_ws_rx) = ws.split();

	let (tx, rx) = mpsc::unbounded_channel();
	tokio::task::spawn(rx.forward(user_ws_tx));

	match conns.write().await.entry(connection_id.clone()) {
		Entry::Occupied(_) => return,
		Entry::Vacant(e) => { e.insert(tx); },
	}

	while let Some(Ok(msg)) = user_ws_rx.next().await {
		if msg.is_close() {
			break;
		}

		for (_, conn) in conns.read().await.iter().filter(|(k, _)| *k != &connection_id) {
			let _ = conn.send(Ok(msg.clone()));
		}
	}

	conns.write().await.remove(&connection_id);
}

pub async fn ws(user_id: String, connection_id: String, ws: Ws, users: Users) -> Result<impl warp::Reply, std::convert::Infallible> {
	let conns = Arc::clone(users.write().await.entry(user_id).or_default());
	Ok(ws.on_upgrade(move |socket| ws_connection_handler(socket, connection_id, conns)))
}

pub async fn send_message(user_id: String, connection_id: String, body: bytes::Bytes, users: Users) -> Result<impl warp::Reply, std::convert::Infallible> {
	match users.read().await.get(&user_id) {
		Some(connections) => connections
			.read().await
			.get(&connection_id)
			.map_or(Ok(StatusCode::NOT_FOUND), |conn| match conn.send(Ok(Message::binary(body.to_vec()))) {
				Ok(_) => Ok(StatusCode::OK),
				Err(_) => Ok(StatusCode::INTERNAL_SERVER_ERROR),
			}),
		None => Ok(StatusCode::NOT_FOUND),
	}
}

pub async fn get_clients(user_id: String, users: Users) -> Result<impl warp::Reply, std::convert::Infallible> {
	match users.read().await.get(&user_id) {
		None => Ok(Response::builder().status(StatusCode::NOT_FOUND).body(vec![])),
		Some(connections) => {
			let clients: Vec<String> = connections.read().await.iter().map(|(key, _)| key.to_string()).collect();
			Ok(Response::builder()
				.header("Content-Type", "application/msgpack")
				.body(rmp_serde::to_vec(&clients).unwrap()))
		}
	}
}
