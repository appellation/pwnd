use bytes;
use dashmap::DashMap;
use futures::StreamExt;
use rmp_serde;
use std::sync::Arc;
use tokio::sync::mpsc;
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

async fn ws_handler(ws: WebSocket, user_id: String, connection_id: String, users: Users) {
	if !users.contains_key(&user_id) {
		let conns: UserConnections = DashMap::new();
		users.insert(user_id.clone(), conns);
	}

	let conns = users.get(&user_id).unwrap();
	if conns.contains_key(&connection_id) {
		let _ = ws.close().await;
		return;
	}

	let (user_ws_tx, mut user_ws_rx) = ws.split();

	let (tx, rx) = mpsc::unbounded_channel();
	tokio::task::spawn(rx.forward(user_ws_tx));

	conns.insert(connection_id.clone(), tx);

	while let Some(Ok(msg)) = user_ws_rx.next().await {
		for conn in conns.value().iter().filter(|r#ref| *r#ref.key() != connection_id) {
			let _ = conn.send(Ok(msg.clone()));
		}
	}

	conns.remove(&connection_id);
}

type UserConnections = DashMap<String, mpsc::UnboundedSender<Result<warp::ws::Message, warp::Error>>>;
type Users = Arc<DashMap<String, UserConnections>>;

#[tokio::main]
async fn main() {
	let users = DashMap::new();
	let users: Users = Arc::new(users);
	let users = warp::any().map(move || users.clone());

	let ws = warp::path!(String / String)
		.and(warp::ws())
		.and(users.clone())
		.map(|user_id: String, connection_id: String, ws: Ws, users: Users| {
			ws.on_upgrade(move |socket| ws_handler(socket, user_id, connection_id, users))
		});

	let post_client = warp::path!(String / String)
		.and(warp::post())
		.and(warp::body::bytes())
		.and(users.clone())
		.map(|user_id: String, connection_id: String, body: bytes::Bytes, users: Users| {
			users
				.get(&user_id)
				.as_ref()
				.and_then(|connections| connections.value().get(&connection_id))
				.map_or(StatusCode::NOT_FOUND, |conn| {
					match conn.send(Ok(Message::binary(body.to_vec()))) {
						Ok(_) => StatusCode::OK,
						Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
					}
				})
		});

	let get_clients = warp::path::param::<String>()
		.and(warp::get())
		.and(users)
		.map(|user_id: String, users: Users| {
			match users.get(&user_id) {
				None => Response::builder().status(StatusCode::NOT_FOUND).body(vec![]),
				Some(connections) => {
					let clients: Vec<String> = connections.value().into_iter().map(|entry| entry.key().to_string()).collect();
					Response::builder()
						.header("Content-Type", "application/msgpack")
						.body(rmp_serde::to_vec(&clients).unwrap())
				}
			}
		});

	let routes = ws
		.or(post_client)
		.or(get_clients);

	warp::serve(routes)
		.run(([127, 0, 0, 1], 8000))
		.await
}
