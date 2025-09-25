use nostr_sdk::prelude::*;
use serde_json::Value;
use std::fs;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Testing Rust decryption of JavaScript-generated gift wrap ===\n");

    // Read the JS-generated gift wrap
    let js_data_str = fs::read_to_string("../../js_gift_wrap.json")?;
    let js_data: Value = serde_json::from_str(&js_data_str)?;

    println!("Loaded gift wrap from JavaScript:");
    println!("  Gift wrap ID: {}", js_data["gift_wrap"]["id"]);
    println!("  Ephemeral pubkey: {}", js_data["gift_wrap"]["pubkey"]);
    println!("  Recipient pubkey: {}", js_data["recipient_pubkey"]);
    println!("  Expected content: {}", js_data["rumor"]["content"]);

    // Parse recipient keys
    let recipient_secret = js_data["recipient_secret"].as_str().unwrap();
    let recipient_keys = Keys::parse(recipient_secret)?;

    println!(
        "\nRecipient pubkey from keys: {}",
        recipient_keys.public_key().to_hex()
    );

    // Reconstruct the gift wrap event
    let gift_wrap = Event::from_json(js_data["gift_wrap"].to_string())?;

    println!("\n=== Attempting decryption ===");

    use nostr_sdk::nips::nip44;

    // Step 1: Decrypt outer layer (gift wrap)
    println!("\n1. Decrypting outer layer...");
    println!("   Using ephemeral pubkey: {}", gift_wrap.pubkey.to_hex());

    let decrypted_seal_json = nip44::decrypt(
        recipient_keys.secret_key(),
        &gift_wrap.pubkey,
        &gift_wrap.content,
    )?;

    println!("   ✓ Successfully decrypted outer layer");

    let seal: Event = serde_json::from_str(&decrypted_seal_json)?;
    println!("   Seal kind: {}", seal.kind.as_u16());
    println!("   Seal pubkey: {}", seal.pubkey.to_hex());

    // Step 2: Decrypt inner layer (seal)
    println!("\n2. Decrypting inner layer (seal)...");
    println!("   Using seal pubkey: {}", seal.pubkey.to_hex());

    let decrypted_rumor_json =
        nip44::decrypt(recipient_keys.secret_key(), &seal.pubkey, &seal.content)?;

    println!("   ✓ Successfully decrypted seal");

    let rumor: Value = serde_json::from_str(&decrypted_rumor_json)?;
    println!("\n3. Extracted rumor:");
    println!("   Kind: {}", rumor["kind"]);
    println!("   Content: {}", rumor["content"]);
    println!("   Tags: {:?}", rumor["tags"]);

    // Verify content matches
    let expected_content = js_data["rumor"]["content"].as_str().unwrap();
    let actual_content = rumor["content"].as_str().unwrap();

    if actual_content == expected_content {
        println!("\n✅ SUCCESS: Content matches expected value!");
    } else {
        println!("\n❌ FAILURE: Content mismatch");
        println!("   Expected: {}", expected_content);
        println!("   Got: {}", actual_content);
    }

    Ok(())
}
