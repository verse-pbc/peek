use chrono::{Duration, Utc};
use nostr_sdk::prelude::*;
use uuid::Uuid;
use base64::Engine;

use crate::config::Config;

/// Configuration for invite creation
#[derive(Debug, Clone)]
pub struct InviteConfig {
    pub relay_url: String,
    pub admin_nsec: String,
    pub expiry_seconds: u64,
}

impl From<&Config> for InviteConfig {
    fn from(config: &Config) -> Self {
        Self {
            relay_url: config.relay_url.clone(),
            admin_nsec: config.admin_nsec.clone().unwrap_or_default(),
            expiry_seconds: config.invite_expiry_seconds,
        }
    }
}

/// Result of invite creation
#[derive(Debug, Clone)]
pub struct InviteResult {
    pub invite_code: String,
    pub expires_at: i64,
    pub event_id: String,
}

/// Service for creating NIP-29 invites on the relay
pub struct InviteCreator {
    client: Client,
    admin_keys: Keys,
    config: InviteConfig,
}

impl InviteCreator {
    /// Create a new invite creator with config
    pub async fn new(config: InviteConfig) -> Result<Self, InviteError> {
        // Parse admin private key
        let admin_keys = Keys::parse(&config.admin_nsec)
            .map_err(|e| InviteError::InvalidAdminKey(e.to_string()))?;

        // Create Nostr client
        let client = Client::new(&admin_keys);
        
        // Add relay
        client.add_relay(&config.relay_url)
            .await
            .map_err(|e| InviteError::RelayConnection(e.to_string()))?;
        
        // Connect to relay
        client.connect()
            .await;

        Ok(Self {
            client,
            admin_keys,
            config,
        })
    }

    /// Create a NIP-29 invite for a community
    pub async fn create_invite(
        &self,
        community_id: &Uuid,
        user_pubkey: Option<&str>,
    ) -> Result<InviteResult, InviteError> {
        let group_id = format!("peek_{}", community_id);
        let invite_code = generate_invite_code();
        let expires_at = Utc::now().timestamp() + self.config.expiry_seconds as i64;

        // Build tags for kind:9009 event
        let mut tags = vec![
            Tag::custom(TagKind::Custom("h".into()), vec![group_id.clone()]),
            Tag::custom(TagKind::Custom("expiration".into()), vec![expires_at.to_string()]),
            Tag::custom(TagKind::Custom("uses".into()), vec!["1".to_string()]),
        ];

        // Add target user if specified
        if let Some(pubkey) = user_pubkey {
            tags.push(Tag::custom(TagKind::Custom("for".into()), vec![pubkey.to_string()]));
        }

        // Create kind:9009 event (NIP-29 create-invite)
        let event = EventBuilder::new(Kind::Custom(9009), invite_code.clone(), tags)
            .to_event(&self.admin_keys)
            .map_err(|e| InviteError::EventCreation(e.to_string()))?;

        // Send to relay
        let event_id = self.client.send_event(event.clone())
            .await
            .map_err(|e| InviteError::RelaySend(e.to_string()))?;

        Ok(InviteResult {
            invite_code,
            expires_at,
            event_id: event_id.to_hex(),
        })
    }

