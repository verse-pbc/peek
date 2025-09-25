use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationPoint {
    pub latitude: f64,
    pub longitude: f64,
}
