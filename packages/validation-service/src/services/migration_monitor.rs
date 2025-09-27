use anyhow::{anyhow, Result as AnyResult};
use nostr_sdk::prelude::*;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

use super::relay::RelayService;

const MIGRATION_KIND: u16 = 1776;
const MAX_MIGRATION_DEPTH: usize = 10;

/// Service for monitoring and processing identity migrations (NIP-XX/kind 1776)
pub struct MigrationMonitor {
    client: Client,
    relay_service: Arc<RwLock<RelayService>>,
    migration_cache: Arc<RwLock<HashMap<String, String>>>, // old_pubkey -> new_pubkey
}

impl MigrationMonitor {
    pub fn new(client: Client, relay_service: Arc<RwLock<RelayService>>) -> Self {
        Self {
            client,
            relay_service,
            migration_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start monitoring for migration events
    pub async fn start_monitoring(&self) -> AnyResult<()> {
        info!(
            "Starting migration monitor for kind {} events",
            MIGRATION_KIND
        );

        // Subscribe to all migration events
        let filter = Filter::new().kind(Kind::Custom(MIGRATION_KIND)).limit(0); // Get all events

        self.client.subscribe(filter, None).await?;

        info!("Subscribed to migration events (kind {})", MIGRATION_KIND);
        Ok(())
    }

    /// Handle a migration event
    pub async fn handle_migration_event(&self, event: Event) -> AnyResult<()> {
        info!(
            "Processing migration event from {}",
            event.pubkey.to_bech32()?
        );

        // Verify outer event signature first
        event
            .verify()
            .map_err(|e| anyhow!("Invalid migration event signature: {}", e))?;

        let old_pubkey = event.pubkey.to_hex();

        // Validate proof and get the REAL new pubkey from signature
        let new_pubkey = self
            .validate_migration_proof(&event)
            .await?
            .ok_or_else(|| anyhow!("Invalid migration proof"))?;

        // Verify consistency: outer p tag should match proof's signer
        let claimed_new_pubkey = event
            .tags
            .iter()
            .find(|t| matches!(t.kind(), TagKind::SingleLetter(s) if s.character == Alphabet::P))
            .and_then(|t| t.content())
            .ok_or_else(|| anyhow!("Missing p tag in migration event"))?;

        if claimed_new_pubkey != new_pubkey {
            return Err(anyhow!(
                "P tag mismatch: tag claims {} but proof signed by {}",
                claimed_new_pubkey,
                new_pubkey
            ));
        }

        info!(
            "✅ Valid migration verified: {} -> {}",
            old_pubkey, new_pubkey
        );

        // Update cache with verified migration
        {
            let mut cache = self.migration_cache.write().await;
            cache.insert(old_pubkey.clone(), new_pubkey.clone());
        }

        // Update group memberships
        self.update_group_memberships(&old_pubkey, &new_pubkey)
            .await?;

        Ok(())
    }

    /// Validate that the migration proof is correctly signed by both identities
    /// Returns the verified new pubkey if valid, None otherwise
    async fn validate_migration_proof(&self, event: &Event) -> AnyResult<Option<String>> {
        // The content should contain a stringified event signed by the new identity
        if event.content.is_empty() {
            return Ok(None);
        }

        // Parse the proof event from content using nostr_sdk's built-in method
        let proof_event = Event::from_json(&event.content)
            .map_err(|e| anyhow!("Invalid proof event JSON: {}", e))?;

        // Verify the proof event signature
        proof_event
            .verify()
            .map_err(|e| anyhow!("Invalid proof signature: {}", e))?;

        // The NEW pubkey is who signed the proof (verified by signature)
        let new_pubkey = proof_event.pubkey.to_hex();

        // Verify proof is also kind 1776
        if proof_event.kind.as_u16() != MIGRATION_KIND {
            return Ok(None);
        }

        // Verify bidirectional binding: proof's p tag points back to old pubkey
        let proof_points_to_old = proof_event.tags.iter().any(|t| {
            matches!(t.kind(), TagKind::SingleLetter(s) if s.character == Alphabet::P)
                && t.content().map_or(false, |p| p == event.pubkey.to_hex())
        });

        if !proof_points_to_old {
            return Ok(None);
        }

        // Return the VERIFIED new pubkey from signature
        Ok(Some(new_pubkey))
    }

    /// Update all group memberships for a migrated identity
    async fn update_group_memberships(&self, old_pubkey: &str, new_pubkey: &str) -> AnyResult<()> {
        info!(
            "Updating group memberships for migration {} -> {}",
            old_pubkey, new_pubkey
        );

        // Find all groups where old_pubkey is a member
        let groups = self.find_user_groups(old_pubkey).await?;

        if groups.is_empty() {
            info!("No group memberships found for {}", old_pubkey);
            return Ok(());
        }

        info!("Found {} groups to update", groups.len());

        let relay_service = self.relay_service.write().await;

        for group_id in groups {
            info!(
                "Updating group {}: replacing {} with {}",
                group_id, old_pubkey, new_pubkey
            );

            // Add new member first
            match relay_service
                .add_group_member(&group_id, new_pubkey, false)
                .await
            {
                Ok(_) => info!("Added {} to group {}", new_pubkey, group_id),
                Err(e) => error!("Failed to add {} to group {}: {}", new_pubkey, group_id, e),
            }

            // Then remove old member
            match relay_service
                .remove_group_member(&group_id, old_pubkey)
                .await
            {
                Ok(_) => info!("Removed {} from group {}", old_pubkey, group_id),
                Err(e) => error!(
                    "Failed to remove {} from group {}: {}",
                    old_pubkey, group_id, e
                ),
            }
        }

        Ok(())
    }

    /// Find all groups where a user is a member
    async fn find_user_groups(&self, pubkey: &str) -> AnyResult<Vec<String>> {
        // Query for group member events (kind 39002) that include this pubkey
        let filter = Filter::new()
            .kind(Kind::Custom(39002)) // GROUP_MEMBERS kind
            .custom_tag(SingleLetterTag::lowercase(Alphabet::P), pubkey.to_string());

        use std::time::Duration;
        let events = self
            .client
            .fetch_events(filter, Duration::from_secs(5))
            .await?;

        let mut groups = Vec::new();
        for event in events {
            // Extract group ID from d tag
            if let Some(group_id) = event
                .tags
                .iter()
                .find(
                    |t| matches!(t.kind(), TagKind::SingleLetter(s) if s.character == Alphabet::D),
                )
                .and_then(|t| t.content())
            {
                groups.push(group_id.to_string());
            }
        }

        Ok(groups)
    }

    /// Resolve an identity through its migration chain
    pub async fn resolve_identity(&self, pubkey: &str) -> String {
        let cache = self.migration_cache.read().await;
        let mut visited = HashSet::new();
        let mut current = pubkey.to_string();

        for _ in 0..MAX_MIGRATION_DEPTH {
            if visited.contains(&current) {
                // Circular reference detected
                break;
            }
            visited.insert(current.clone());

            if let Some(next) = cache.get(&current) {
                current = next.clone();
            } else {
                break;
            }
        }

        current
    }

    /// Get the latest migration for a pubkey
    pub async fn get_latest_migration(&self, pubkey: &str) -> Option<String> {
        let cache = self.migration_cache.read().await;
        cache.get(pubkey).cloned()
    }
}
