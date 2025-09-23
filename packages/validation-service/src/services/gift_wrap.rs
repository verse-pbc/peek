use nostr_sdk::prelude::*;
use nostr_sdk::EventBuilder;
use serde::{Deserialize, Serialize};
use std::error::Error;

/// Centralized gift wrap service for consistent NIP-59 handling
pub struct GiftWrapService {
    keys: Keys,
}

impl GiftWrapService {
    /// Create a new gift wrap service with the given keys
    pub fn new(keys: Keys) -> Self {
        Self { keys }
    }

    /// Create and send a gift-wrapped message
    pub async fn create_and_send_gift_wrap(
        &self,
        client: &Client,
        recipient: &PublicKey,
        content: String,
        kind: Kind,
        tags: Vec<Tag>,
    ) -> Result<EventId, Box<dyn Error>> {
        // Create the rumor (unsigned event)
        let rumor = UnsignedEvent::new(
            self.keys.public_key(),
            Timestamp::now(),
            kind,
            tags,
            content,
        );

        tracing::debug!("Creating gift wrap for recipient: {}", recipient.to_hex());
        tracing::debug!("Using keys with pubkey: {}", self.keys.public_key().to_hex());

        // Create seal using EventBuilder (this works in our test)
        let seal = EventBuilder::seal(&self.keys, recipient, rumor)
            .await?
            .sign_with_keys(&self.keys)?;

        tracing::debug!("Seal created: {:?}", seal.id);

        // Create expiration tag (3 days from now for NIP-40)
        let expiration = Timestamp::now() + 3 * 24 * 60 * 60;
        let expiration_tag = Tag::expiration(expiration);

        // Create gift wrap from seal with expiration tag
        let gift_wrap = EventBuilder::gift_wrap_from_seal(recipient, &seal, vec![expiration_tag])?;

        tracing::info!("Gift wrap created for recipient: {}", recipient.to_hex());
        tracing::debug!("Gift wrap event: {:?}", gift_wrap);

        // Send the gift wrap event
        tracing::info!("📡 Sending gift wrap to relays...");
        tracing::debug!("Gift wrap event details: id={}, pubkey={}, p_tag={}",
            gift_wrap.id, gift_wrap.pubkey, recipient.to_hex());

        let output = client.send_event(&gift_wrap).await?;
        let event_id = output.id().to_owned();

        // Check which relays accepted the event
        let success_relays = output.success
            .iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();
        let failed_relays = output.failed
            .iter()
            .map(|(url, msg)| format!("{}: {}", url, msg))
            .collect::<Vec<_>>();

        if !success_relays.is_empty() {
            tracing::info!("✅ Gift wrap {} sent to relays: {:?}", event_id, success_relays);
        }
        if !failed_relays.is_empty() {
            tracing::warn!("⚠️ Gift wrap {} failed on relays: {:?}", event_id, failed_relays);
        }

        if success_relays.is_empty() {
            return Err("Gift wrap was not accepted by any relay".into());
        }

        Ok(event_id)
    }

    /// Unwrap a received gift wrap
    pub async fn unwrap_gift_wrap(
        &self,
        client: &Client,
        gift_wrap: &Event,
    ) -> Result<UnwrappedGift, Box<dyn Error>> {
        let unwrapped = client.unwrap_gift_wrap(gift_wrap).await
            .map_err(|e| {
                tracing::error!("Gift wrap unwrapping failed: {:?}", e);
                Box::new(GiftWrapError::UnwrapFailed(format!("{:?}", e)))
            })?;

        Ok(unwrapped)
    }

    /// Create a gift-wrapped response for a request
    pub async fn create_response(
        &self,
        client: &Client,
        recipient: &PublicKey,
        response_data: impl Serialize,
        request_id: &str,
        response_kind: Kind,
    ) -> Result<EventId, Box<dyn Error>> {
        let content = serde_json::to_string(&response_data)?;

        // Add reference to original request
        let tags = vec![
            Tag::custom(
                TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::E)),
                vec![request_id.to_string()]
            ),
        ];

        self.create_and_send_gift_wrap(
            client,
            recipient,
            content,
            response_kind,
            tags
        ).await
    }

    /// Validate that a public key is properly formatted
    pub fn validate_pubkey(pubkey_hex: &str) -> Result<PublicKey, Box<dyn Error>> {
        // Try parsing as hex first
        PublicKey::from_hex(pubkey_hex)
            .or_else(|_| PublicKey::from_bech32(pubkey_hex))
            .map_err(|e| {
                tracing::error!("Invalid public key '{}': {}", pubkey_hex, e);
                Box::new(GiftWrapError::InvalidPublicKey(pubkey_hex.to_string())) as Box<dyn Error>
            })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GiftWrapError {
    #[error("Failed to create gift wrap: {0}")]
    CreationFailed(String),

    #[error("Failed to unwrap gift: {0}")]
    UnwrapFailed(String),

    #[error("Invalid public key: {0}")]
    InvalidPublicKey(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_pubkey() {
        // Valid hex pubkey
        let hex = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
        assert!(GiftWrapService::validate_pubkey(hex).is_ok());

        // Valid npub
        let npub = "npub10xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqpkge6d";
        assert!(GiftWrapService::validate_pubkey(npub).is_ok());

        // Invalid pubkey
        let invalid = "invalid_key";
        assert!(GiftWrapService::validate_pubkey(invalid).is_err());
    }
}