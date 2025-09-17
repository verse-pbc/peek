use std::sync::Arc;
use tokio::sync::RwLock;
use nostr_sdk::prelude::*;
use nostr_sdk::nips::nip44;
use std::time::Duration;
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Metadata stored on relay using NIP-44 encryption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityMetadata {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub location: Location,
    pub created_at: Timestamp,
    pub creator_pubkey: String,
    pub member_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub latitude: f64,
    pub longitude: f64,
}

/// Service for managing NIP-29 groups on a Nostr relay
pub struct RelayService {
    client: Client,
    relay_url: String,
    relay_keys: Keys,
    // Cache of community metadata fetched from relay
    metadata_cache: Arc<RwLock<HashMap<Uuid, CommunityMetadata>>>,
}

impl RelayService {
    pub async fn new(relay_url: String, relay_secret_key: String) -> Result<Self> {
        // Parse the relay's secret key
        let secret_key = SecretKey::from_bech32(&relay_secret_key)
            .or_else(|_| SecretKey::from_hex(&relay_secret_key))?;
        let relay_keys = Keys::new(secret_key);
        
        // Create client with relay's keys
        let client = Client::new(relay_keys.clone());
        
        // Connect to relay
        client.add_relay(&relay_url).await?;
        client.connect().await;
        
        Ok(Self {
            client,
            relay_url,
            relay_keys,
            metadata_cache: Arc::new(RwLock::new(HashMap::new())),
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
        // Generate group ID (h-tag for NIP-29)
        let group_id = format!("peek-{}", community_id);

        // Parse creator's public key
        let creator_pk = PublicKey::from_bech32(&creator_pubkey)
            .or_else(|_| PublicKey::from_hex(&creator_pubkey))?;

        // Step 1: Create NIP-29 group creation event (kind 9007)
        let group_creation = EventBuilder::new(
            Kind::from(9007),
            "",  // Empty content per NIP-29
        )
        .tags([
            Tag::custom(TagKind::Custom("h".into()), [group_id.clone()]),
        ]);

        let event = self.client.sign_event_builder(group_creation).await?;
        self.client.send_event(&event).await?;

        // Step 2: Create group metadata event (kind 39000)
        let group_metadata = EventBuilder::new(
            Kind::from(39000),
            "",  // Empty content
        )
        .tags([
            Tag::custom(TagKind::Custom("d".into()), [group_id.clone()]),
            Tag::custom(TagKind::Custom("name".into()), [name.clone()]),
            Tag::custom(TagKind::Custom("about".into()),
                [format!("Location-based community at {:.4}, {:.4}",
                    location.latitude, location.longitude)]),
            Tag::custom(TagKind::Custom("picture".into()), [String::new()]),
            Tag::custom(TagKind::Custom("public".into()), Vec::<String>::new()),  // Public group
            Tag::custom(TagKind::Custom("open".into()), Vec::<String>::new()),    // Open to join
        ]);

        let event = self.client.sign_event_builder(group_metadata).await?;
        self.client.send_event(&event).await?;

        // Step 3: Create group admins event (kind 39001) with creator as admin
        let group_admins = EventBuilder::new(
            Kind::from(39001),
            format!("Admin list for group {}", name),
        )
        .tags([
            Tag::custom(TagKind::Custom("d".into()), [group_id.clone()]),
            Tag::custom(TagKind::Custom("p".into()),
                [creator_pk.to_hex(), "admin".to_string()]),
        ]);

        let event = self.client.sign_event_builder(group_admins).await?;
        self.client.send_event(&event).await?;

        // Step 4: Add creator as first member (kind 9000)
        self.add_group_member(&group_id, &creator_pubkey, true).await?;

        // Store metadata for caching
        let metadata = CommunityMetadata {
            id: community_id,
            name: name.clone(),
            description: Some(format!("Location-based community at {:.4}, {:.4}",
                location.latitude, location.longitude)),
            location,
            created_at: Timestamp::now(),
            creator_pubkey: creator_pubkey.clone(),
            member_count: 1,
        };

        // Store encrypted metadata
        self.store_encrypted_metadata(&group_id, &metadata).await?;

        // Cache the metadata
        self.metadata_cache.write().await.insert(community_id, metadata);

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
        _is_admin: bool,  // Not used here, admin is set during group creation
    ) -> Result<()> {
        // Parse user's public key
        let pubkey = PublicKey::from_bech32(user_pubkey)
            .or_else(|_| PublicKey::from_hex(user_pubkey))?;

        // Create NIP-29 add user event (kind 9000)
        let add_user = EventBuilder::new(
            Kind::from(9000),
            format!("Added user to group"),
        )
        .tags([
            Tag::public_key(pubkey),
            Tag::custom(TagKind::Custom("h".into()), [group_id.to_string()]),
        ]);

        let event = self.client.sign_event_builder(add_user).await?;
        self.client.send_event(&event).await?;

        // Update member count in metadata
        if let Some(community_id) = group_id.strip_prefix("peek-")
            .and_then(|id| Uuid::parse_str(id).ok()) {
            if let Some(mut metadata) = self.metadata_cache.write().await.get_mut(&community_id) {
                metadata.member_count += 1;
                // Update on relay
                self.store_encrypted_metadata(group_id, &metadata).await?;
            }
        }

        Ok(())
    }
    
    /// Store encrypted community metadata on relay
    async fn store_encrypted_metadata(
        &self,
        group_id: &str,
        metadata: &CommunityMetadata,
    ) -> Result<()> {
        // Serialize metadata to JSON
        let metadata_json = serde_json::to_string(metadata)?;
        
        // Encrypt using NIP-44 with relay's own key (self-encryption for storage)
        let encrypted = nip44::encrypt(
            self.relay_keys.secret_key(),
            &self.relay_keys.public_key(),
            &metadata_json,
            nip44::Version::V2,
        )?;
        
        // Create kind 30078 event for replaceable encrypted storage
        let storage_event = EventBuilder::new(
            Kind::from(30078),
            encrypted,
        )
        .tags([
            Tag::custom(TagKind::Custom("d".into()), [group_id.to_string()]),
            Tag::custom(TagKind::Custom("type".into()), ["community-metadata".to_string()]),
        ]);
        
        let event = self.client.sign_event_builder(storage_event).await?;
        self.client.send_event(&event).await?;
        
        Ok(())
    }
    
    /// Fetch community metadata from relay
    pub async fn get_community_metadata(&self, community_id: Uuid) -> Result<Option<CommunityMetadata>> {
        // Check cache first
        if let Some(metadata) = self.metadata_cache.read().await.get(&community_id) {
            return Ok(Some(metadata.clone()));
        }
        
        let group_id = format!("peek-{}", community_id);
        
        // Create filter for kind 30078 with our d-tag
        let filter = Filter::new()
            .kind(Kind::from(30078))
            .custom_tag(
                SingleLetterTag::lowercase(Alphabet::D),
                group_id.clone()
            )
            .author(self.relay_keys.public_key());
        
        // Query relay
        let events = self.client.fetch_events(
            filter,
            Duration::from_secs(10),
        ).await?;
        
        if let Some(event) = events.first() {
            // Decrypt content
            let decrypted = nip44::decrypt(
                self.relay_keys.secret_key(),
                &self.relay_keys.public_key(),
                &event.content,
            )?;
            
            // Parse metadata
            let metadata: CommunityMetadata = serde_json::from_str(&decrypted)?;
            
            // Update cache
            self.metadata_cache.write().await.insert(community_id, metadata.clone());
            
            return Ok(Some(metadata));
        }
        
        Ok(None)
    }
    
    /// Check if a community exists
    pub async fn community_exists(&self, community_id: Uuid) -> Result<bool> {
        Ok(self.get_community_metadata(community_id).await?.is_some())
    }
    
    /// Load all communities from relay on startup
    pub async fn load_all_communities(&self) -> Result<()> {
        // Create filter for all kind 30078 community metadata events
        let filter = Filter::new()
            .kind(Kind::from(30078))
            .author(self.relay_keys.public_key());
        
        // Query relay
        let events = self.client.fetch_events(
            filter,
            Duration::from_secs(10),
        ).await?;
        
        let mut cache = self.metadata_cache.write().await;
        
        for event in events {
            // Get group_id from d-tag
            if let Some(group_id) = event.tags.iter()
                .find(|t| matches!(t.kind(), TagKind::Custom(name) if name == "d"))
                .and_then(|t| t.content())
            {
                // Decrypt content
                if let Ok(decrypted) = nip44::decrypt(
                    self.relay_keys.secret_key(),
                    &self.relay_keys.public_key(),
                    &event.content,
                ) {
                    // Parse metadata
                    if let Ok(metadata) = serde_json::from_str::<CommunityMetadata>(&decrypted) {
                        cache.insert(metadata.id, metadata);
                    }
                }
            }
        }
        
        tracing::info!("Loaded {} communities from relay", cache.len());
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
}

type Result<T> = std::result::Result<T, RelayError>;