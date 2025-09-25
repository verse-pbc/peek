use nostr_sdk::prelude::*;

fn main() {
    // The problem: Tag::custom() expects the first parameter in the vec to be the tag name!
    // When creating with Tag::custom, the values should NOT include the tag name
    let tags = vec![
        // WRONG way (includes tag name in values):
        Tag::custom(
            TagKind::Custom("name".into()),
            vec!["name".to_string(), "Community 550e8400".to_string()],
        ),
        // RIGHT way (values only):
        Tag::custom(
            TagKind::Custom("name".into()),
            vec!["Community 550e8400".to_string()],
        ),
        Tag::custom(
            TagKind::Custom("about".into()),
            vec!["Location-based community".to_string()],
        ),
        Tag::custom(TagKind::Custom("picture".into()), vec!["".to_string()]),
    ];

    // Test how to access tag values
    for tag in tags {
        if let TagKind::Custom(tag_name) = tag.kind() {
            println!("Tag name: {}", tag_name);

            // Try content() method
            if let Some(content) = tag.content() {
                println!("  content() returns: '{}'", content);
            } else {
                println!("  content() returns: None");
            }

            // Try as_slice()
            let values = tag.as_slice();
            println!("  as_slice() returns {} values:", values.len());
            for (i, v) in values.iter().enumerate() {
                println!("    [{}]: '{}'", i, v);
            }

            // Try to_vec()
            let vec = tag.to_vec();
            println!("  as_vec() returns {} values:", vec.len());
            for (i, v) in vec.iter().enumerate() {
                println!("    [{}]: '{}'", i, v);
            }
        }
    }
}
