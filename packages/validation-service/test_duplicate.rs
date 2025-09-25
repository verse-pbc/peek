use nostr_sdk::prelude::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Setup client
    let keys = Keys::parse(std::env::var("COMMUNITIES2")?)?;
    let client = Client::new(&keys);
    client.add_relay("wss://communities2.nos.social").await?;
    client.connect().await;
    
    let test_user = "5463f0b02cdc1b7fef73e9fcb0cc6a9e9611224adddfcff7507c3b9235a923c2";
    let group_id = "peek-550e8400-e29b-41d4-a716-446655440000";
    
    // Try to add member (should already exist from our previous test)
    let event = EventBuilder::new(
        Kind::from(9000),
        "",
    )
    .tags([
        Tag::custom(TagKind::Custom("h".into()), [group_id.to_string()]),
        Tag::custom(TagKind::Custom("p".into()), [test_user.to_string(), "member".to_string()]),
    ])
    .sign_with_keys(&keys)?;
    
    println!("Sending duplicate member addition...");
    match client.send_event(event).await {
        Ok(output) => {
            println!("OK response: {:?}", output);
        }
        Err(e) => {
            println!("Error response: {}", e);
        }
    }
    
    Ok(())
}
