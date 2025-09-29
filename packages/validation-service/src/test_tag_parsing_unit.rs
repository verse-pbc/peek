#[cfg(test)]
mod tests {
    use nostr_sdk::prelude::*;

    #[test]
    fn test_parse_geohash_from_kind_39000_event() {
        // This is the actual event from the relay
        let event_json = r#"{
            "kind":39000,
            "id":"fde9e439632c86a155021f3f67afc2372a2658ffc740c0c0a014a1c2f2570a66",
            "pubkey":"9e7e5ca2d3a0e4c6fea37178d0782b175c3270d26d2b6f2fd8d23e352229bc07",
            "created_at":1759163304,
            "tags":[
                ["d","peek-3a7e5c59-c0a1-4876-acf1-56189b86aa0d"],
                ["name","Community 3a7e5c59"],
                ["private"],
                ["closed"],
                ["about","Location-based community"],
                ["picture",""],
                ["g","eyzvmm07"],
                ["dg","eyzvmhy75"],
                ["original_relay","wss://communities2.nos.social"],
                ["nonbroadcast"]
            ],
            "content":"",
            "sig":"08c71fefc7b6c91e80e4734d5b4eabc9c20945415e6d8988fb100c601c0df1bf3f8402aff5aaad85814869aeac684501de63afb5ada05c1d9175d3fa6d4a5364"
        }"#;

        let event = Event::from_json(event_json).unwrap();

        let mut geohash = None;
        let mut display_geohash = None;
        let mut name = String::new();

        println!("Event has {} tags", event.tags.len());

        for tag in event.tags.iter() {
            println!("Tag: {:?}", tag);
            println!("  Tag kind: {:?}", tag.kind());
            println!("  Tag as_slice: {:?}", tag.as_slice());
            println!("  Tag content: {:?}", tag.content());

            // Check if it's a single-letter tag
            if let TagKind::SingleLetter(single_letter) = tag.kind() {
                println!(
                    "  Single letter tag detected: {:?}",
                    single_letter.character
                );
                if single_letter.character == Alphabet::G {
                    if let Some(content) = tag.content() {
                        println!("  Found 'g' tag with content: '{}'", content);
                        geohash = Some(content.to_string());
                    }
                }
            }

            // Check for the special Name tag kind
            if matches!(tag.kind(), TagKind::Name) {
                if let Some(content) = tag.content() {
                    println!("  Found 'name' tag with content: '{}'", content);
                    name = content.to_string();
                }
            }

            // Check if it's a custom tag
            if let TagKind::Custom(tag_name) = tag.kind() {
                println!("  Custom tag detected: '{}'", tag_name);
                match tag_name.as_ref() {
                    "dg" => {
                        if let Some(content) = tag.content() {
                            println!("  Found 'dg' tag with content: '{}'", content);
                            display_geohash = Some(content.to_string());
                        }
                    }
                    "g" => {
                        // This shouldn't happen - 'g' is a single letter
                        println!("  WARNING: 'g' matched as Custom tag!");
                        if let Some(content) = tag.content() {
                            println!("  'g' tag content: '{}'", content);
                        }
                    }
                    _ => {}
                }
            }
        }

        // Assertions
        assert_eq!(name, "Community 3a7e5c59", "Name should be parsed");
        assert_eq!(
            geohash,
            Some("eyzvmm07".to_string()),
            "Geohash 'g' tag should be parsed"
        );
        assert_eq!(
            display_geohash,
            Some("eyzvmhy75".to_string()),
            "Display geohash 'dg' tag should be parsed"
        );
    }

    #[test]
    fn test_single_letter_vs_custom_tags() {
        // Test that single letters are parsed as SingleLetter, not Custom
        // And that some tags have special kinds (like "name" -> TagKind::Name)
        let test_cases = vec![
            (vec!["g".to_string(), "test123".to_string()], true, false), // SingleLetter
            (vec!["p".to_string(), "pubkey123".to_string()], true, false), // SingleLetter
            (vec!["e".to_string(), "event123".to_string()], true, false), // SingleLetter
            (
                vec!["dg".to_string(), "display123".to_string()],
                false,
                true,
            ), // Custom
            (
                vec!["name".to_string(), "Test Name".to_string()],
                false,
                false,
            ), // Special TagKind::Name
        ];

        for (tag_array, expect_single_letter, expect_custom) in test_cases {
            let tag_name = tag_array[0].clone();
            let tag = Tag::parse(tag_array).unwrap();

            println!("Testing tag '{}': kind = {:?}", tag_name, tag.kind());

            if expect_single_letter {
                assert!(
                    matches!(tag.kind(), TagKind::SingleLetter(_)),
                    "Tag '{}' should be SingleLetter, but was {:?}",
                    tag_name,
                    tag.kind()
                );
            } else if expect_custom {
                assert!(
                    matches!(tag.kind(), TagKind::Custom(_)),
                    "Tag '{}' should be Custom, but was {:?}",
                    tag_name,
                    tag.kind()
                );
            } else {
                // It's a special tag kind (like Name)
                assert!(
                    !matches!(tag.kind(), TagKind::SingleLetter(_)) && !matches!(tag.kind(), TagKind::Custom(_)),
                    "Tag '{}' should have a special TagKind (not SingleLetter or Custom), but was {:?}",
                    tag_name,
                    tag.kind()
                );
            }
        }
    }
}
