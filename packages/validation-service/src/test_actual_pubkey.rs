use nostr_sdk::prelude::*;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // These are the actual pubkeys from the failing logs
    let sender_pubkey_hex = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    let recipient_pubkey_hex = "5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f";

    println!("Testing with actual pubkeys from logs:");
    println!("Sender (service): {}", sender_pubkey_hex);
    println!("Recipient (client): {}", recipient_pubkey_hex);

    // Create Keys for sender (service)
    let sender_keys =
        Keys::parse("0000000000000000000000000000000000000000000000000000000000000001")?;

    // Verify sender pubkey matches
    assert_eq!(sender_keys.public_key().to_hex(), sender_pubkey_hex);
    println!("✓ Sender pubkey matches");

    // Parse recipient pubkey
    let recipient_pubkey = PublicKey::from_hex(recipient_pubkey_hex)?;
    println!(
        "✓ Recipient pubkey parsed successfully: {}",
        recipient_pubkey.to_hex()
    );

    // Create a rumor
    let content = json!({
        "type": "preview_response",
        "success": true,
        "name": "",
        "picture": "",
        "about": "Location-based community at -34.9189, -56.1613",
        "rules": null,
        "member_count": 0,
        "is_public": true,
        "is_open": true,
        "created_at": 1758224477,
        "error": null
    })
    .to_string();

    let rumor = UnsignedEvent::new(
        sender_keys.public_key(),
        Timestamp::now(),
        Kind::from(27493),
        vec![Tag::custom(
            TagKind::SingleLetter(SingleLetterTag::lowercase(Alphabet::E)),
            vec!["8562ea0730d33860330aadaf2c795ec4dd56300a25b7b07de88a7beb3642b6c7".to_string()],
        )],
        content.clone(),
    );

    println!("\n📝 Rumor created with content: {} chars", content.len());
    println!("   Rumor pubkey: {}", rumor.pubkey.to_hex());
    println!("   Rumor kind: {}", rumor.kind.as_u16());

    // Try to create seal - THIS IS WHERE IT FAILS IN PRODUCTION
    println!("\n🔐 Attempting to create seal...");

    match EventBuilder::seal(&sender_keys, &recipient_pubkey, rumor.clone()).await {
        Ok(builder) => {
            println!("✓ EventBuilder::seal succeeded!");

            let seal = builder.sign_with_keys(&sender_keys)?;
            println!("✓ Seal signed successfully: {}", seal.id);

            // Try to create gift wrap
            println!("\n🎁 Attempting to create gift wrap...");
            match EventBuilder::gift_wrap_from_seal(&recipient_pubkey, &seal, vec![]) {
                Ok(gift_wrap) => {
                    println!("✅ SUCCESS: Gift wrap created!");
                    println!("   Gift wrap ID: {}", gift_wrap.id);
                    println!("   Ephemeral pubkey: {}", gift_wrap.pubkey.to_hex());
                }
                Err(e) => {
                    println!("❌ FAILED at gift_wrap_from_seal: {:?}", e);
                    println!("   Error type: {}", e);
                }
            }
        }
        Err(e) => {
            println!("❌ FAILED at EventBuilder::seal: {:?}", e);
            println!("   Error type: {}", e);

            // Try alternate approach
            println!("\n🔄 Trying alternate approach with parsed PublicKey...");

            // Try parsing in different ways
            let alt_pubkey = PublicKey::from_hex(recipient_pubkey_hex)?;
            println!("   Alt pubkey: {}", alt_pubkey.to_hex());

            match EventBuilder::seal(&sender_keys, &alt_pubkey, rumor).await {
                Ok(_) => println!("✓ Alternate approach worked!"),
                Err(e) => {
                    println!("❌ Alternate approach also failed: {}", e);

                    // Check if the pubkey itself is valid
                    println!("\n🔍 Debugging pubkey:");
                    println!("   Hex: {}", recipient_pubkey_hex);
                    println!("   Length: {}", recipient_pubkey_hex.len());
                    println!("   Is 64 chars: {}", recipient_pubkey_hex.len() == 64);
                    println!("   NPub: {}", recipient_pubkey.to_bech32()?);

                    // Try to use the pubkey in other operations
                    println!("\n🧪 Testing pubkey in other operations:");

                    // Try NIP-44 encryption
                    use nostr_sdk::nips::nip44;
                    match nip44::encrypt(
                        sender_keys.secret_key(),
                        &recipient_pubkey,
                        "test",
                        nip44::Version::default(),
                    ) {
                        Ok(_) => println!("   ✓ NIP-44 encryption works"),
                        Err(e) => println!("   ❌ NIP-44 encryption failed: {}", e),
                    }
                }
            }
        }
    }

    Ok(())
}
