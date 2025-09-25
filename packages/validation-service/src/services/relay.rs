use geohash::{encode, Coord};
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

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
    pub geohash: Option<String>, // Level 8 geohash for location
}

/// Service for managing NIP-29 groups on a Nostr relay
pub struct RelayService {
    client: Client,
    relay_keys: Keys,
}

impl RelayService {
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

        Ok(Self { client, relay_keys })
    }

    /// Create a new NIP-29 group for a community
    pub async fn create_group(
        &self,
        community_id: Uuid,
        name: String,
        creator_pubkey: String,
        location: Location,
    ) -> Result<String> {
        // Generate group ID (h-tag for NIP-29)
        let group_id = format!("peek-{}", community_id);

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
            Tag::custom(TagKind::Custom("open".into()), Vec::<String>::new()), // Open to join with location proof
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

    /// Get the member count for a NIP-29 group
    async fn get_group_member_count(&self, group_id: &str) -> Result<u32> {
        // Fetch kind 39002 (group members list) using d-tag
        // NIP-29 metadata events use d-tag, not h-tag
        let members_filter = Filter::new()
            .kind(Kind::from(39002))
            .identifier(group_id) // This creates a d-tag filter
            .limit(1);

        let members_events = self
            .client
            .fetch_events(members_filter, Duration::from_secs(5))
            .await?;

        if let Some(event) = members_events.first() {
            // Count p-tags which represent members
            let member_count = event.tags.iter()
                .filter(|tag| matches!(tag.kind(), TagKind::SingleLetter(single_letter) if single_letter.character == Alphabet::P))
                .count() as u32;

            tracing::info!("Found {} members in group {}", member_count, group_id);
            Ok(member_count)
        } else {
            tracing::warn!("No member list found for group {}", group_id);
            Ok(0)
        }
    }

    /// Get NIP-29 group metadata from relay
    pub async fn get_group_metadata(&self, group_id: &str) -> Result<GroupMetadata> {
        // Fetch kind 39000 (group metadata) using d-tag
        // NIP-29 metadata events (39000, 39001, 39002) use d-tag for group ID
        let metadata_filter = Filter::new()
            .kind(Kind::from(39000))
            .identifier(group_id) // This creates a d-tag filter
            .limit(1);

        // Debug: Log the filter to see what it generates
        tracing::debug!("Filter JSON: {:?}", serde_json::to_string(&metadata_filter));

        let metadata_events = self
            .client
            .fetch_events(metadata_filter, Duration::from_secs(5))
            .await?;

        if let Some(event) = metadata_events.first() {
            // Parse tags for metadata fields
            let mut name = String::new();
            let mut picture = None;
            let mut about = None;
            let mut is_public = false;
            let mut is_open = false;
            let mut geohash = None;

            for tag in event.tags.iter() {
                if let TagKind::Custom(tag_name) = tag.kind() {
                    match tag_name.as_ref() {
                        "name" => {
                            if let Some(content) = tag.content() {
                                name = content.to_string();
                            }
                        }
                        "picture" => {
                            picture = tag.content().map(|s| s.to_string());
                        }
                        "about" => {
                            about = tag.content().map(|s| s.to_string());
                        }
                        "g" => {
                            // Parse geohash location tag
                            if let Some(content) = tag.content() {
                                // Validate it's a level 8 geohash
                                if content.len() == 8 {
                                    geohash = Some(content.to_string());
                                }
                            }
                        }
                        "public" => is_public = true,
                        "private" => is_public = false,
                        "open" => is_open = true,
                        "closed" => is_open = false,
                        _ => {}
                    }
                }
            }

            // Fetch the member count from kind 39002 (group members list)
            let member_count = self.get_group_member_count(group_id).await.unwrap_or(0);
            let rules = None;

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
            })
        } else {
            Err(RelayError::GroupNotFound(group_id.to_string()))
        }
    }

    /// Load all communities from relay on startup
    pub async fn load_all_communities(&self) -> Result<()> {
        // Create filter for all kind 30078 community metadata events
        let filter = Filter::new()
            .kind(Kind::from(30078))
            .author(self.relay_keys.public_key());

        // Query relay
        let _events = self
            .client
            .fetch_events(filter, Duration::from_secs(10))
            .await?;

        // Communities are now tracked entirely through NIP-29 group metadata
        // No need to load encrypted metadata
        tracing::info!("Communities are now loaded directly from NIP-29 groups");
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
