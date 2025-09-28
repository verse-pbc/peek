use geohash::{encode, Coord};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::LocationPoint;
use crate::services::relay::{Location, RelayService};

/// Information about a community
pub struct CommunityMetadata {
    pub geohash: String, // Level 8 geohash for location
}

/// Service for managing community metadata using relay as storage
pub struct CommunityService {
    relay_service: Arc<RelayService>,
}

impl CommunityService {
    pub async fn new(
        relay_url: &str,
        relay_secret_key: &str,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let relay_service =
            RelayService::new(relay_url.to_string(), relay_secret_key.to_string()).await?;

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
            // Get geohash from the metadata
            let geohash = group_meta.geohash?;

            return Some(CommunityMetadata { geohash });
        }

        // Group doesn't exist on relay
        None
    }

    /// Create or get community
    /// Check if group exists but has no geohash (corrupted state)
    async fn group_exists_without_geohash(&self, community_id: &Uuid) -> bool {
        let group_id = format!("peek-{}", community_id);

        if let Ok(group_meta) = self.relay_service.get_group_metadata(&group_id).await {
            // Group exists with members but no geohash - corrupted state
            return group_meta.member_count > 0 && group_meta.geohash.is_none();
        }
        false
    }

    /// Returns (community_metadata, is_new)
    pub async fn get_or_create(
        &self,
        community_id: Uuid,
        _qr_id: String,
        location: LocationPoint,
        creator_pubkey: String,
    ) -> Result<(CommunityMetadata, bool), Box<dyn std::error::Error>> {
        // Check if group exists but has no geohash (corrupted state)
        if self.group_exists_without_geohash(&community_id).await {
            return Err(format!(
                "Community {} exists but has no location geohash - this is a corrupted state that needs manual intervention",
                community_id
            ).into());
        }

        // Check if community already exists and is valid
        if let Some(existing) = self.get(&community_id).await {
            return Ok((existing, false));
        }

        // Create new community on relay
        let _group_id = self
            .relay_service
            .create_group(
                community_id,
                format!("Community {}", &community_id.to_string()[..8]),
                creator_pubkey.clone(),
                Location {
                    latitude: location.latitude,
                    longitude: location.longitude,
                },
            )
            .await?;

        // Calculate geohash for the location
        let geohash = encode(
            Coord {
                x: location.longitude,
                y: location.latitude,
            },
            8,
        )
        .map_err(|e| format!("Failed to encode location: {}", e))?;

        // Return the created community metadata
        let metadata = CommunityMetadata { geohash };

        Ok((metadata, true))
    }
}
