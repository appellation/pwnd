use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use rmp_serde;
use std::sync::Arc;
use tokio::{sync::broadcast, task};
use warp::{
	http::{status::StatusCode, Response},
	hyper::body::Bytes,
	ws::{Message, WebSocket, Ws},
	Filter,
};

async fn ws_handler(ws: WebSocket, user_id: String, connection_id: String, users: Users) {
	let mut rx = {
		let conns = users.entry(user_id.clone()).or_default();
		let sender = conns
			.entry(connection_id.clone())
			.or_insert_with(|| broadcast::channel(32).0);
		sender.subscribe()
	};

	let (mut ws_tx, mut ws_rx) = ws.split();

	task::spawn(async move {
		while let Ok(msg) = rx.recv().await {
			let _ = ws_tx.send(msg).await;
		}
	});

	while let Some(Ok(msg)) = ws_rx.next().await {
		if msg.is_close() {
			break;
		}

		log::info!("{}/{} {:?}", user_id, connection_id, msg);
		let maybe_conns = users.get(&user_id);
		match maybe_conns {
			Some(conns) => {
				for conn in conns.iter() {
					let _ = conn.send(msg.clone());
				}
			}
			None => break,
		}
	}
}

type UserConnections = DashMap<String, broadcast::Sender<Message>>;
type Users = Arc<DashMap<String, UserConnections>>;

#[tokio::main]
async fn main() {
	pretty_env_logger::init();

	let users = Users::default();
	let users = warp::any().map(move || users.clone());

	let ws = warp::path!(String / String)
		.and(warp::ws())
		.and(users.clone())
		.map(
			|user_id: String, connection_id: String, ws: Ws, users: Users| {
				ws.on_upgrade(move |socket| ws_handler(socket, user_id, connection_id, users))
			},
		);

	let post_client = warp::path!(String / String)
		.and(warp::post())
		.and(warp::body::bytes())
		.and(users.clone())
		.map(
			|user_id: String, connection_id: String, body: Bytes, users: Users| {
				users
					.get(&user_id)
					.as_ref()
					.and_then(|connections| connections.value().get(&connection_id))
					.map_or(StatusCode::NOT_FOUND, |conn| {
						match conn.send(Message::binary(body.to_vec())) {
							Ok(_) => StatusCode::OK,
							Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
						}
					})
			},
		);

	let get_clients = warp::path::param::<String>()
		.and(warp::get())
		.and(users)
		.map(|user_id: String, users: Users| match users.get(&user_id) {
			None => Response::builder()
				.status(StatusCode::NOT_FOUND)
				.body(vec![]),
			Some(connections) => {
				let clients: Vec<String> = connections
					.value()
					.into_iter()
					.map(|entry| entry.key().to_string())
					.collect();
				Response::builder()
					.header("Content-Type", "application/msgpack")
					.body(rmp_serde::to_vec(&clients).unwrap())
			}
		});

	let cors = warp::cors()
		.allow_any_origin()
		.allow_methods(vec!["GET", "POST"]);

	let routes = ws
		.or(post_client)
		.or(get_clients)
		.with(warp::log("pwnd_signaler"))
		.with(cors);

	warp::serve(routes).run(([0, 0, 0, 0], 8000)).await
}
