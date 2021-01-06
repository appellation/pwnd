#[cfg(not(target = "wasm32-unknown-unknown"))]
mod native;
#[cfg(not(target = "wasm32-unknown-unknown"))]
pub use native::*;
