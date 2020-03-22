extern crate dashmap;
extern crate futures;
extern crate serde;
extern crate serde_json;
extern crate tokio;
extern crate warp;

use dashmap::DashMap;
use futures::StreamExt;
use std::sync::Arc;
use tokio::{
	sync::{mpsc, RwLock},
	time::{timeout, Duration},
};
use warp::{Filter, ws::{WebSocket, Ws}};

async fn ws_handler(mut ws: WebSocket, user_id: String, users: Users) {
	let hello = timeout(Duration::from_secs(10), ws.next()).await;
	match hello {
		Ok(Some(Ok(msg))) => {
			if !users.contains_key(&user_id) {
				let conns = RwLock::new(Vec::new());
				users.insert(user_id.clone(), conns);
			}

			let conns = users.get(&user_id).unwrap();
			for conn in &*conns.read().await {
				let _ = conn.send(Ok(msg.clone()));
			}

			let (user_ws_tx, mut user_ws_rx) = ws.split();

			let (tx, rx) = mpsc::unbounded_channel();
			tokio::task::spawn(rx.forward(user_ws_tx));

			conns.write().await.push(tx.clone());

			while let Some(result) = user_ws_rx.next().await {
				if tx.send(result).is_err() {
					break;
				}
			}
		},
		_ => {
			let _ = ws.close().await;
		},
	};
}

type UserConnections = RwLock<Vec<mpsc::UnboundedSender<Result<warp::ws::Message, warp::Error>>>>;
type Users = Arc<DashMap<String, UserConnections>>;

#[tokio::main]
async fn main() {
	let users = DashMap::<String, UserConnections>::new();
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
