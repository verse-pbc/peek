use geohash::{encode, Coord};
use nostr_sdk::prelude::*;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

use crate::libraries::display_location::generate_display_location;

/// Generate a random group identifier for NIP-29 h-tag
/// Format: peek-{10 random alphanumeric chars}
fn generate_random_group_id() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    let id: String = (0..10)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect();
    format!("peek-{}", id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub latitude: f64,
    pub longitude: f64,
}

/// NIP-29 Group metadata fetched from relay
#[derive(Debug, Clone)]
pub struct GroupMetadata {
    pub name: String,
    pub picture: Option<String>,
    pub about: Option<String>,
    pub rules: Option<Vec<String>>,
    pub member_count: u32,
    pub is_public: bool,
    pub is_open: bool,
    pub created_at: Timestamp,
    pub geohash: Option<String>, // Level 8 geohash for actual location
    #[allow(dead_code)]
    pub display_geohash: Option<String>, // Level 9 geohash for display location
}

/// Service for managing NIP-29 groups on a Nostr relay
pub struct RelayService {
    client: Client,
    relay_keys: Keys,
    uuid_to_group_cache:
        std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<Uuid, String>>>,
}

impl RelayService {
    /// Get a reference to the authenticated client
    pub fn client(&self) -> &Client {
        &self.client
    }

    pub async fn new(relay_url: String, relay_secret_key: String) -> Result<Self> {
        // Parse the relay's secret key
        let secret_key = SecretKey::from_bech32(&relay_secret_key)
            .or_else(|_| SecretKey::from_hex(&relay_secret_key))?;
        let relay_keys = Keys::new(secret_key);

        // Create client with relay's keys
        // Note: nostr-sdk has automatic authentication enabled by default
        let client = Client::new(relay_keys.clone());

        // Add and connect to relay
        tracing::info!("Connecting to relay: {}", relay_url);
        client.add_relay(&relay_url).await?;
        client.connect().await;

        // Wait a moment for connection to establish
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Ensure automatic authentication is enabled for private groups
        tracing::info!("Enabling automatic authentication...");
        client.automatic_authentication(true);

        // Wait additional time for authentication to complete
        tokio::time::sleep(Duration::from_millis(1000)).await;

        // Verify connection
        let relay = client.relay(&relay_url).await?;
        if relay.is_connected() {
            tracing::info!(
                "✅ Successfully connected and authenticated to relay: {}",
                relay_url
            );
        } else {
            tracing::warn!("⚠️ Relay connection might not be fully established");
        }

        Ok(Self {
            client,
            relay_keys,
            uuid_to_group_cache: std::sync::Arc::new(tokio::sync::RwLock::new(
                std::collections::HashMap::new(),
            )),
        })
    }

