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
    
    // Group membership info (when validation passes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    
    // Community preview info (only shown after passing location check)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub community: Option<CommunityPreview>,
    
    // Status messages
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPreview {
    pub name: String,
    pub description: Option<String>,
    pub member_count: u32,
    pub created_at: String,
    pub is_new: bool,  // true if this user just created it
}

impl ValidateLocationResponse {
    pub fn success_new_community(group_id: String, relay_url: String, community_name: String) -> Self {
        Self {
            success: true,
            group_id: Some(group_id),
            relay_url: Some(relay_url),
            community: Some(CommunityPreview {
                name: community_name,
                description: Some("You created this location-based community".to_string()),
                member_count: 1,
                created_at: chrono::Utc::now().to_rfc3339(),
                is_new: true,
            }),
            message: Some("Community created! You are now the admin.".to_string()),
            error: None,
        }
    }
    
    pub fn success_join_community(group_id: String, relay_url: String, preview: CommunityPreview) -> Self {
        Self {
            success: true,
            group_id: Some(group_id),
            relay_url: Some(relay_url),
            community: Some(preview),
            message: Some("Successfully joined the community".to_string()),
            error: None,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            group_id: None,
            relay_url: None,
            community: None,
            message: None,
            error: Some(message),
        }
    }
}

