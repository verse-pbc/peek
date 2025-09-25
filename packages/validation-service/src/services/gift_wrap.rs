use nostr_sdk::prelude::*;
use std::error::Error;
use tracing::info;

/// Service for handling NIP-59 gift wrap communication
pub struct GiftWrapService {
    keys: Keys, // Ephemeral keys for signing, separate from relay keys
}

impl GiftWrapService {
    /// Create a new gift wrap service with given keys
    pub fn new(keys: Keys) -> Self {
        Self { keys }
    }

    /// Create and send a gift-wrapped message to a recipient
    pub async fn create_and_send_gift_wrap(
        &self,
        client: &Client,
        recipient: &PublicKey,
        content: String,
        kind: Kind,
        tags: Vec<Tag>,
    ) -> Result<EventId, Box<dyn Error>> {
        info!(
            "Creating gift wrap for recipient: {}",
            recipient.to_bech32()?
        );

        // Create the rumor (unsigned event)
        let rumor = EventBuilder::new(kind, content)
            .tags(tags)
            .build(self.keys.public_key());

        // Create gift wrap with expiration
        let expiration = Timestamp::now() + 7 * 24 * 60 * 60; // 7 days in seconds
        let expiration_tag = Tag::expiration(expiration);
        let event =
            EventBuilder::gift_wrap(&self.keys, recipient, rumor, Some(expiration_tag)).await?;
        let event_id = event.id;

        // Send the gift wrap
        client.send_event(&event).await?;

        info!(
            "✅ Gift wrap sent successfully with ID: {} to recipient: {}",
            event_id.to_bech32()?,
            recipient.to_bech32()?
        );

        Ok(event_id)
    }
}
