use serde::{Deserialize, Serialize};
use uuid::Uuid;
use super::location::LocationProof;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateLocationRequest {
    pub community_id: Uuid,
    pub location_proof: LocationProof,
    pub user_pubkey: String,  // npub or hex pubkey
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateLocationResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invite_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ValidateLocationResponse {
    pub fn success(invite_code: String, relay_url: String, expires_at: i64) -> Self {
        Self {
            success: true,
            invite_code: Some(invite_code),
            relay_url: Some(relay_url),
            expires_at: Some(expires_at),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            invite_code: None,
            relay_url: None,
            expires_at: None,
            error: Some(message),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPreviewRequest {
    pub id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPreviewResponse {
    pub id: Uuid,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub member_count: u32,
    pub location: LocationInfo,
    pub created_at: String,  // ISO 8601 format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationInfo {
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
}

impl CommunityPreviewResponse {
    pub fn error(message: String) -> Self {
        Self {
            id: Uuid::nil(),
            name: String::new(),
            description: None,
            member_count: 0,
            location: LocationInfo {
                name: String::new(),
                latitude: 0.0,
                longitude: 0.0,
            },
            created_at: String::new(),
            error: Some(message),
        }
    }
}