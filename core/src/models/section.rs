use super::field::Field;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Section {
	pub name: Option<String>,
	pub fields: Vec<Field>,
}
