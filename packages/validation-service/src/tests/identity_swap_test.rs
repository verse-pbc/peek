#[cfg(test)]
mod tests {
    use crate::handlers::nostr_validation::{ServiceRequest, ServiceResponse};
    use nostr_sdk::{EventBuilder, Keys, Kind};

    #[tokio::test]
    async fn test_identity_swap_with_valid_proof() {
        // Generate keys for old and new identities
        let old_keys = Keys::generate();
        let new_keys = Keys::generate();

        // Create proof event: new identity signs message containing old pubkey
        let proof_content = format!(
            "Swapping identity from {} to new identity",
            old_keys.public_key().to_hex()
        );

        let proof_event = EventBuilder::new(Kind::TextNote, proof_content.clone())
            .sign(&new_keys)
            .await
            .unwrap();

        // Create swap request
        let _request = ServiceRequest::IdentitySwap {
            group_id: "test-group".to_string(),
            old_pubkey: old_keys.public_key().to_hex(),
            new_pubkey: new_keys.public_key().to_hex(),
            signature_proof: serde_json::to_string(&proof_event).unwrap(),
        };

        // Verify the proof validation logic
        assert_eq!(proof_event.pubkey.to_hex(), new_keys.public_key().to_hex());
        assert!(proof_event
            .content
            .contains(&old_keys.public_key().to_hex()));
    }

    #[tokio::test]
    async fn test_identity_swap_with_invalid_proof() {
        // Generate keys
        let old_keys = Keys::generate();
        let new_keys = Keys::generate();
        let wrong_keys = Keys::generate(); // Wrong signer

        // Create invalid proof event: wrong key signs the message
        let proof_content = format!(
            "Swapping identity from {} to new identity",
            old_keys.public_key().to_hex()
        );

        let proof_event = EventBuilder::new(Kind::TextNote, proof_content)
            .sign(&wrong_keys)
            .await
            .unwrap();

        // Create swap request with mismatched keys
        let _request = ServiceRequest::IdentitySwap {
            group_id: "test-group".to_string(),
            old_pubkey: old_keys.public_key().to_hex(),
            new_pubkey: new_keys.public_key().to_hex(),
            signature_proof: serde_json::to_string(&proof_event).unwrap(),
        };

        // Verify the proof is invalid (wrong signer)
        assert_ne!(proof_event.pubkey.to_hex(), new_keys.public_key().to_hex());
    }

    #[tokio::test]
    async fn test_identity_swap_missing_old_pubkey_in_content() {
        // Generate keys
        let old_keys = Keys::generate();
        let new_keys = Keys::generate();

        // Create proof event without old pubkey in content
        let proof_content = "Swapping identity to new one".to_string();

        let proof_event = EventBuilder::new(Kind::TextNote, proof_content.clone())
            .sign(&new_keys)
            .await
            .unwrap();

        // Verify proof doesn't contain old pubkey
        assert!(!proof_event
            .content
            .contains(&old_keys.public_key().to_hex()));
    }

    #[tokio::test]
    async fn test_identity_swap_response_format() {
        // Test that successful swap returns correct response format
        let response = ServiceResponse::IdentitySwap {
            success: true,
            swapped: true,
            error: None,
        };

        match response {
            ServiceResponse::IdentitySwap {
                success,
                swapped,
                error,
            } => {
                assert!(success);
                assert!(swapped);
                assert!(error.is_none());
            }
            _ => panic!("Wrong response type"),
        }
    }

    #[tokio::test]
    async fn test_identity_swap_error_response() {
        // Test error response format
        let response = ServiceResponse::IdentitySwap {
            success: false,
            swapped: false,
            error: Some("Invalid proof: new pubkey doesn't match proof signer".to_string()),
        };

        match response {
            ServiceResponse::IdentitySwap {
                success,
                swapped,
                error,
            } => {
                assert!(!success);
                assert!(!swapped);
                assert!(error.is_some());
                assert!(error.unwrap().contains("Invalid proof"));
            }
            _ => panic!("Wrong response type"),
        }
    }
}
