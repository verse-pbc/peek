use geohash::{encode, neighbors, Coord};
use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::{
    config::Config,
    models::LocationPoint,
    services::{community::CommunityService, gift_wrap::GiftWrapService, relay::RelayService},
};

// Custom event kinds for Peek location validation (ephemeral range)
const LOCATION_VALIDATION_REQUEST_KIND: Kind = Kind::Custom(27492);
const LOCATION_VALIDATION_RESPONSE_KIND: Kind = Kind::Custom(27493);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationData {
    pub latitude: f64,
    pub longitude: f64,
    pub accuracy: f64,
    pub timestamp: i64,
}

// Unified request types using serde's tag attribute
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServiceRequest {
    #[serde(rename = "location_validation")]
    LocationValidation {
        community_id: String,
        location: LocationData,
    },
    #[serde(rename = "preview_request")]
    PreviewRequest { community_id: String },
}

// Unified response types using serde's tag attribute
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServiceResponse {
    #[serde(rename = "location_validation_response")]
    LocationValidation {
        success: bool,
        group_id: Option<String>,
        relay_url: Option<String>,
        is_admin: Option<bool>,
        is_member: Option<bool>,
        error: Option<String>,
        error_code: Option<String>,
    },
    #[serde(rename = "preview_response")]
    Preview {
        success: bool,
        name: Option<String>,
        picture: Option<String>,
        about: Option<String>,
        rules: Option<Vec<String>>,
        member_count: Option<u32>,
        is_public: Option<bool>,
        is_open: Option<bool>,
        created_at: Option<u64>,
        error: Option<String>,
    },
}

// Legacy types for backwards compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationValidationRequest {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub request_type: Option<String>,
    pub community_id: String,
    pub location: LocationData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationValidationResponse {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub response_type: Option<String>,
    pub success: bool,
    pub group_id: Option<String>,
    pub relay_url: Option<String>,
    pub is_admin: Option<bool>,
    pub is_member: Option<bool>,
    pub error: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Clone)]
pub struct NostrValidationHandler {
    client: Client,
    service_keys: Keys,
    community_service: Arc<CommunityService>,
    relay_service: Arc<RwLock<RelayService>>,
    config: Config,
    gift_wrap_service: Arc<GiftWrapService>,
}

impl NostrValidationHandler {
    pub async fn new(
        config: Config,
        community_service: Arc<CommunityService>,
        relay_service: Arc<RwLock<RelayService>>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        // Parse the service's secret key from hex
        let secret_key = SecretKey::from_hex(&config.service_secret_key)
            .map_err(|e| format!("Failed to parse service secret key: {}", e))?;
        let service_keys = Keys::new(secret_key);

        info!("Service pubkey: {}", service_keys.public_key().to_bech32()?);

        // Create client with service keys
        let client = Client::new(service_keys.clone());

        // Add relays for receiving gift wraps
        // Use only local relay for development/testing environments
        let relays = if config.relay_url.starts_with("ws://localhost")
            || config.relay_url.starts_with("ws://127.0.0.1")
            || config.relay_url.starts_with("ws://groups_relay")
            || config.relay_url.starts_with("ws://host.docker.internal")
        {
            vec![config.relay_url.clone()]
        } else {
            vec![
                config.relay_url.clone(),
                "wss://relay.damus.io".to_string(),
                "wss://relay.nostr.band".to_string(),
                "wss://nos.lol".to_string(),
            ]
        };

        for relay_url in &relays {
            client.add_relay(relay_url).await?;
        }

        client.connect().await;
        info!(
            "Connected to {} relays for gift wrap reception",
            relays.len()
        );

        // Create gift wrap service
        let gift_wrap_service = Arc::new(GiftWrapService::new(service_keys.clone()));

        Ok(Self {
            client,
            service_keys,
            community_service,
            relay_service,
            config,
            gift_wrap_service,
        })
    }

    /// Start listening for gift wrap events
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Starting NIP-59 gift wrap listener");

        // Subscribe to gift wraps for our service pubkey using limit(0) like the bot example
        // Gift wraps are tagged with #p for the recipient
        let filter = Filter::new()
            .kind(Kind::GiftWrap)
            .pubkey(self.service_keys.public_key())
            .limit(0); // Get unlimited results like the bot example

