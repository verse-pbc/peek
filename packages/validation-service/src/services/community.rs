use std::sync::Arc;
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::models::LocationPoint;
use crate::services::relay::{RelayService, CommunityMetadata as RelayMetadata, Location};

/// Information about a community
pub struct CommunityMetadata {
    pub community_id: Uuid,
    pub qr_id: String,  // The QR code identifier
    pub location: LocationPoint,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub created_by: String, // pubkey of first scanner
    pub group_id: String,  // NIP-29 group identifier
}

/// Service for managing community metadata using relay as storage
pub struct CommunityService {
    relay_service: Arc<RelayService>,
}

impl CommunityService {
    pub async fn new(relay_url: &str, relay_secret_key: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let relay_service = RelayService::new(
            relay_url.to_string(),
            relay_secret_key.to_string(),
        ).await?;
        
        // Load existing communities from relay on startup
        relay_service.load_all_communities().await?;
        
        Ok(Self {
            relay_service: Arc::new(relay_service),
        })
    }
    
    /// Get community metadata by ID
    pub async fn get(&self, id: &Uuid) -> Option<CommunityMetadata> {
        // Check if NIP-29 group exists on relay
        let group_id = format!("peek-{}", id);

        // Try to get NIP-29 group metadata first
        if let Ok(group_meta) = self.relay_service.get_group_metadata(&group_id).await {
            // If group exists and has no members, it's essentially "new" for the first user
            // Return None so the first user becomes admin
            if group_meta.member_count == 0 {
                return None;
            }

            // Group exists with members, construct metadata
            // Get location from the metadata location field or try the encrypted storage
            let location = if let Some(loc) = group_meta.location {
                LocationPoint {
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                }
            } else {
                // Fallback: try to get from encrypted NIP-78 storage
                if let Ok(Some(encrypted_meta)) = self.relay_service.get_community_metadata(*id).await {
                    LocationPoint {
                        latitude: encrypted_meta.location.latitude,
                        longitude: encrypted_meta.location.longitude,
                    }
                } else {
                    // Last resort: parse from about field for backward compatibility
                    LocationPoint {
                        latitude: group_meta.about.as_ref()
                            .and_then(|about| {
                                if about.starts_with("Location-based community at ") {
                                    let coords = about.trim_start_matches("Location-based community at ");
                                    coords.split(", ").next()?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(0.0),
                        longitude: group_meta.about.as_ref()
                            .and_then(|about| {
                                if about.starts_with("Location-based community at ") {
                                    let coords = about.trim_start_matches("Location-based community at ");
                                    coords.split(", ").nth(1)?.parse::<f64>().ok()
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(0.0),
                    }
                }
            };

            return Some(CommunityMetadata {
                community_id: *id,
                qr_id: id.to_string(),
                location,
                name: group_meta.name,
                created_at: DateTime::from_timestamp(group_meta.created_at.as_u64() as i64, 0)
                    .unwrap_or_else(|| Utc::now()),
                created_by: String::new(), // We don't know the creator from NIP-29 metadata
                group_id,
            });
        }

        // Group doesn't exist on relay
        None
    }
    
    /// Create or get community
    /// Returns (community_metadata, is_new)
    pub async fn get_or_create(
        &self,
        community_id: Uuid,
        qr_id: String,
        location: LocationPoint,
        creator_pubkey: String,
    ) -> Result<(CommunityMetadata, bool), Box<dyn std::error::Error>> {
        // Check if community already exists
        if let Some(existing) = self.get(&community_id).await {
            return Ok((existing, false));
        }
        
        // Create new community on relay
        let group_id = self.relay_service.create_group(
            community_id,
            format!("Community {}", &community_id.to_string()[..8]),
            creator_pubkey.clone(),
            Location {
                latitude: location.latitude,
                longitude: location.longitude,
            },
        ).await?;
        
        // Return the created community metadata
        let metadata = CommunityMetadata {
            community_id,
            qr_id,
            location,
            name: format!("Community {}", &community_id.to_string()[..8]),
            created_at: Utc::now(),
            created_by: creator_pubkey,
            group_id,
        };
        
        Ok((metadata, true))
    }
    
    /// Add a user directly to a NIP-29 group
    pub async fn add_user_to_group(
        &self,
        group_id: &str,
        user_pubkey: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.relay_service.add_group_member(
            group_id,
            user_pubkey,
            false, // Regular member, not admin
        ).await
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }
    
    /// Check if a community exists
    pub async fn exists(&self, id: &Uuid) -> bool {
        self.relay_service.community_exists(*id).await
            .unwrap_or(false)
    }

    /// Get all communities (for debugging)
    pub async fn list(&self) -> Vec<CommunityMetadata> {
        // Note: This would need to be implemented in RelayService
        // For now, return empty list
        vec![]
    }
}