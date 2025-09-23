#[cfg(test)]
mod tests {
    use nostr_sdk::prelude::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_gift_wrap_roundtrip() {
        // Create sender and recipient keys
        let sender_keys = Keys::generate();
        let recipient_keys = Keys::generate();

        println!("Sender pubkey: {}", sender_keys.public_key().to_hex());
        println!("Recipient pubkey: {}", recipient_keys.public_key().to_hex());

        // Create a rumor (unsigned event)
        let content = json!({
            "type": "preview_response",
            "success": true,
            "name": "Test Community",
            "member_count": 42
        }).to_string();

        let rumor = UnsignedEvent::new(
            sender_keys.public_key(),
            Timestamp::now(),
            Kind::from(27493), // Response kind
            vec![Tag::custom(
                TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::E)),
                vec!["test-request-id".to_string()]
            )],
            content.clone(),
        );

        println!("Rumor created with content: {}", content);

        // Method 1: Using EventBuilder::seal and gift_wrap_from_seal
        println!("\n=== Testing Method 1: EventBuilder::seal + gift_wrap_from_seal ===");

        // Create seal
        let seal = EventBuilder::seal(&sender_keys, &recipient_keys.public_key(), rumor.clone())
            .await
            .expect("Failed to create seal")
            .sign_with_keys(&sender_keys)
            .expect("Failed to sign seal");

        println!("Seal created: {:?}", seal.id);

        // Create gift wrap from seal
        let gift_wrap = EventBuilder::gift_wrap_from_seal(
            &recipient_keys.public_key(),
            &seal,
            vec![]
        ).expect("Failed to create gift wrap from seal");

        println!("Gift wrap created: {:?}", gift_wrap.id);
        println!("Gift wrap pubkey (ephemeral): {}", gift_wrap.pubkey.to_hex());

        // Try to unwrap it
        println!("\nAttempting to unwrap gift wrap...");

        // First decrypt the outer layer (gift wrap)
        use nostr_sdk::nips::nip44;

        let decrypted_seal_json = nip44::decrypt(
            recipient_keys.secret_key(),
            &gift_wrap.pubkey,
            &gift_wrap.content,
        ).expect("Failed to decrypt gift wrap");

        println!("Successfully decrypted outer layer");

        let seal_from_wrap: Event = serde_json::from_str(&decrypted_seal_json)
            .expect("Failed to parse seal from gift wrap");

        println!("Extracted seal from gift wrap: {:?}", seal_from_wrap.id);

        // Now decrypt the seal to get the rumor
        let decrypted_rumor_json = nip44::decrypt(
            recipient_keys.secret_key(),
            &seal_from_wrap.pubkey,
            &seal_from_wrap.content,
        ).expect("Failed to decrypt seal");

        println!("Successfully decrypted seal");

        let rumor_from_seal: UnsignedEvent = serde_json::from_str(&decrypted_rumor_json)
            .expect("Failed to parse rumor from seal");

        println!("Extracted rumor content: {}", rumor_from_seal.content);

        assert_eq!(rumor_from_seal.content, content);
        println!("✅ Content matches!");

        // Method 2: Using Client gift_wrap (if we have a client)
        println!("\n=== Testing Method 2: Client::gift_wrap ===");

        let client = Client::new(sender_keys.clone());

        // Try the client's gift_wrap method
        match client.gift_wrap(&recipient_keys.public_key(), rumor.clone(), vec![]).await {
            Ok(output) => {
                println!("✅ Client gift_wrap succeeded: {:?}", output.id());
            }
            Err(e) => {
                println!("❌ Client gift_wrap failed: {:?}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_manual_gift_wrap() {
        // Test manual gift wrap creation like in our service
        let sender_keys = Keys::generate();
        let recipient_keys = Keys::generate();

        println!("Testing manual gift wrap creation...");
        println!("Sender: {}", sender_keys.public_key().to_hex());
        println!("Recipient: {}", recipient_keys.public_key().to_hex());

        let content = json!({"test": "data"}).to_string();
        let rumor = UnsignedEvent::new(
            sender_keys.public_key(),
            Timestamp::now(),
            Kind::from(27493),
            vec![],
            content.clone(),
        );

        // Manually create seal
        use nostr_sdk::nips::nip44;

        let rumor_json = serde_json::to_string(&rumor).unwrap();

        // Encrypt rumor for recipient
        let encrypted_rumor = nip44::encrypt(
            sender_keys.secret_key(),
            &recipient_keys.public_key(),
            &rumor_json,
            nip44::Version::default(),
        ).expect("Failed to encrypt rumor");

        // Create seal event
        let seal = EventBuilder::new(Kind::Seal, encrypted_rumor)
            .custom_created_at(Timestamp::now())
            .sign_with_keys(&sender_keys)
            .expect("Failed to create seal");

        println!("Seal created manually: {:?}", seal.id);

        // Create gift wrap with ephemeral keys
        let ephemeral_keys = Keys::generate();
        println!("Ephemeral pubkey: {}", ephemeral_keys.public_key().to_hex());

        let seal_json = serde_json::to_string(&seal).unwrap();

        // Encrypt seal for recipient using ephemeral keys
        let encrypted_seal = nip44::encrypt(
            ephemeral_keys.secret_key(),
            &recipient_keys.public_key(),
            &seal_json,
            nip44::Version::default(),
        ).expect("Failed to encrypt seal");

        // Create gift wrap event
        let gift_wrap = EventBuilder::new(Kind::GiftWrap, encrypted_seal)
            .tag(Tag::public_key(recipient_keys.public_key()))
            .custom_created_at(Timestamp::tweaked(0..2 * 24 * 60 * 60))
            .sign_with_keys(&ephemeral_keys)
            .expect("Failed to create gift wrap");

        println!("Gift wrap created manually: {:?}", gift_wrap.id);

        // Verify we can decrypt it
        let decrypted_seal_json = nip44::decrypt(
            recipient_keys.secret_key(),
            &gift_wrap.pubkey,
            &gift_wrap.content,
        ).expect("Failed to decrypt gift wrap");

        let seal_from_wrap: Event = serde_json::from_str(&decrypted_seal_json).unwrap();

        let decrypted_rumor_json = nip44::decrypt(
            recipient_keys.secret_key(),
            &seal_from_wrap.pubkey,
            &seal_from_wrap.content,
        ).expect("Failed to decrypt seal");

        let rumor_from_seal: UnsignedEvent = serde_json::from_str(&decrypted_rumor_json).unwrap();

        assert_eq!(rumor_from_seal.content, content);
        println!("✅ Manual gift wrap roundtrip successful!");
    }
}

fn main() {
    // Run with: cargo test --bin test_gift_wrap -- --nocapture
    println!("Run tests with: cargo test --bin test_gift_wrap -- --nocapture");
}