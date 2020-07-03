#![feature(async_closure)]

use bytes;
use futures::StreamExt;
use rmp_serde;
use std::{
	collections::HashMap,
	sync::Arc,
};
use tokio::sync::{mpsc, RwLock};
use warp::{
	Filter,
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

async fn ws_connection_handler(ws: WebSocket, connection_id: String, conns: UserConnections) {
	if conns.read().await.contains_key(&connection_id) {
		let _ = ws.close().await;
		return;
	}

	let (user_ws_tx, mut user_ws_rx) = ws.split();

	let (tx, rx) = mpsc::unbounded_channel();
	tokio::task::spawn(rx.forward(user_ws_tx));

	conns.write().await.insert(connection_id.clone(), tx);

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

async fn ws_handler(user_id: String, connection_id: String, ws: Ws, users: Users) -> Result<impl warp::Reply, std::convert::Infallible> {
	let conns = Arc::clone(users.write().await.entry(user_id).or_default());
	Ok(ws.on_upgrade(move |socket| ws_connection_handler(socket, connection_id, conns)))
}

async fn send_message_handler(user_id: String, connection_id: String, body: bytes::Bytes, users: Users) -> Result<impl warp::Reply, std::convert::Infallible> {
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

async fn get_clients_handler(user_id: String, users: Users) -> Result<impl warp::Reply, std::convert::Infallible> {
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

type UserConnections = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Result<warp::ws::Message, warp::Error>>>>>;
type Users = Arc<RwLock<HashMap<String, UserConnections>>>;

#[tokio::main]
async fn main() {
	let users = RwLock::new(HashMap::new());
	let users: Users = Arc::new(users);
	let users = warp::any().map(move || Arc::clone(&users));

	let ws = warp::path!(String / String)
		.and(warp::ws())
		.and(users.clone())
		.and_then(ws_handler);

	let post_client = warp::path!(String / String)
		.and(warp::post())
		.and(warp::body::bytes())
		.and(users.clone())
		.and_then(send_message_handler);

	let get_clients = warp::path::param::<String>()
		.and(warp::get())
		.and(users)
		.and_then(get_clients_handler);

	let cors = warp::cors()
		.allow_any_origin()
		.allow_methods(vec!["GET", "POST"])
		.build();

	let routes = ws
		.or(post_client)
		.or(get_clients)
		.with(cors);

	warp::serve(routes)
		.run(([0, 0, 0, 0], 8000))
		.await
}
