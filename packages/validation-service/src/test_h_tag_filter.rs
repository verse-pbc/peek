#[cfg(test)]
mod tests {
    use nostr_sdk::prelude::*;

    #[test]
    fn test_h_tag_filter_serialization() {
        // Test that h-tag filter generates correct JSON format
        let group_id = "peek-123e4567-e89b-12d3-a456-426614174000";

        // Create filter using custom_tag with h-tag
        let filter = Filter::new()
            .kind(Kind::from(39000))
            .custom_tag(SingleLetterTag::lowercase(Alphabet::H), group_id)
            .limit(1);

        let json = filter.as_json();
        println!("Generated filter JSON: {}", json);

        // Verify the JSON contains the correct h-tag format
        assert!(json.contains("\"#h\""));
        assert!(json.contains(&format!("[\"{}\"]", group_id)));
        assert!(json.contains("\"kinds\":[39000]"));
        assert!(json.contains("\"limit\":1"));

        // The complete expected format should be:
        // {"#h":["peek-123e4567-e89b-12d3-a456-426614174000"],"kinds":[39000],"limit":1}
        let expected_parts = [
            &format!("\"#h\":[\"{}\"]", group_id),
            "\"kinds\":[39000]",
            "\"limit\":1"
        ];

        for part in expected_parts {
            assert!(json.contains(part), "Missing expected part: {}", part);
        }
    }

    #[test]
    fn test_h_tag_filter_d_tag_difference() {
        // NIP-29 specifies:
        // - User events (messages) use h-tag with group-id
        // - Metadata events use d-tag with group-id
        // This test verifies we can distinguish between them

        let group_id = "peek-123e4567-e89b-12d3-a456-426614174000";

        // Filter for metadata events (kind 39000) should use d-tag
        let metadata_filter = Filter::new()
            .kind(Kind::from(39000))
            .identifier(group_id)  // This creates a d-tag filter
            .limit(1);

        let metadata_json = metadata_filter.as_json();
        println!("Metadata filter JSON: {}", metadata_json);

        // Should contain #d tag, not #h tag
        assert!(metadata_json.contains("\"#d\""));
        assert!(!metadata_json.contains("\"#h\""));

        // Filter for user events in group should use h-tag
        let user_events_filter = Filter::new()
            .kinds([Kind::TextNote, Kind::from(1)])  // Regular user events
            .custom_tag(SingleLetterTag::lowercase(Alphabet::H), group_id)
            .limit(50);

        let user_json = user_events_filter.as_json();
        println!("User events filter JSON: {}", user_json);

        // Should contain #h tag, not #d tag
        assert!(user_json.contains("\"#h\""));
        assert!(!user_json.contains("\"#d\""));
    }
}