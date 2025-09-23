use nostr_sdk::prelude::*;

fn main() {
    println!("=== Nostr SDK Public Key Format Investigation ===\n");

    // Test various public key formats
    let test_cases = vec![
        ("hex_lowercase", "5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f"),
        ("hex_uppercase", "5504598D51F267A0A0A859EFC9D424AEEB0FCC5EC78263536FFF141123B8E95F"),
        ("npub", "npub12h8yzvxk9j4e66p69rvqf9fzpez8w6q8jmuutl5ajcxccvxrxcjslx65kl"),
        ("hex_with_0x", "0x5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f"),
    ];

    for (name, input) in test_cases {
        println!("Testing {}: {}", name, input);

        // Try from_hex
        match PublicKey::from_hex(input) {
            Ok(pk) => {
                println!("  ✓ from_hex succeeded");
                println!("    -> to_hex(): {}", pk.to_hex());
                println!("    -> to_bech32(): {}", pk.to_bech32().unwrap());
            }
            Err(e) => println!("  ✗ from_hex failed: {:?}", e),
        }

        // Try from_bech32
        match PublicKey::from_bech32(input) {
            Ok(pk) => {
                println!("  ✓ from_bech32 succeeded");
                println!("    -> to_hex(): {}", pk.to_hex());
            }
            Err(e) => println!("  ✗ from_bech32 failed: {:?}", e),
        }

        // Try parse (auto-detect)
        match PublicKey::parse(input) {
            Ok(pk) => {
                println!("  ✓ parse succeeded");
                println!("    -> to_hex(): {}", pk.to_hex());
            }
            Err(e) => println!("  ✗ parse failed: {:?}", e),
        }

        println!();
    }

    // Test with actual rumor pubkey from our logs
    println!("=== Testing actual pubkey from logs ===");
    let actual_pubkey = "5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f";
    match PublicKey::from_hex(actual_pubkey) {
        Ok(pk) => {
            println!("✓ Successfully parsed actual pubkey");
            println!("  Hex: {}", pk.to_hex());
            println!("  Bech32: {}", pk.to_bech32().unwrap());

            // Test gift wrap directly
            println!("\nTesting gift_wrap with this pubkey...");

            // Create a simple client for testing
            let keys = Keys::generate();
            let client = Client::new(keys.clone());

            // Create a test rumor
            let rumor = UnsignedEvent::new(
                keys.public_key(),
                Timestamp::now(),
                Kind::from(27493),
                vec![],
                "test content".to_string(),
            );

            // Try gift wrapping
            let runtime = tokio::runtime::Runtime::new().unwrap();
            runtime.block_on(async {
                match client.gift_wrap(&pk, rumor, vec![]).await {
                    Ok(output) => {
                        println!("✓ Gift wrap succeeded! Event ID: {}", output.id());
                    }
                    Err(e) => {
                        println!("✗ Gift wrap failed: {:?}", e);

                        // Try to understand the error better
                        let error_str = format!("{:?}", e);
                        if error_str.contains("malformed public key") {
                            println!("\nThe error suggests the public key format is wrong.");
                            println!("Let's check the internal representation:");
                            println!("  PublicKey bytes: {:?}", pk.as_bytes());
                            println!("  PublicKey struct debug: {:?}", pk);
                        }
                    }
                }
            });
        }
        Err(e) => {
            println!("✗ Failed to parse actual pubkey: {:?}", e);
        }
    }
}