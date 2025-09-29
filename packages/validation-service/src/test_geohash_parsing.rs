use nostr_sdk::prelude::*;

fn main() {
    // Create a tag similar to what we see from the relay
    // The tag is ["g", "eyzvmm07"]
    let tag = Tag::parse(&["g", "eyzvmm07"]).unwrap();
    
    println!("Tag debug: {:?}", tag);
    println!("Tag kind: {:?}", tag.kind());
    
    // Test if this is a Custom tag
    if let TagKind::Custom(tag_name) = tag.kind() {
        println!("Tag name from Custom: '{}'", tag_name);
        println!("Content: {:?}", tag.content());
    }
    
    // Also test the as_slice method
    let slice = tag.as_slice();
    println!("Tag as_slice: {:?}", slice);
    
    // Test with a full event JSON
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
    println!("\nParsing event from JSON:");
    
    for tag in event.tags.iter() {
        if let TagKind::Custom(tag_name) = tag.kind() {
            if tag_name == "g" || tag_name == "dg" {
                println!("Found {} tag:", tag_name);
                println!("  content(): {:?}", tag.content());
                println!("  as_slice(): {:?}", tag.as_slice());
            }
        }
    }
}
