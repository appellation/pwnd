use crate::{GenericArray, U16};
use std::slice::ChunksExact;

#[derive(Debug)]
pub struct AesChunks<'a> {
	chunks: ChunksExact<'a, u8>,
	rem: Vec<u8>,
	ended: bool,
}

impl<'a> From<&'a [u8]> for AesChunks<'a> {
	fn from(data: &'a [u8]) -> Self {
		let chunks = data.chunks_exact(16);
		let mut rem = chunks.remainder().to_vec();
		rem.resize(16, 0);

		println!("{:?}", data);
		println!("{:?}", chunks);
		println!("{:?}", rem);
		AesChunks{
			chunks,
			rem,
			ended: false,
		}
	}
}

impl<'a> Iterator for AesChunks<'a> {
	type Item = GenericArray<u8, U16>;

	fn next(&mut self) -> Option<GenericArray<u8, U16>> {
		if self.ended {
			None
		} else {
			match self.chunks.next() {
				Some(data) => Some(GenericArray::clone_from_slice(data)),
				None => {
					self.ended = true;
					Some(GenericArray::clone_from_slice(&self.rem))
				},
			}
		}
	}
}