    /// Create a new NIP-29 group for a community
    pub async fn create_group(
        &self,
        community_id: Uuid,
        name: String,
        creator_pubkey: String,
        location: Location,
    ) -> Result<String> {
        // Generate random group ID (h-tag for NIP-29)
        // UUID is stored separately in i-tag per NIP-73
        let group_id = generate_random_group_id();

        // Check if group already exists by trying to fetch its metadata
        // This avoids the 10-second timeout when relay returns "Group already exists"
        if let Ok(_metadata) = self.get_group_metadata(&group_id).await {
            tracing::info!("Group {} already exists, skipping creation", group_id);
            // Group already exists, just add the creator as a member
            self.add_group_member(&group_id, &creator_pubkey, false)
                .await?;

            // Just add creator as member, location is already in group metadata

            return Ok(group_id);
        }

        // Parse creator's public key
        let creator_pk = PublicKey::from_bech32(&creator_pubkey)
            .or_else(|_| PublicKey::from_hex(&creator_pubkey))?;

        // Step 1: Create NIP-29 group creation event (kind 9007)
        let group_creation = EventBuilder::new(
            Kind::from(9007),
            "", // Empty content per NIP-29
        )
        .tags([Tag::custom(TagKind::Custom("h".into()), [group_id.clone()])]);

        // Send the group creation event with a shorter timeout
        let start = std::time::Instant::now();
        tracing::info!("⏱️ Signing group creation event...");
        let event = self.client.sign_event_builder(group_creation).await?;
        tracing::info!("⏱️ Signed in {:?}ms", start.elapsed().as_millis());

        let send_start = std::time::Instant::now();
        tracing::info!("⏱️ Sending kind 9007 (group creation)...");

        // Try to send the event but handle timeout/error gracefully
        match tokio::time::timeout(
            Duration::from_secs(2), // 2 second timeout instead of 10
            self.client.send_event(&event),
        )
        .await
        {
            Ok(Ok(_output)) => {
                tracing::info!(
                    "⏱️ Kind 9007 sent successfully in {:?}ms",
                    send_start.elapsed().as_millis()
                );
            }
            Ok(Err(e)) => {
                tracing::warn!(
                    "⏱️ Kind 9007 send failed after {:?}ms: {}",
                    send_start.elapsed().as_millis(),
                    e
                );
                // Continue anyway - the group might have been created
            }
            Err(_) => {
                tracing::warn!("⏱️ Kind 9007 send timed out after 2 seconds");
                // Continue anyway - the group might have been created
            }
        }
        tracing::info!(
            "⏱️ Kind 9007 processing took {:?}ms total",
            send_start.elapsed().as_millis()
        );

        // Step 2: Add creator as admin (kind 9000 with admin role)
        // Per NIP-29, roles are added as additional values in the p tag
        let add_admin = EventBuilder::new(
            Kind::from(9000), // put-user event
            "",               // Empty content per NIP-29
        )
        .tags([
            Tag::custom(TagKind::Custom("h".into()), [group_id.clone()]),
            Tag::custom(
                TagKind::Custom("p".into()),
                [creator_pk.to_string(), "admin".to_string()],
            ),
        ]);

        let admin_start = std::time::Instant::now();
        tracing::info!("⏱️ Signing add admin event...");
        let event = self.client.sign_event_builder(add_admin).await?;
        tracing::info!("⏱️ Signed in {:?}ms", admin_start.elapsed().as_millis());

        let send_start = std::time::Instant::now();
        tracing::info!("⏱️ Sending kind 9000 (put-user with admin role)...");

        // Send with timeout
        match tokio::time::timeout(Duration::from_secs(2), self.client.send_event(&event)).await {
            Ok(Ok(_)) => {
                tracing::info!(
                    "⏱️ Kind 9000 sent successfully in {:?}ms",
                    send_start.elapsed().as_millis()
                );
            }
            Ok(Err(e)) => {
                tracing::warn!("⏱️ Kind 9000 send failed: {}", e);
            }
            Err(_) => {
                tracing::warn!("⏱️ Kind 9000 send timed out after 2 seconds");
            }
        }

        // Step 3: Remove relay key from admin (kind 9001)
        // The relay key automatically becomes admin when creating the group,
        // but we want the creator to be the sole admin
        let remove_relay = EventBuilder::new(
            Kind::from(9001), // remove-user event
            "",               // Empty content per NIP-29
        )
        .allow_self_tagging() // Allow removing ourselves from the group
        .tags([
            Tag::custom(TagKind::Custom("h".into()), [group_id.clone()]),
            Tag::custom(
                TagKind::Custom("p".into()),
                [self.relay_keys.public_key().to_string()],
            ),
        ]);

        let remove_start = std::time::Instant::now();
        tracing::info!("⏱️ Removing relay key from group admins...");
        let event = self.client.sign_event_builder(remove_relay).await?;

        match tokio::time::timeout(Duration::from_secs(2), self.client.send_event(&event)).await {
            Ok(Ok(_)) => {
                tracing::info!(
                    "⏱️ Kind 9001 sent successfully in {:?}ms",
                    remove_start.elapsed().as_millis()
                );
            }
            Ok(Err(e)) => {
                tracing::warn!("⏱️ Kind 9001 send failed: {}", e);
            }
            Err(_) => {
                tracing::warn!("⏱️ Kind 9001 send timed out after 2 seconds");
            }
        }

        // Step 4: Add creator as first member (kind 9000)
        let member_start = std::time::Instant::now();
        tracing::info!("⏱️ Adding creator as member...");
        self.add_group_member(&group_id, &creator_pubkey, true)
            .await?;
        tracing::info!(
            "⏱️ Added member in {:?}ms",
            member_start.elapsed().as_millis()
        );

        // Step 5: Set group metadata with location (kind 9002)
        // Generate the display geohash for the discovery map
        let display_geohash = generate_display_location(location.latitude, location.longitude)
            .map_err(|e| {
                RelayError::Other(format!("Failed to generate display location: {}", e))
            })?;

        let metadata_event = EventBuilder::new(
            Kind::from(9002),
            "", // Empty content per NIP-29
        )
        .tags([
            Tag::custom(TagKind::Custom("h".into()), [group_id.clone()]),
            Tag::custom(TagKind::Custom("name".into()), [name.clone()]),
            Tag::custom(
                TagKind::Custom("about".into()),
                ["Location-based community".to_string()],
            ),
            Tag::custom(TagKind::Custom("picture".into()), [String::new()]), // Empty for now
            Tag::custom(TagKind::Custom("private".into()), Vec::<String>::new()), // Private group
            Tag::custom(TagKind::Custom("closed".into()), Vec::<String>::new()), // Closed - requires location validation
            // Store location as geohash for privacy and efficient matching
            Tag::custom(
                TagKind::Custom("g".into()),
                [encode(
                    Coord {
                        x: location.longitude,
                        y: location.latitude,
                    },
                    8,
                )
                .map_err(|e| RelayError::Other(format!("Failed to encode location: {}", e)))?],
            ),
            // Store display location as 9-character geohash for public discovery
            Tag::custom(TagKind::Custom("dg".into()), [display_geohash.clone()]),
            // Store UUID as i-tag per NIP-73 for efficient UUID-based lookups
            Tag::custom(
                TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::I)),
                [format!("peek:uuid:{}", community_id)],
            ),
        ]);

        let metadata_start = std::time::Instant::now();
        tracing::info!("⏱️ Setting group metadata with location...");
        let event = self.client.sign_event_builder(metadata_event).await?;

        match tokio::time::timeout(Duration::from_secs(2), self.client.send_event(&event)).await {
            Ok(Ok(_)) => {
                tracing::info!(
                    "⏱️ Kind 9002 (metadata) sent successfully in {:?}ms",
                    metadata_start.elapsed().as_millis()
                );
            }
            Ok(Err(e)) => {
                tracing::warn!("⏱️ Kind 9002 send failed: {}", e);
            }
            Err(_) => {
                tracing::warn!("⏱️ Kind 9002 send timed out after 2 seconds");
            }
        }

        // Location is now stored in the NIP-29 group metadata, no need for separate storage

        // Cache the UUID → h-tag mapping for immediate lookups
        self.uuid_to_group_cache
            .write()
            .await
            .insert(community_id, group_id.clone());
        tracing::info!("Cached UUID {} → group {}", community_id, group_id);

        // Publish updated discovery map with new community's display geohash
        if let Err(e) = self.publish_discovery_map(Some(display_geohash)).await {
            tracing::warn!(
                "Failed to publish discovery map after creating group: {}",
                e
            );
            // Don't fail the group creation if discovery map publishing fails
        }

        Ok(group_id)
    }

    /// Add a user to a group (wrapper for add_group_member)
    pub async fn add_user_to_group(
        &self,
        group_id: &str,
        user_pubkey: &str,
        is_admin: bool,
    ) -> Result<()> {
        self.add_group_member(group_id, user_pubkey, is_admin).await
    }

    /// Add a member to a NIP-29 group
    pub async fn add_group_member(
        &self,
        group_id: &str,
        user_pubkey: &str,
        is_admin: bool,
    ) -> Result<()> {
        // Parse user's public key
        let pubkey =
            PublicKey::from_bech32(user_pubkey).or_else(|_| PublicKey::from_hex(user_pubkey))?;

        // Create NIP-29 add user event (kind 9000)
        // Per NIP-29, roles are added as additional values in the p tag
        let role = if is_admin { "admin" } else { "member" };

        let add_user = EventBuilder::new(
            Kind::from(9000),
            "", // Empty content per NIP-29
        )
        .tags([
            Tag::custom(TagKind::Custom("h".into()), [group_id.to_string()]),
            Tag::custom(
                TagKind::Custom("p".into()),
                [pubkey.to_string(), role.to_string()],
            ),
        ]);

        let event = self.client.sign_event_builder(add_user).await?;

        // Send the event and check for duplicate member error
        match self.client.send_event(&event).await {
            Ok(_) => {
                tracing::info!(
                    "Successfully added user {} to group {}",
                    pubkey.to_string(),
                    group_id
                );
                Ok(())
            }
            Err(e) => {
                let error_msg = e.to_string();
                // Check if this is a duplicate member error (per NIP-29)
                if error_msg.contains("duplicate:") || error_msg.contains("already a member") {
                    tracing::info!(
                        "User {} is already a member of group {} (relay returned: {})",
                        pubkey.to_string(),
                        group_id,
                        error_msg
                    );
                    // This is not an error - user is already a member
                    Ok(())
                } else {
                    // Real error
                    Err(e.into())
                }
            }
        }
    }

    /// Remove a member from a NIP-29 group
    pub async fn remove_group_member(&self, group_id: &str, user_pubkey: &str) -> Result<()> {
        // Parse user's public key
        let pubkey =
            PublicKey::from_bech32(user_pubkey).or_else(|_| PublicKey::from_hex(user_pubkey))?;

        // Create NIP-29 remove user event (kind 9001)
        let remove_user = EventBuilder::new(
            Kind::from(9001), // NIP-29 remove-user event
            "",               // Empty content per NIP-29
        )
        .tags([
            Tag::custom(TagKind::Custom("h".into()), [group_id.to_string()]),
            Tag::custom(TagKind::Custom("p".into()), [pubkey.to_string()]),
        ]);

        let event = self.client.sign_event_builder(remove_user).await?;

        // Send the event
        self.client.send_event(&event).await?;

        tracing::info!(
            "Successfully removed user {} from group {}",
            pubkey.to_string(),
            group_id
        );
        Ok(())
    }

    /// Get the member count for a NIP-29 group
    pub async fn get_group_member_count(&self, group_id: &str) -> Result<u32> {
        // Fetch kind 39002 (group members) event using d-tag
        // This is the relay-generated list of all group members
        let members_filter = Filter::new()
            .kind(Kind::from(39002))
            .identifier(group_id)
            .limit(1);

        let members_events = self
            .client
            .fetch_events(members_filter, Duration::from_secs(5))
            .await?;

        // Get the first (and should be only) kind 39002 event
        if let Some(event) = members_events.into_iter().next() {
            // Count p-tags in the kind 39002 event
            let mut member_count = 0u32;
            for tag in event.tags.iter() {
                if let TagKind::SingleLetter(single_letter) = tag.kind() {
                    if single_letter.character == Alphabet::P {
                        member_count += 1;
                    }
                }
            }

            tracing::info!(
                "Found {} members in group {} from kind 39002",
                member_count,
                group_id
            );
            return Ok(member_count);
        }

        // No kind 39002 event found
        tracing::info!(
            "No kind 39002 event found for group {}, returning 0 members",
            group_id
        );
        Ok(0)
    }

    /// Get NIP-29 group metadata from relay
    pub async fn get_group_metadata(&self, group_id: &str) -> Result<GroupMetadata> {
        tracing::info!(
            "[get_group_metadata] Fetching metadata for group: {}",
            group_id
        );

        // Fetch kind 39000 (group metadata) events using d-tag
        // These are relay-generated events that contain the group metadata
        let metadata_filter = Filter::new()
            .kind(Kind::from(39000))
            .identifier(group_id)
            .limit(1);

        // Debug: Log the filter to see what it generates
        tracing::debug!("Filter JSON: {:?}", serde_json::to_string(&metadata_filter));

        let metadata_events = self
            .client
            .fetch_events(metadata_filter, Duration::from_secs(5))
            .await?;

        tracing::info!(
            "[get_group_metadata] Found {} events for group {}",
            metadata_events.len(),
            group_id
        );

        if let Some(event) = metadata_events.first() {
            tracing::info!("[get_group_metadata] Raw kind 39000 event for {}: id={}, created_at={}, tags count={}",
                group_id, event.id, event.created_at, event.tags.len());
            tracing::debug!("[get_group_metadata] Full event: {:?}", event);
            // Parse tags for metadata fields
            let mut name = String::new();
            let mut picture = None;
            let mut about = None;
            let mut is_public = false;
            let mut is_open = false;
            let mut geohash = None;
            let mut display_geohash = None;

            for tag in event.tags.iter() {
                tracing::debug!(
                    "[get_group_metadata] Processing tag: {:?}, kind: {:?}",
                    tag,
                    tag.kind()
                );

                // Handle each tag based on its kind
                match tag.kind() {
                    // Handle single-letter tags (like "g")
                    TagKind::SingleLetter(single_letter) => {
                        if single_letter.character == Alphabet::G {
                            // Parse geohash location tag
                            if let Some(content) = tag.content() {
                                tracing::info!("[get_group_metadata] Found 'g' tag (SingleLetter) with content: '{}' (len={})", content, content.len());
                                // Validate it's a level 8 geohash
                                if content.len() == 8 {
                                    geohash = Some(content.to_string());
                                    tracing::info!(
                                        "[get_group_metadata] Set geohash to: {:?}",
                                        geohash
                                    );
                                } else {
                                    tracing::warn!("[get_group_metadata] Geohash '{}' has invalid length {} (expected 8)", content, content.len());
                                }
                            } else {
                                tracing::warn!("[get_group_metadata] 'g' tag has no content");
                            }
                        }
                    }
                    // Handle the special "name" tag kind
                    TagKind::Name => {
                        if let Some(content) = tag.content() {
                            name = content.to_string();
                            tracing::info!("[get_group_metadata] Found name tag: '{}'", name);
                        }
                    }
                    // Handle custom tags (like "dg", "about", "picture", etc.)
                    TagKind::Custom(tag_name) => {
                        match tag_name.as_ref() {
                            "about" => {
                                about = tag.content().map(|s| s.to_string());
                            }
                            "picture" => {
                                picture = tag.content().map(|s| s.to_string());
                            }
                            "dg" => {
                                // Parse display geohash location tag
                                if let Some(content) = tag.content() {
                                    tracing::info!("[get_group_metadata] Found 'dg' tag with content: '{}' (len={})", content, content.len());
                                    // Validate it's a level 9 geohash
                                    if content.len() == 9 {
                                        display_geohash = Some(content.to_string());
                                        tracing::info!(
                                            "[get_group_metadata] Set display_geohash to: {:?}",
                                            display_geohash
                                        );
                                    } else {
                                        tracing::warn!("[get_group_metadata] Display geohash '{}' has invalid length {} (expected 9)", content, content.len());
                                    }
                                } else {
                                    tracing::warn!("[get_group_metadata] 'dg' tag has no content");
                                }
                            }
                            "public" => is_public = true,
                            "private" => is_public = false,
                            "open" => is_open = true,
                            "closed" => is_open = false,
                            _ => {}
                        }
                    }
                    _ => {
                        // Other tag kinds we don't need to handle
                    }
                }
            }

            // Fetch the member count from kind 39002 (group members list)
            let member_count = self.get_group_member_count(group_id).await.unwrap_or(0);
            let rules = None;

            tracing::info!("[get_group_metadata] Final metadata for {}: name='{}', members={}, geohash={:?}, display_geohash={:?}",
                group_id, name, member_count, geohash, display_geohash);

            Ok(GroupMetadata {
                name,
                picture,
                about,
                rules,
                member_count,
                is_public,
                is_open,
                created_at: event.created_at,
                geohash,
                display_geohash,
            })
        } else {
            tracing::warn!(
                "[get_group_metadata] No kind 39000 event found for group {}",
                group_id
            );
            Err(RelayError::GroupNotFound(group_id.to_string()))
        }
    }

    /// Find a group's h-tag by its UUID using NIP-73 i-tag
    /// Returns the group_id (h-tag) if found, None otherwise
    pub async fn find_group_by_uuid(&self, uuid: &Uuid) -> Result<Option<String>> {
        tracing::info!("[find_group_by_uuid] Looking up group for UUID: {}", uuid);

        // Check cache first
        if let Some(group_id) = self.uuid_to_group_cache.read().await.get(uuid) {
            tracing::info!(
                "[find_group_by_uuid] Found cached mapping {} → {}",
                uuid,
                group_id
            );
            return Ok(Some(group_id.clone()));
        }

        // Query for kind 39000 (group metadata) with i-tag containing the UUID
        let filter = Filter::new()
            .kind(Kind::from(39000))
            .custom_tag(
                SingleLetterTag::lowercase(Alphabet::I),
                format!("peek:uuid:{}", uuid),
            )
            .limit(1);

        let events = self
            .client
            .fetch_events(filter, Duration::from_secs(5))
            .await?;

        if let Some(event) = events.first() {
            // Extract the d-tag (identifier) which contains the group h-tag
            if let Some(group_id) = event.tags.identifier() {
                let group_id_string = group_id.to_string();
                tracing::info!(
                    "[find_group_by_uuid] Found group {} for UUID {}",
                    group_id_string,
                    uuid
                );
                // Cache for future lookups
                self.uuid_to_group_cache
                    .write()
                    .await
                    .insert(*uuid, group_id_string.clone());
                return Ok(Some(group_id_string));
            }

            tracing::warn!(
                "[find_group_by_uuid] Found event but no d-tag for UUID {}",
                uuid
            );
            Ok(None)
        } else {
            tracing::info!("[find_group_by_uuid] No group found for UUID {}", uuid);
            Ok(None)
        }
    }

    /// Publish a NIP-78 discovery map event with all communities' display locations
    /// If current_display_geohash is provided, it will be included in the map
    pub async fn publish_discovery_map(
        &self,
        current_display_geohash: Option<String>,
    ) -> Result<()> {
        tracing::info!("Publishing discovery map...");

        // Fetch all kind 39000 (group metadata) events created by this relay
        let filter = Filter::new()
            .kind(Kind::from(39000))
            .author(self.relay_keys.public_key())
            .limit(1000); // Safety limit

        let events = self
            .client
            .fetch_events(filter, Duration::from_secs(5))
            .await?;

        let mut geohashes = Vec::new();

        // Add the current group's display geohash if provided
        if let Some(dg) = current_display_geohash {
            if dg.len() == 9 {
                geohashes.push(dg);
            }
        }

        for event in events {
            let mut display_geohash = None;

            for tag in event.tags.iter() {
                if let TagKind::Custom(tag_name) = tag.kind() {
                    if tag_name.as_ref() == "dg" {
                        // Display geohash (9 characters)
                        if let Some(content) = tag.content() {
                            if content.len() == 9 {
                                display_geohash = Some(content.to_string());
                                break; // Found dg, no need to check more tags
                            }
                        }
                    }
                }
            }

            // Add any valid display geohash found
            if let Some(dg_hash) = display_geohash {
                if !geohashes.contains(&dg_hash) {
                    geohashes.push(dg_hash);
                }
            }
        }

        // Create NIP-78 event with discovery map containing only geohashes
        let content = serde_json::json!({
            "geohashes": geohashes,
            "updated_at": Timestamp::now().as_u64(),
        })
        .to_string();

        let event = EventBuilder::new(Kind::from(30078), content).tags([Tag::custom(
            TagKind::Custom("d".into()),
            ["peek.discovery-map"],
        )]);

        // Sign and publish
        let signed_event = self.client.sign_event_builder(event).await?;
        self.client.send_event(&signed_event).await?;

        tracing::info!("Published discovery map with {} geohashes", geohashes.len());
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RelayError {
    #[error("Nostr SDK error: {0}")]
    NostrSdk(#[from] nostr_sdk::client::Error),

    #[error("Key error: {0}")]
    Key(#[from] nostr_sdk::key::Error),

    #[error("NIP-44 encryption error: {0}")]
    Nip44(#[from] nip44::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Group not found: {0}")]
    GroupNotFound(String),

    #[error("{0}")]
    Other(String),
}

type Result<T> = std::result::Result<T, RelayError>;
