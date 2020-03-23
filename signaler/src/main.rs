use dashmap::DashMap;
use futures::StreamExt;
use std::sync::{
	Arc,
	atomic::{AtomicUsize, Ordering},
};
use tokio::sync::mpsc;
use warp::{Filter, ws::{WebSocket, Ws}};

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

	conns.insert(conn_id, tx.clone());

	while let Some(result) = user_ws_rx.next().await {
		if tx.send(result).is_err() {
			break;
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
		.and(users)
		.map(|user_id: String, ws: Ws, users: Users| {
			ws.on_upgrade(move |socket| ws_handler(socket, user_id, users))
		});

	warp::serve(ws)
		.run(([127, 0, 0, 1], 8000))
		.await
}
