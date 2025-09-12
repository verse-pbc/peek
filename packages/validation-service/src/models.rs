use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationPoint {
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationProof {
    pub coordinates: LocationPoint,
    pub accuracy: f64,  // meters
    pub timestamp: DateTime<Utc>,
    pub heading: Option<f64>,  // degrees
    pub speed: Option<f64>,    // m/s
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QRPayload {
    pub version: u32,
    pub community_id: Uuid,
    pub relay_url: String,
    pub location: LocationPoint,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateLocationRequest {
    pub community_id: Uuid,
    pub location: LocationProof,
    pub qr_data: QRPayload,
    pub user_pubkey: String,  // npub
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateLocationResponse {
    pub success: bool,
    pub invite_code: Option<String>,
    pub error: Option<String>,
    pub requires_photo_proof: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPreviewRequest {
    pub community_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPreviewResponse {
    pub name: String,
    pub description: Option<String>,
    pub member_count: u32,
    pub requires_location: bool,
    pub distance_from_venue: Option<f64>,
}