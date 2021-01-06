use std::fmt::Debug;

use async_tungstenite::tokio::connect_async;
use bytes::Bytes;
use futures::{Sink, SinkExt, Stream, StreamExt};
use tokio::{
	spawn,
	sync::{broadcast, mpsc},
};
use tungstenite::Message;

#[derive(Debug, Clone)]
pub struct WebSocket {
	out_tx: mpsc::Sender<Message>,
	in_tx: broadcast::Sender<Bytes>,
}

impl WebSocket {
	pub async fn connect(url: &str) -> Result<Self, tungstenite::Error> {
		let (sink, stream) = connect_async(url).await?.0.split();

		let (out_tx, out_rx) = mpsc::channel(1);
		spawn(republish_to_sink(out_rx, sink));

		let (in_tx, _) = broadcast::channel(1);
		spawn(consume_stream(stream, out_tx.clone(), in_tx.clone()));

		Ok(Self { out_tx, in_tx })
	}

	pub async fn send(&self, data: Vec<u8>) {
		log::debug!("<- {:?}", data);
		let _ = self.out_tx.send(Message::Binary(data)).await;
	}

	pub fn blocking_send(&self, data: Vec<u8>) {
		log::debug!("<- (blocking) {:?}", data);
		let _ = self.out_tx.blocking_send(Message::Binary(data));
	}

	pub async fn subscribe(&self) -> broadcast::Receiver<Bytes> {
		self.in_tx.subscribe()
	}
}

async fn republish_to_sink(
	mut receiver: mpsc::Receiver<Message>,
	mut sink: impl Sink<Message> + Unpin,
) {
	while let Some(item) = receiver.recv().await {
		let _ = sink.send(item).await;
	}
}

async fn consume_stream<E>(
	mut stream: impl Stream<Item = Result<Message, E>> + Unpin,
	out_tx: mpsc::Sender<Message>,
	in_tx: broadcast::Sender<Bytes>,
) {
	while let Some(Ok(item)) = stream.next().await {
		log::debug!("-> {:?}", item);

		let packet = match item {
			Message::Binary(data) => Bytes::from(data),
			Message::Close(_) => break,
			Message::Ping(data) => {
				let _ = out_tx.send(Message::Pong(data)).await;
				continue;
			}
			Message::Pong(_) => {
				// TODO: verify this
				continue;
			}
			Message::Text(text) => Bytes::from(text),
		};

		let _ = in_tx.send(packet);
	}
}
