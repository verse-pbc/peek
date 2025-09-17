use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::{
    config::Config,
    libraries::location_check::{LocationChecker, LocationCheckConfig},
    models::{LocationPoint, LocationProof},
    services::{community::CommunityService, relay::RelayService},
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationValidationRequest {
    pub community_id: String,
    pub location: LocationData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationValidationResponse {
    pub success: bool,
    pub invite_code: Option<String>,
    pub group_id: Option<String>,
    pub relay_url: Option<String>,
    pub is_admin: Option<bool>,
    pub is_member: Option<bool>,
    pub error: Option<String>,
    pub error_code: Option<String>,
}

pub struct NostrValidationHandler {
    client: Client,
    service_keys: Keys,
    community_service: Arc<CommunityService>,
    relay_service: Arc<RwLock<RelayService>>,
    config: Config,
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
        // Use local relay if configured, otherwise use public relays
        let relays = if config.relay_url.starts_with("ws://localhost") || config.relay_url.starts_with("ws://127.0.0.1") {
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
        info!("Connected to {} relays for gift wrap reception", relays.len());

        Ok(Self {
            client,
            service_keys,
            community_service,
            relay_service,
            config,
        })
    }

    /// Start listening for gift wrap events
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Starting NIP-59 gift wrap listener");

        // Subscribe to gift wraps for our service pubkey
        // Gift wraps are tagged with #p for the recipient
        // Don't use .since() because NIP-59 randomizes timestamps up to 2 days in past
        let filter = Filter::new()
            .kind(Kind::GiftWrap)
            .custom_tag(
                SingleLetterTag::lowercase(Alphabet::P),
                self.service_keys.public_key().to_hex()
            )
            .limit(100); // Limit to recent events to avoid getting flooded

        self.client
            .subscribe(filter.clone(), None)
            .await?;

        info!("Subscribed to gift wrap events for service pubkey");

        // Handle incoming events
        self.client
            .handle_notifications(|notification| async {
                if let RelayPoolNotification::Event { event, .. } = notification {
                    if event.kind == Kind::GiftWrap {
                        if let Err(e) = self.handle_gift_wrap(*event).await {
                            error!("❌ Failed to handle gift wrap: {}", e);
                        }
                    }
                }
                Ok(false) // Continue listening
            })
            .await?;

        Ok(())
    }

    /// Handle a received gift wrap event
    async fn handle_gift_wrap(&self, gift_wrap: Event) -> Result<(), Box<dyn std::error::Error>> {
        info!(
            "📦 Received gift wrap from {} (event: {})",
            gift_wrap.pubkey.to_bech32()?,
            &gift_wrap.id.to_string()[0..8]
        );

        // Unwrap the gift wrap
        let unwrapped = self.client.unwrap_gift_wrap(&gift_wrap).await?;
        let rumor = unwrapped.rumor;

        info!(
            "🔓 Unwrapped gift wrap from sender: {} (kind: {})",
            unwrapped.sender.to_bech32()?,
            rumor.kind
        );

        // Check if it's a location validation request
        if rumor.kind != LOCATION_VALIDATION_REQUEST_KIND {
            debug!("Ignoring non-validation rumor kind: {}", rumor.kind);
            return Ok(());
        }

        // Parse the request
        let request: LocationValidationRequest = serde_json::from_str(&rumor.content)?;
        info!(
            "📍 Location validation request for community: {} from user: {}",
            request.community_id,
            unwrapped.sender.to_bech32()?
        );
        debug!(
            "   Location: ({:.6}, {:.6}) accuracy: {:.1}m",
            request.location.latitude,
            request.location.longitude,
            request.location.accuracy
        );

        // Process the validation
        let response = self.process_validation(request, unwrapped.sender).await;

        info!(
            "✅ Validation complete - success: {}, is_admin: {:?}, is_member: {:?}, relay_url: {:?}",
            response.success,
            response.is_admin,
            response.is_member,
            response.relay_url
        );
        if let Some(ref error) = response.error {
            info!("   Error: {} (code: {:?})", error, response.error_code);
        }
        if response.invite_code.is_some() {
            info!("   Generated invite code for group: {:?}", response.group_id);
        }

        // Send gift-wrapped response back with reference to request ID
        let rumor_id = rumor.id.map(|id| id.to_string()).unwrap_or_else(|| "unknown".to_string());
        self.send_response(unwrapped.sender, response, &rumor_id).await?;
        info!("📤 Sent gift-wrapped response to {}", unwrapped.sender.to_bech32()?);

        Ok(())
    }

    /// Process a location validation request
    async fn process_validation(
        &self,
        request: LocationValidationRequest,
        sender_pubkey: PublicKey,
    ) -> LocationValidationResponse {
        // Parse community ID
        let community_id = match Uuid::parse_str(&request.community_id) {
            Ok(id) => id,
            Err(e) => {
                return LocationValidationResponse {
                    success: false,
                    invite_code: None,
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
            latitude: request.location.latitude,
            longitude: request.location.longitude,
        };

        // Get or create community
        let (community, is_new) = match self
            .community_service
            .get_or_create(
                community_id,
                community_id.to_string(),
                user_location.clone(),
                sender_pubkey.to_hex(),
            )
            .await
        {
            Ok(result) => result,
            Err(e) => {
                return LocationValidationResponse {
                    success: false,
                    invite_code: None,
                    group_id: None,
                    relay_url: None,
                    is_admin: None,
                    is_member: None,
                    error: Some(format!("Failed to get/create community: {}", e)),
                    error_code: Some("COMMUNITY_ERROR".to_string()),
                };
            }
        };

        // If not a new community, validate location
        if !is_new {
            let checker = LocationChecker::with_config(LocationCheckConfig {
                max_distance_meters: self.config.max_distance_meters,
                max_accuracy_meters: self.config.max_accuracy_meters,
                max_timestamp_age: self.config.max_timestamp_age_seconds,
            });

            let proof = LocationProof {
                coordinates: user_location.clone(),
                accuracy: request.location.accuracy,
                timestamp: request.location.timestamp,
                heading: None,
                speed: None,
                altitude: None,
                altitude_accuracy: None,
            };

            let check_result = checker.validate_location(&proof, &community.location);

            if !check_result.passed {
                let error_msg = if let Some(ref error) = check_result.error {
                    error.to_string()
                } else if check_result.accuracy > self.config.max_accuracy_meters {
                    format!("GPS accuracy too poor: {:.0}m (max: {}m)",
                        check_result.accuracy,
                        self.config.max_accuracy_meters)
                } else if check_result.distance > self.config.max_distance_meters {
                    format!("Too far from location: {:.0}m away", check_result.distance)
                } else {
                    "Location validation failed".to_string()
                };

                return LocationValidationResponse {
                    success: false,
                    invite_code: None,
                    group_id: None,
                    relay_url: None,
                    is_admin: None,
                    is_member: None,
                    error: Some(error_msg),
                    error_code: Some("LOCATION_INVALID".to_string()),
                };
            }
        }

        // Create or join group
        let group_id = format!("peek-{}", community_id);

        // If this is a new community, create the group first
        if is_new {
            match self
                .relay_service
                .write()
                .await
                .create_group(
                    community_id,
                    community.name.clone(),
                    sender_pubkey.to_hex(),
                    crate::services::relay::Location {
                        latitude: community.location.latitude,
                        longitude: community.location.longitude,
                    },
                )
                .await
            {
                Ok(_) => {
                    info!(
                        "Created new group {} with admin {}",
                        group_id,
                        sender_pubkey.to_hex()
                    );
                }
                Err(e) => {
                    return LocationValidationResponse {
                        success: false,
                        invite_code: None,
                        group_id: None,
                        relay_url: None,
                        is_admin: None,
                        is_member: None,
                        error: Some(format!("Failed to create group: {}", e)),
                        error_code: Some("GROUP_CREATE_FAILED".to_string()),
                    };
                }
            }
        } else {
            // For existing groups, just add the user
            match self
                .relay_service
                .write()
                .await
                .add_user_to_group(&group_id, &sender_pubkey.to_hex(), false)
                .await
            {
                Ok(_) => {
                    info!(
                        "Added user {} to existing group {}",
                        sender_pubkey.to_hex(),
                        group_id
                    );
                }
                Err(e) => {
                    return LocationValidationResponse {
                        success: false,
                        invite_code: None,
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

        LocationValidationResponse {
            success: true,
            invite_code: Some(group_id.clone()), // Using group_id as invite code
            group_id: Some(group_id),
            relay_url: Some(self.config.public_relay_url.clone()),
            is_admin: Some(is_new),
            is_member: Some(true),
            error: None,
            error_code: None,
        }
    }

    /// Send a gift-wrapped response back to the requester
    async fn send_response(
        &self,
        recipient: PublicKey,
        response: LocationValidationResponse,
        request_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Create response rumor with 'e' tag pointing to request
        let response_json = serde_json::to_string(&response)?;

        let rumor = UnsignedEvent::new(
            self.service_keys.public_key(),
            Timestamp::now(),
            LOCATION_VALIDATION_RESPONSE_KIND,
            vec![
                Tag::custom(TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::E)), vec![request_id.to_string()]),
            ],
            response_json,
        );

        // Create and send gift wrap using the client
        self.client.gift_wrap(&recipient, rumor, vec![]).await?;

        info!("Sent gift-wrapped response to {} for request {}", recipient.to_bech32()?, request_id);

        Ok(())
    }
}