    /// Create an invite with automatic retry on failure
    pub async fn create_invite_with_retry(
        &self,
        community_id: &Uuid,
        user_pubkey: Option<&str>,
        max_retries: usize,
    ) -> Result<InviteResult, InviteError> {
        let mut last_error = None;
        
        for attempt in 0..=max_retries {
            match self.create_invite(community_id, user_pubkey).await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries {
                        // Wait before retry with exponential backoff
                        let delay = Duration::milliseconds(100 * 2_i64.pow(attempt as u32));
                        tokio::time::sleep(delay.to_std().unwrap_or_default()).await;
                    }
                }
            }
        }

        Err(last_error.unwrap_or(InviteError::Unknown))
    }

    /// Verify an invite exists on the relay
    pub async fn verify_invite(&self, invite_code: &str) -> Result<bool, InviteError> {
        // Create filter for kind:9009 events with this invite code
        let filter = Filter::new()
            .kind(Kind::Custom(9009))
            .author(self.admin_keys.public_key())
            .limit(10);

        // Query relay - get events from connected relays
        let events = self.client.get_events_of(
            vec![filter],
            EventSource::relays(Some(std::time::Duration::from_secs(5))),
        )
        .await
        .map_err(|e| InviteError::RelayQuery(e.to_string()))?;

        // Check if any non-expired invite exists with matching content
        let now = Utc::now().timestamp();
        for event in events {
            // Check if content matches invite code
            if event.content != invite_code {
                continue;
            }

            // Look for expiration tag
            for tag in &event.tags {
                // Check if this is a custom tag with "expiration" kind
                if matches!(tag.kind(), TagKind::Custom(ref k) if k == "expiration") {
                    if let Some(exp_str) = tag.content() {
                        if let Ok(exp) = exp_str.parse::<i64>() {
                            if exp > now {
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }

        Ok(false)
    }

    /// Disconnect from relay
    pub async fn disconnect(&self) -> Result<(), InviteError> {
        self.client.disconnect()
            .await
            .map_err(|e| InviteError::RelayDisconnect(e.to_string()))?;
        Ok(())
    }
}

/// Generate a random invite code
fn generate_invite_code() -> String {
    // Generate random bytes for invite code
    let random_bytes: [u8; 16] = rand::random();
    
    // Convert to base64url without padding
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(random_bytes)
}

/// Errors that can occur during invite creation
#[derive(Debug, Clone, thiserror::Error)]
pub enum InviteError {
    #[error("Invalid admin key: {0}")]
    InvalidAdminKey(String),
    
    #[error("Failed to connect to relay: {0}")]
    RelayConnection(String),
    
    #[error("Failed to create event: {0}")]
    EventCreation(String),
    
    #[error("Failed to send event to relay: {0}")]
    RelaySend(String),
    
    #[error("Failed to query relay: {0}")]
    RelayQuery(String),
    
    #[error("Failed to disconnect from relay: {0}")]
    RelayDisconnect(String),
    
    #[error("Unknown error")]
    Unknown,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> InviteConfig {
        InviteConfig {
            relay_url: "wss://peek.hol.is".to_string(),
            admin_nsec: "nsec1testkey123456789".to_string(),  // Invalid key for testing
            expiry_seconds: 300,
        }
    }

    #[test]
    fn test_generate_invite_code() {
        let code1 = generate_invite_code();
        let code2 = generate_invite_code();
        
        // Should be different
        assert_ne!(code1, code2);
        
        // Should be base64url encoded (22 chars for 16 bytes)
        assert_eq!(code1.len(), 22);
        assert_eq!(code2.len(), 22);
        
        // Should only contain base64url characters
        for c in code1.chars() {
            assert!(c.is_ascii_alphanumeric() || c == '-' || c == '_');
        }
    }

    #[tokio::test]
    async fn test_invalid_admin_key() {
        let config = create_test_config();
        let result = InviteCreator::new(config).await;
        
        assert!(result.is_err());
        if let Err(e) = result {
            assert!(matches!(e, InviteError::InvalidAdminKey(_)));
        }
    }

    #[test]
    fn test_invite_config_from_app_config() {
        let mut app_config = Config::default();
        app_config.relay_url = "wss://test.relay".to_string();
        app_config.admin_nsec = Some("nsec1test".to_string());
        app_config.invite_expiry_seconds = 600;
        
        let invite_config = InviteConfig::from(&app_config);
        
        assert_eq!(invite_config.relay_url, "wss://test.relay");
        assert_eq!(invite_config.admin_nsec, "nsec1test");
        assert_eq!(invite_config.expiry_seconds, 600);
    }

    #[test]
    fn test_invite_result_fields() {
        let result = InviteResult {
            invite_code: "test123".to_string(),
            expires_at: 1234567890,
            event_id: "eventid123".to_string(),
        };
        
        assert_eq!(result.invite_code, "test123");
        assert_eq!(result.expires_at, 1234567890);
        assert_eq!(result.event_id, "eventid123");
    }
}