        info!(
            "Subscribing to gift wrap events for service pubkey: {}",
            self.service_keys
                .public_key()
                .to_bech32()
                .unwrap_or_else(|_| self.service_keys.public_key().to_hex())
        );

        // Subscribe to the filter
        self.client.subscribe(filter, None).await?;

        info!("Starting notification handler, waiting for gift wraps...");

        // Clone self for use in the async closure
        let handler = self.clone();
        self.client
            .handle_notifications(move |notification| {
                let handler = handler.clone();
                async move {
                    info!("Received notification: {:?}", notification);
                    if let RelayPoolNotification::Event {
                        event, relay_url, ..
                    } = notification
                    {
                        if event.kind == Kind::GiftWrap {
                            info!(
                                "📦 Received gift wrap from {} via {} (event: {})",
                                event
                                    .pubkey
                                    .to_bech32()
                                    .unwrap_or_else(|_| event.pubkey.to_hex()),
                                relay_url,
                                event.id.to_hex()
                            );

                            // Clone the event and process it with the actual handler
                            let gift_wrap = event.as_ref().clone();

                            // Process the gift wrap using the real handle_gift_wrap method
                            if let Err(e) = handler.handle_gift_wrap(gift_wrap).await {
                                error!("❌ Failed to handle gift wrap: {}", e);
                            }
                        } else {
                            debug!(
                                "⏩ Ignoring non-gift-wrap event kind {}",
                                event.kind.as_u16()
                            );
                        }
                    } else {
                        debug!("📋 Received non-event notification: {:?}", notification);
                    }
                    Ok(false) // Continue listening
                }
            })
            .await?;

