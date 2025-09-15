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
        self.relay_service.get_community_metadata(*id).await.ok()
            .flatten()
            .map(|relay_meta| CommunityMetadata {
                community_id: relay_meta.id,
                qr_id: relay_meta.id.to_string(), // Using ID as QR ID for now
                location: LocationPoint {
                    latitude: relay_meta.location.latitude,
                    longitude: relay_meta.location.longitude,
                },
                name: relay_meta.name,
                created_at: DateTime::from_timestamp(relay_meta.created_at.as_u64() as i64, 0)
                    .unwrap_or_else(|| Utc::now()),
                created_by: relay_meta.creator_pubkey,
                group_id: format!("peek-{}", relay_meta.id),
            })
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