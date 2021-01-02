use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::section::Section;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SecretType {
	Empty,
	Login,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Secret {
	pub id: String,
	pub r#type: SecretType,
	pub name: String,
	pub icon: Option<String>,
	pub data: Vec<Section>,
	pub custom: Vec<Section>,
	pub notes: Option<String>,
	pub updated_at: DateTime<Utc>,
	pub created_at: DateTime<Utc>,
}
