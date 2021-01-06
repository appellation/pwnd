use std::sync::atomic::{AtomicBool, Ordering};

use tokio::sync::Notify;

#[derive(Debug, Default)]
pub struct Ready {
	is_ready: AtomicBool,
	ready: Notify,
}

impl Ready {
	pub fn notify(&self) {
		if self.is_ready.swap(true, Ordering::SeqCst) {
			self.ready.notify_waiters();
		}
	}

	pub async fn wait(&self) {
		if !self.is_ready.load(Ordering::SeqCst) {
			self.ready.notified().await;
		}
	}
}
