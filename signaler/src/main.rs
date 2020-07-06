use std::{
	collections::HashMap,
	sync::Arc,
};
use tokio::sync::{mpsc, RwLock};
use warp::Filter;

mod handlers;

type UserConnections = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Result<warp::ws::Message, warp::Error>>>>>;
type Users = Arc<RwLock<HashMap<String, UserConnections>>>;

#[tokio::main]
async fn main() {
	let users = Users::default();
	let users = warp::any().map(move || Arc::clone(&users));

	let ws = warp::path!(String / String)
		.and(warp::ws())
		.and(users.clone())
		.and_then(handlers::ws);

	let post_client = warp::path!(String / String)
		.and(warp::post())
		.and(warp::body::bytes())
		.and(users.clone())
		.and_then(handlers::send_message);

	let get_clients = warp::path::param::<String>()
		.and(warp::get())
		.and(users)
		.and_then(handlers::get_clients);

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
