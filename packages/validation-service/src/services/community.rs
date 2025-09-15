use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::models::LocationPoint;

/// Event kind for storing encrypted community metadata
/// Using a high number to avoid conflicts
const COMMUNITY_METADATA_KIND: u16 = 30078;

/// Information about a community stored in encrypted events
#[derive(Debug, Clone, Serialize, Deserialize)]
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
/// For now, using in-memory storage as a placeholder
pub struct CommunityService {
    /// In-memory cache of communities
    cache: Arc<RwLock<HashMap<Uuid, CommunityMetadata>>>,
    /// Relay URL for future use
    relay_url: String,
    /// Relay secret key for future use
    relay_secret_key: String,
}

impl CommunityService {
    pub async fn new(relay_url: &str, relay_secret_key: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // For now, just store the parameters and use in-memory storage
        // TODO: Implement actual NIP-44 encryption and relay communication
        
        let service = Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            relay_url: relay_url.to_string(),
            relay_secret_key: relay_secret_key.to_string(),
        };
        
        // TODO: Load existing communities from relay
        // service.rebuild_cache_from_relay().await?;
        
        Ok(service)
    }
    
    /// Get community metadata by ID
    pub async fn get(&self, id: &Uuid) -> Option<CommunityMetadata> {
        let cache = self.cache.read().await;
        cache.get(id).cloned()
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
        let mut cache = self.cache.write().await;
        
        if let Some(existing) = cache.get(&community_id) {
            Ok((existing.clone(), false))
        } else {
            // Create NIP-29 group identifier
            let group_id = format!("group-{}", community_id);
            
            // Create metadata
            let metadata = CommunityMetadata {
                community_id,
                qr_id,
                location,
                name: format!("Community {}", &community_id.to_string()[..8]),
                created_at: Utc::now(),
                created_by: creator_pubkey.clone(),
                group_id: group_id.clone(),
            };
            
            // TODO: Store to relay using NIP-44 encryption
            // self.store_to_relay(&metadata).await?;
            
            // TODO: Create actual NIP-29 group on relay
            // self.create_nip29_group(&group_id, &metadata.name, &creator_pubkey).await?;
            
            // Update cache
            cache.insert(community_id, metadata.clone());
            
            Ok((metadata, true))
        }
    }
    
    /// Add a user directly to a NIP-29 group
    pub async fn add_user_to_group(
        &self,
        group_id: &str,
        user_pubkey: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // TODO: Implement actual NIP-29 group member addition
        // For now, just log the action
        tracing::info!(
            "Would add user {} to group {} (not yet implemented)",
            user_pubkey,
            group_id
        );
        
        Ok(())
    }
    
    /// Check if a community exists
    pub async fn exists(&self, id: &Uuid) -> bool {
        let cache = self.cache.read().await;
        cache.contains_key(id)
    }

    /// Get all communities (for debugging)
    pub async fn list(&self) -> Vec<CommunityMetadata> {
        let cache = self.cache.read().await;
        cache.values().cloned().collect()
    }
}