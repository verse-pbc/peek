use nostr_sdk::prelude::*;
use serde_json::json;
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Fixed keys for reproducible testing
    // Sender (service) keys
    let sender_secret = "0000000000000000000000000000000000000000000000000000000000000001";
    let sender_keys = Keys::parse(sender_secret)?;

    // Recipient (client) keys
    let recipient_secret = "0000000000000000000000000000000000000000000000000000000000000002";
    let recipient_keys = Keys::parse(recipient_secret)?;

    println!("Sender pubkey: {}", sender_keys.public_key().to_hex());
    println!("Recipient pubkey: {}", recipient_keys.public_key().to_hex());

    // Create a rumor with a response
    let content = json!({
        "type": "preview_response",
        "success": true,
        "name": "Test Community",
        "member_count": 42
    }).to_string();

    let mut rumor = UnsignedEvent::new(
        sender_keys.public_key(),
        Timestamp::from(1700000000), // Fixed timestamp for reproducibility
        Kind::from(27493), // Response kind
        vec![Tag::custom(
            TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::E)),
            vec!["test-request-id".to_string()]
        )],
        content.clone(),
    );

    println!("\nCreating gift wrap...");

    // Create seal using EventBuilder
    let seal = EventBuilder::seal(&sender_keys, &recipient_keys.public_key(), rumor.clone())
        .await?
        .sign_with_keys(&sender_keys)?;

    println!("Seal created: {}", seal.id);

    // Create gift wrap from seal
    let gift_wrap = EventBuilder::gift_wrap_from_seal(
        &recipient_keys.public_key(),
        &seal,
        vec![]
    )?;

    println!("Gift wrap created: {}", gift_wrap.id);
    println!("Gift wrap ephemeral pubkey: {}", gift_wrap.pubkey.to_hex());

    // Export everything to JSON for JavaScript testing
    let export = json!({
        "sender_secret": sender_secret,
        "sender_pubkey": sender_keys.public_key().to_hex(),
        "recipient_secret": recipient_secret,
        "recipient_pubkey": recipient_keys.public_key().to_hex(),
        "rumor": {
            "id": rumor.id().to_hex(),
            "pubkey": rumor.pubkey.to_hex(),
            "created_at": rumor.created_at.as_u64(),
            "kind": rumor.kind.as_u16() as u64,
            "tags": rumor.tags,
            "content": rumor.content
        },
        "seal": {
            "id": seal.id.to_hex(),
            "pubkey": seal.pubkey.to_hex(),
            "created_at": seal.created_at.as_u64(),
            "kind": seal.kind.as_u16() as u64,
            "tags": seal.tags,
            "content": seal.content,
            "sig": format!("{:?}", seal.sig)
        },
        "gift_wrap": {
            "id": gift_wrap.id.to_hex(),
            "pubkey": gift_wrap.pubkey.to_hex(),
            "created_at": gift_wrap.created_at.as_u64(),
            "kind": gift_wrap.kind.as_u16() as u64,
            "tags": gift_wrap.tags,
            "content": gift_wrap.content,
            "sig": format!("{:?}", gift_wrap.sig)
        }
    });

    // Save to file
    let json_str = serde_json::to_string_pretty(&export)?;
    fs::write("rust_gift_wrap.json", &json_str)?;
    println!("\nExported to rust_gift_wrap.json");

    // Also test that we can decrypt our own gift wrap
    println!("\nTesting decryption with recipient keys...");

    use nostr_sdk::nips::nip44;

    // Decrypt outer layer (gift wrap)
    let decrypted_seal_json = nip44::decrypt(
        recipient_keys.secret_key(),
        &gift_wrap.pubkey,
        &gift_wrap.content,
    )?;

    println!("✓ Successfully decrypted outer layer");

    let seal_from_wrap: Event = serde_json::from_str(&decrypted_seal_json)?;
    println!("✓ Parsed seal from gift wrap");

    // Decrypt inner layer (seal)
    let decrypted_rumor_json = nip44::decrypt(
        recipient_keys.secret_key(),
        &seal_from_wrap.pubkey,
        &seal_from_wrap.content,
    )?;

    println!("✓ Successfully decrypted seal");

    let rumor_from_seal: UnsignedEvent = serde_json::from_str(&decrypted_rumor_json)?;
    println!("✓ Parsed rumor from seal");
    println!("✓ Rumor content: {}", rumor_from_seal.content);

    Ok(())
}