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
    relay_service: Arc<tokio::sync::RwLock<RelayService>>,
}

impl CommunityService {
    pub fn new(relay_service: Arc<tokio::sync::RwLock<RelayService>>) -> Self {
        Self { relay_service }
    }

    /// Get community metadata by ID
    pub async fn get(&self, id: &Uuid) -> Option<CommunityMetadata> {
        tracing::info!("[CommunityService::get] Looking up group for UUID {}", id);

        // Look up the group ID from UUID using NIP-73 i-tag
        let group_id = match self.relay_service.read().await.find_group_by_uuid(id).await {
            Ok(Some(gid)) => gid,
            Ok(None) => {
                tracing::info!("[CommunityService::get] No group found for UUID {}", id);
                return None;
            }
            Err(e) => {
                tracing::error!(
                    "[CommunityService::get] Error looking up group for UUID {}: {}",
                    id,
                    e
                );
                return None;
            }
        };

        tracing::info!(
            "[CommunityService::get] Found group {} for UUID {}, fetching metadata",
            group_id,
            id
        );

        // Try to get NIP-29 group metadata first
        if let Ok(group_meta) = self
            .relay_service
            .read()
            .await
            .get_group_metadata(&group_id)
            .await
        {
            tracing::info!("[CommunityService::get] Retrieved metadata for {}: name='{}', members={}, geohash={:?}, display_geohash={:?}",
                group_id, group_meta.name, group_meta.member_count, group_meta.geohash, group_meta.display_geohash);
            // If group exists and has no members, it's essentially "new" for the first user
            // Return None so the first user becomes admin
            if group_meta.member_count == 0 {
                tracing::info!(
                    "[CommunityService::get] Group {} has 0 members, treating as new",
                    group_id
                );
                return None;
            }

            // Group exists with members, construct metadata
            // Get geohash from the metadata
            if let Some(geohash) = group_meta.geohash {
                tracing::info!(
                    "[CommunityService::get] Group {} has geohash: {}",
                    group_id,
                    geohash
                );
                return Some(CommunityMetadata { geohash });
            } else if let Some(display_geohash) = group_meta.display_geohash {
                // Fallback to display geohash if regular geohash is missing
                tracing::warn!("[CommunityService::get] Group {} missing regular geohash, using display_geohash: {}", group_id, display_geohash);
                // Extract the first 8 characters as a fallback geohash
                let geohash = display_geohash.chars().take(8).collect::<String>();
                return Some(CommunityMetadata { geohash });
            } else {
                tracing::error!(
                    "[CommunityService::get] Group {} exists with {} members but has no geohash!",
                    group_id,
                    group_meta.member_count
                );
                return None;
            }
        } else {
            tracing::info!(
                "[CommunityService::get] Group {} not found on relay",
                group_id
            );
        }

        // Group doesn't exist on relay
        None
    }

    /// Create or get community
    /// Check if group exists but has no geohash (corrupted state)
    async fn group_exists_without_geohash(&self, community_id: &Uuid) -> bool {
        tracing::info!(
            "[group_exists_without_geohash] Looking up group for UUID {}",
            community_id
        );

        // Look up the group ID from UUID
        let group_id = match self
            .relay_service
            .read()
            .await
            .find_group_by_uuid(community_id)
            .await
        {
            Ok(Some(gid)) => gid,
            Ok(None) => {
                tracing::info!(
                    "[group_exists_without_geohash] No group found for UUID {}",
                    community_id
                );
                return false;
            }
            Err(e) => {
                tracing::error!(
                    "[group_exists_without_geohash] Error looking up group: {}",
                    e
                );
                return false;
            }
        };

        tracing::info!(
            "[group_exists_without_geohash] Found group {}, checking metadata",
            group_id
        );

        if let Ok(group_meta) = self
            .relay_service
            .read()
            .await
            .get_group_metadata(&group_id)
            .await
        {
            tracing::info!("[group_exists_without_geohash] Group {} metadata: members={}, geohash={:?}, display_geohash={:?}",
                group_id, group_meta.member_count, group_meta.geohash, group_meta.display_geohash);

            // Group exists with members but no geohash - corrupted state
            let result = group_meta.member_count > 0 && group_meta.geohash.is_none();
            tracing::info!(
                "[group_exists_without_geohash] Group {} exists_without_geohash = {}",
                group_id,
                result
            );
            return result;
        }
        tracing::info!(
            "[group_exists_without_geohash] Group {} not found on relay",
            group_id
        );
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
            .write()
            .await
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
