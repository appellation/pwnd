use bytes;
use dashmap::DashMap;
use futures::StreamExt;
use std::sync::{
	Arc,
	atomic::{AtomicUsize, Ordering},
};
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

static NEXT_CONN_ID: AtomicUsize = AtomicUsize::new(0);

async fn ws_handler(ws: WebSocket, user_id: String, users: Users) {
	if !users.contains_key(&user_id) {
		let conns: UserConnections = DashMap::new();
		users.insert(user_id.clone(), conns);
	}

	let (user_ws_tx, mut user_ws_rx) = ws.split();

	let (tx, rx) = mpsc::unbounded_channel();
	tokio::task::spawn(rx.forward(user_ws_tx));

	let conns = users.get(&user_id).unwrap();
	let mut conn_id = NEXT_CONN_ID.fetch_add(1, Ordering::Relaxed);
	while conns.contains_key(&conn_id) {
		conn_id = NEXT_CONN_ID.fetch_add(1, Ordering::Relaxed);
	}

	conns.insert(conn_id, tx);

	while let Some(Ok(msg)) = user_ws_rx.next().await {
		for conn in conns.value().iter().filter(|r#ref| *r#ref.key() != conn_id) {
			let _ = conn.send(Ok(msg.clone()));
		}
	}

	conns.remove(&conn_id);
}

type UserConnections = DashMap<usize, mpsc::UnboundedSender<Result<warp::ws::Message, warp::Error>>>;
type Users = Arc<DashMap<String, UserConnections>>;

#[tokio::main]
async fn main() {
	let users = DashMap::new();
	let users: Users = Arc::new(users);
	let users = warp::any().map(move || users.clone());

	let ws = warp::path::param::<String>()
		.and(warp::ws())
		.and(users.clone())
		.map(|user_id: String, ws: Ws, users: Users| {
			ws.on_upgrade(move |socket| ws_handler(socket, user_id, users))
		});

	let post_client = warp::path!(String / usize)
		.and(warp::post())
		.and(warp::body::bytes())
		.and(users.clone())
		.map(|user_id: String, connection_id: usize, body: bytes::Bytes, users: Users| {
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
		.and(warp::post())
		.and(users)
		.map(|user_id: String, users: Users| {
			match users.get(&user_id) {
				None => Response::builder().status(StatusCode::NOT_FOUND).body("".to_string()),
				Some(connections) => {
					let clients: Vec<String> = connections.value().into_iter().map(|entry| entry.key().to_string()).collect();
					Response::builder().body(clients.join(","))
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
