use uuid::Uuid;

use crate::config::Config;
use crate::libraries::invite_creator::{InviteCreator, InviteConfig};

/// Create a NIP-29 invite code for the community
pub async fn create_invite(
    config: &Config,
    community_id: &Uuid,
    user_pubkey: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    // Check if admin key is configured
    if config.admin_nsec.is_none() {
        return Err("Admin private key not configured".into());
    }

    // Create invite creator
    let invite_config = InviteConfig::from(config);
    let creator = InviteCreator::new(invite_config)
        .await
        .map_err(|e| format!("Failed to initialize invite creator: {}", e))?;

    // Create invite with retry
    let result = creator.create_invite_with_retry(
        community_id,
        Some(user_pubkey),
        3,  // Max 3 retries
    )
    .await
    .map_err(|e| format!("Failed to create invite: {}", e))?;

    // Disconnect from relay
    creator.disconnect().await.ok();

    Ok(result.invite_code)
}