        Ok(())
    }

    /// Handle a received gift wrap event
    async fn handle_gift_wrap(&self, gift_wrap: Event) -> Result<(), Box<dyn std::error::Error>> {
        let handle_start = std::time::Instant::now();
        info!(
            "⏱️ 🎁 handle_gift_wrap called at {:?} - processing event {}",
            handle_start,
            gift_wrap.id.to_string()
        );

        info!(
            "📦 Received gift wrap from {} (event: {})",
            gift_wrap.pubkey.to_bech32()?,
            &gift_wrap.id.to_string()[0..8]
        );

        // Unwrap the gift wrap
        let unwrap_start = std::time::Instant::now();
        info!("⏱️ Starting unwrap at {:?}", unwrap_start);
        let unwrapped = self.client.unwrap_gift_wrap(&gift_wrap).await?;
        let unwrap_duration = unwrap_start.elapsed();
        info!("⏱️ Unwrap completed in {:?}ms", unwrap_duration.as_millis());
        let rumor = unwrapped.rumor;

        // The actual sender is in the rumor pubkey, not the unwrapped.sender (which is ephemeral)
        let actual_sender = rumor.pubkey;

        info!(
            "🔓 Unwrapped gift wrap - ephemeral sender: {} actual sender: {} (kind: {})",
            unwrapped.sender.to_bech32()?,
            actual_sender.to_bech32()?,
            rumor.kind
        );

        // Log the full decrypted content for debugging
        info!("📝 Decrypted rumor content: {}", rumor.content);
        info!("🏷️ Rumor tags: {:?}", rumor.tags);
        info!("🆔 Rumor ID: {:?}", rumor.id);

        // Check if it's a request we handle
        if rumor.kind != LOCATION_VALIDATION_REQUEST_KIND {
            debug!("Ignoring non-validation rumor kind: {}", rumor.kind);
            return Ok(());
        }

        // Try to parse as unified request first, fall back to legacy format
        let parse_start = std::time::Instant::now();
        info!("⏱️ Starting request parsing at {:?}", parse_start);
        let response = if let Ok(request) = serde_json::from_str::<ServiceRequest>(&rumor.content) {
            // Handle unified request format
            match request {
                ServiceRequest::LocationValidation {
                    community_id,
                    location,
                } => {
                    info!(
                        "📍 Location validation request for community: {} from user: {}",
                        community_id,
                        actual_sender.to_bech32()?
                    );
                    debug!(
                        "   Location: ({:.6}, {:.6}) accuracy: {:.1}m",
                        location.latitude, location.longitude, location.accuracy
                    );

                    let process_start = std::time::Instant::now();
                    info!(
                        "⏱️ Starting location validation processing at {:?}",
                        process_start
                    );
                    let result = self
                        .process_location_validation(community_id, location, actual_sender)
                        .await;
                    let process_duration = process_start.elapsed();
                    info!(
                        "⏱️ Location validation completed in {:?}ms",
                        process_duration.as_millis()
                    );

                    ServiceResponse::LocationValidation {
                        success: result.success,
                        group_id: result.group_id,
                        relay_url: result.relay_url,
                        is_admin: result.is_admin,
                        is_member: result.is_member,
                        error: result.error,
                        error_code: result.error_code,
                    }
                }
                ServiceRequest::PreviewRequest { community_id } => {
                    info!(
                        "🔍 Community preview request for: {} from user: {}",
                        community_id,
                        actual_sender.to_bech32()?
                    );

                    let result = self.process_preview(community_id).await;

                    ServiceResponse::Preview {
                        success: result.0,
                        name: result.1,
                        picture: result.2,
                        about: result.3,
                        rules: result.4,
                        member_count: result.5,
                        is_public: result.6,
                        is_open: result.7,
                        created_at: result.8,
                        error: result.9,
                    }
                }
            }
        } else if let Ok(legacy_request) =
            serde_json::from_str::<LocationValidationRequest>(&rumor.content)
        {
            // Handle legacy format (without type field)
            info!(
                "📍 Location validation request (legacy format) for community: {} from user: {}",
                legacy_request.community_id,
                actual_sender.to_bech32()?
            );

            let result = self
                .process_location_validation(
                    legacy_request.community_id,
                    legacy_request.location,
                    actual_sender,
                )
                .await;

            ServiceResponse::LocationValidation {
                success: result.success,
                group_id: result.group_id,
                relay_url: result.relay_url,
                is_admin: result.is_admin,
                is_member: result.is_member,
                error: result.error,
                error_code: result.error_code,
            }
        } else {
            error!("Failed to parse request from rumor content");
            return Ok(());
        };

        // Log response details
        match &response {
            ServiceResponse::LocationValidation {
                success,
                is_admin,
                is_member,
                error,
                ..
            } => {
                info!(
                    "✅ Validation complete - success: {}, is_admin: {:?}, is_member: {:?}",
                    success, is_admin, is_member
                );
                if let Some(ref err) = error {
                    info!("   Error: {}", err);
                }
            }
            ServiceResponse::Preview {
                success,
                name,
                member_count,
                error,
                ..
            } => {
                info!(
                    "✅ Preview complete - success: {}, name: {:?}, members: {:?}",
                    success, name, member_count
                );
                if let Some(ref err) = error {
                    info!("   Error: {}", err);
                }
            }
        }

        // Send gift-wrapped response back with reference to request ID
        let send_start = std::time::Instant::now();
        info!("⏱️ Starting response preparation at {:?}", send_start);
        let rumor_id = rumor
            .id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let response_json = serde_json::to_string(&response)?;

        info!("📤 Sending response: {}", response_json);
        info!("📮 Response for request ID: {}", rumor_id);

        // Debug: Check what type was serialized
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&response_json) {
            if let Some(response_type) = parsed.get("type").and_then(|v| v.as_str()) {
                info!("📋 Response type field: '{}'", response_type);
            } else {
                tracing::warn!("⚠️ Response has no 'type' field! JSON: {}", response_json);
            }
        }

        // Send to the actual sender, not the ephemeral key
        info!(
            "🔐 Attempting to send response to recipient: {} ({})",
            actual_sender.to_bech32()?,
            actual_sender.to_hex()
        );

        match self
            .send_service_response(actual_sender, response_json, &rumor_id)
            .await
        {
            Ok(_) => {
                let send_duration = send_start.elapsed();
                let total_duration = handle_start.elapsed();
                info!("⏱️ Response sent in {:?}ms", send_duration.as_millis());
                info!(
                    "⏱️ ✅ Total handle_gift_wrap time: {:?}ms",
                    total_duration.as_millis()
                );
                info!(
                    "✅ Gift-wrapped response sent to {}",
                    actual_sender.to_bech32()?
                );
            }
            Err(e) => {
                error!("❌ Failed to send gift-wrapped response: {}", e);
                error!("   Recipient pubkey hex: {}", actual_sender.to_hex());
                error!("   Recipient pubkey npub: {}", actual_sender.to_bech32()?);
                return Err(format!("Failed to send response: {}", e).into());
            }
        }

        Ok(())
    }

    /// Process a location validation request
    async fn process_location_validation(
        &self,
        community_id: String,
        location: LocationData,
        sender_pubkey: PublicKey,
    ) -> LocationValidationResponse {
        let process_start = std::time::Instant::now();
        info!(
            "⏱️ process_location_validation started at {:?}",
            process_start
        );
        // Parse community ID
        let community_uuid = match Uuid::parse_str(&community_id) {
            Ok(id) => id,
            Err(e) => {
                return LocationValidationResponse {
                    response_type: Some("location_validation_response".to_string()),
                    success: false,
                    group_id: None,
                    relay_url: None,
                    is_admin: None,
                    is_member: None,
                    error: Some(format!("Invalid community ID: {}", e)),
                    error_code: Some("INVALID_ID".to_string()),
                };
            }
        };

        // Extract location
        let user_location = LocationPoint {
            latitude: location.latitude,
            longitude: location.longitude,
        };

        // Get or create community
        let community_start = std::time::Instant::now();
        info!("⏱️ Getting/creating community at {:?}", community_start);
        let (community, is_new) = match self
            .community_service
            .get_or_create(
                community_uuid,
                community_uuid.to_string(),
                user_location.clone(),
                sender_pubkey.to_hex(),
            )
            .await
        {
            Ok(result) => {
                let community_duration = community_start.elapsed();
                info!(
                    "⏱️ Community get/create took {:?}ms, is_new: {}",
                    community_duration.as_millis(),
                    result.1
                );
                result
            }
            Err(e) => {
                return LocationValidationResponse {
                    response_type: Some("location_validation_response".to_string()),
                    success: false,
                    group_id: None,
                    relay_url: None,
                    is_admin: None,
                    is_member: None,
                    error: Some(format!("Failed to get/create community: {}", e)),
                    error_code: Some("COMMUNITY_ERROR".to_string()),
                };
            }
        };

        // If not a new community, validate location using geohash
        if !is_new {
            // Validate user is within the geohash area (includes neighbors)
            if !validate_geohash_location(&user_location, &community.geohash) {
                return LocationValidationResponse {
                    response_type: Some("location_validation_response".to_string()),
                    success: false,
                    group_id: None,
                    relay_url: None,
                    is_admin: None,
                    is_member: None,
                    error: Some("Location outside community area".to_string()),
                    error_code: Some("LOCATION_INVALID".to_string()),
                };
            }

            // Note: We no longer check GPS accuracy server-side since it's self-reported
            // and can be spoofed via Nostr messages. The geohash matching provides
            // the actual security.
        }

        // The group was already created in get_or_create
        let group_id = format!("peek-{}", community_uuid);

        // If not a new community (user is joining existing), add them as a member
        if !is_new {
            // For existing groups, just add the user
            let add_user_start = std::time::Instant::now();
            info!("⏱️ Adding user to existing group at {:?}", add_user_start);
            match self
                .relay_service
                .write()
                .await
                .add_user_to_group(&group_id, &sender_pubkey.to_hex(), false)
                .await
            {
                Ok(_) => {
                    let add_duration = add_user_start.elapsed();
                    info!(
                        "⏱️ Added user {} to existing group {} in {:?}ms",
                        sender_pubkey.to_hex(),
                        group_id,
                        add_duration.as_millis()
                    );
                }
                Err(e) => {
                    return LocationValidationResponse {
                        response_type: Some("location_validation_response".to_string()),
                        success: false,
                        group_id: None,
                        relay_url: None,
                        is_admin: None,
                        is_member: None,
                        error: Some(format!("Failed to add user to group: {}", e)),
                        error_code: Some("GROUP_ADD_FAILED".to_string()),
                    };
                }
            }
        }

        let total_duration = process_start.elapsed();
        info!(
            "⏱️ process_location_validation completed in {:?}ms",
            total_duration.as_millis()
        );

        LocationValidationResponse {
            response_type: Some("location_validation_response".to_string()),
            success: true,
            group_id: Some(group_id),
            relay_url: Some(self.config.public_relay_url.clone()),
            is_admin: Some(is_new),
            is_member: Some(true),
            error: None,
            error_code: None,
        }
    }

    /// Process a community preview request
    async fn process_preview(
        &self,
        community_id: String,
    ) -> (
        bool,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<Vec<String>>,
        Option<u32>,
        Option<bool>,
        Option<bool>,
        Option<u64>,
        Option<String>,
    ) {
        info!("🔎 Processing preview for community: {}", community_id);

        // Parse community ID
        let community_uuid = match Uuid::parse_str(&community_id) {
            Ok(id) => id,
            Err(e) => {
                error!("❌ Invalid community ID: {}", e);
                return (
                    false,                                        // success
                    None,                                         // name
                    None,                                         // picture
                    None,                                         // about
                    None,                                         // rules
                    None,                                         // member_count
                    None,                                         // is_public
                    None,                                         // is_open
                    None,                                         // created_at
                    Some(format!("Invalid community ID: {}", e)), // error
                );
            }
        };

        let group_id = format!("peek-{}", community_uuid);
        info!("📋 Fetching metadata for group: {}", group_id);

        // Try to fetch NIP-29 group metadata from relay
        match self
            .relay_service
            .read()
            .await
            .get_group_metadata(&group_id)
            .await
        {
            Ok(metadata) => {
                info!(
                    "✅ Found community metadata: name={}, members={}",
                    metadata.name, metadata.member_count
                );
                (
                    true,
                    Some(metadata.name),
                    metadata.picture,
                    metadata.about,
                    metadata.rules,
                    Some(metadata.member_count),
                    Some(metadata.is_public),
                    Some(metadata.is_open),
                    Some(metadata.created_at.as_u64()),
                    None,
                )
            }
            Err(e) => {
                error!("❌ Failed to fetch community metadata: {}", e);
                (
                    false,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    Some(format!("Failed to fetch community metadata: {}", e)),
                )
            }
        }
    }

    /// Send a gift-wrapped response back to the requester
    async fn send_service_response(
        &self,
        recipient: PublicKey,
        response_json: String,
        request_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        info!(
            "🎁 Creating gift wrap for recipient: {} ({})",
            recipient.to_bech32()?,
            recipient.to_hex()
        );
        info!("📝 Response content length: {} chars", response_json.len());
        info!("🔗 Request ID reference: {}", request_id);

        // Use the centralized gift wrap service
        let tags = vec![Tag::custom(
            TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::E)),
            vec![request_id.to_string()],
        )];

        let event_id = self
            .gift_wrap_service
            .create_and_send_gift_wrap(
                &self.client,
                &recipient,
                response_json,
                LOCATION_VALIDATION_RESPONSE_KIND,
                tags,
            )
            .await?;

        info!(
            "✅ Gift wrap sent successfully: {} to {}",
            event_id,
            recipient.to_bech32()?
        );

        Ok(())
    }
}

/// Validate location using geohash neighbor matching
fn validate_geohash_location(user_location: &LocationPoint, community_geohash: &str) -> bool {
    // Ensure the community geohash is level 8
    if community_geohash.len() != 8 {
        return false;
    }

    // Encode user location to level 8
    let user_geohash = match encode(
        Coord {
            x: user_location.longitude,
            y: user_location.latitude,
        },
        8,
    ) {
        Ok(hash) => hash,
        Err(_) => return false,
    };

    // Check if user is in same cell
    if user_geohash == community_geohash {
        return true;
    }

    // Check all 8 neighboring cells
    match neighbors(community_geohash) {
        Ok(neighbor_set) => {
            user_geohash == neighbor_set.n
                || user_geohash == neighbor_set.ne
                || user_geohash == neighbor_set.e
                || user_geohash == neighbor_set.se
                || user_geohash == neighbor_set.s
                || user_geohash == neighbor_set.sw
                || user_geohash == neighbor_set.w
                || user_geohash == neighbor_set.nw
        }
        Err(_) => false,
    }
}
