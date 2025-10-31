//! NIP-19 mention parsing and profile resolution.
//!
//! This module provides functionality to extract nostr:npub mentions from text,
//! resolve them to user profiles, and format them for push notifications.

use nostr_sdk::prelude::*;
use regex::Regex;
use std::backtrace::Backtrace;
use std::collections::HashMap;

/// Profile metadata extracted from kind 0 events.
#[allow(dead_code)] // Will be used when profile fetching is implemented
#[derive(Debug, Clone)]
pub struct ProfileMetadata {
    pub pubkey: String,
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub picture: Option<String>,
}

/// Error type for mention parsing operations.
#[derive(Debug)]
pub struct MentionError {
    kind: MentionErrorKind,
    backtrace: Backtrace,
}

#[derive(Debug)]
enum MentionErrorKind {
    InvalidNpub(String),
    ProfileNotFound(String),
    RelayError(String),
}

impl MentionError {
    /// Check if error is due to invalid npub format.
    #[allow(dead_code)] // Will be used in error handling
    pub fn is_invalid_npub(&self) -> bool {
        matches!(self.kind, MentionErrorKind::InvalidNpub(_))
    }

    /// Check if error is due to profile not found.
    #[allow(dead_code)] // Will be used in profile fetching
    pub fn is_profile_not_found(&self) -> bool {
        matches!(self.kind, MentionErrorKind::ProfileNotFound(_))
    }

    fn invalid_npub(npub: impl Into<String>) -> Self {
        Self {
            kind: MentionErrorKind::InvalidNpub(npub.into()),
            backtrace: Backtrace::capture(),
        }
    }

    #[allow(dead_code)] // Will be used in profile fetching
    fn profile_not_found(pubkey: impl Into<String>) -> Self {
        Self {
            kind: MentionErrorKind::ProfileNotFound(pubkey.into()),
            backtrace: Backtrace::capture(),
        }
    }

    #[allow(dead_code)] // Will be used in profile fetching
    fn relay_error(error: impl Into<String>) -> Self {
        Self {
            kind: MentionErrorKind::RelayError(error.into()),
            backtrace: Backtrace::capture(),
        }
    }
}

impl std::fmt::Display for MentionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.kind {
            MentionErrorKind::InvalidNpub(npub) => write!(f, "Invalid npub format: {}", npub),
            MentionErrorKind::ProfileNotFound(pubkey) => {
                write!(f, "Profile not found for pubkey: {}", pubkey)
            }
            MentionErrorKind::RelayError(err) => write!(f, "Relay error: {}", err),
        }?;
        write!(f, "\n{}", self.backtrace)
    }
}

impl std::error::Error for MentionError {}

/// Extract NIP-19 npub mentions from text.
///
/// Searches for all `nostr:npub...` patterns in the given text
/// and returns the npub identifiers. Case-insensitive matching.
///
/// # Examples
///
/// ```
/// let content = "Hey nostr:npub1abc...!";
/// let mentions = extract_npub_mentions(content);
/// assert_eq!(mentions.len(), 1);
/// ```
pub fn extract_npub_mentions(content: impl AsRef<str>) -> Vec<String> {
    let content = content.as_ref();
    let re = Regex::new(r"(?i)nostr:(npub[a-z0-9]{58,60})").unwrap();

    re.captures_iter(content)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_lowercase()))
        .collect()
}

/// Decode NIP-19 npub string to hex pubkey.
///
/// Converts a bech32-encoded npub identifier to a hex public key string.
///
/// # Examples
///
/// ```
/// let hex = npub_to_pubkey("npub180cvv...").unwrap();
/// assert_eq!(hex.len(), 64);
/// ```
///
/// # Errors
///
/// Returns `MentionError::InvalidNpub` if the npub format is invalid
/// or if decoding fails.
pub fn npub_to_pubkey(npub: &str) -> Result<String, MentionError> {
    // Try to decode as bech32
    let public_key = PublicKey::from_bech32(npub).map_err(|_| MentionError::invalid_npub(npub))?;

    Ok(public_key.to_hex())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test 1: Extract npub mentions from text
    #[test]
    fn test_extract_npub_mentions_from_simple_text() {
        let content =
            "Hello nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6!";
        let mentions = extract_npub_mentions(content);

        assert_eq!(mentions.len(), 1);
        assert_eq!(
            mentions[0],
            "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6"
        );
    }

    #[test]
    fn test_extract_multiple_npub_mentions() {
        let content = "Hey nostr:npub1s33sw0qr2tyspysvlesvdjkjresort7reuskmjz3uhuzavxqryv2sj3vftm and nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6 check this out!";
        let mentions = extract_npub_mentions(content);

        assert_eq!(mentions.len(), 2);
    }

    #[test]
    fn test_extract_no_mentions() {
        let content = "Just a regular message without mentions";
        let mentions = extract_npub_mentions(content);

        assert_eq!(mentions.len(), 0);
    }

    #[test]
    fn test_extract_mentions_case_insensitive() {
        let content = "NOSTR:NPUB180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6 and Nostr:Npub1s33sw0qr2tyspysvlesvdjkjresort7reuskmjz3uhuzavxqryv2sj3vftm";
        let mentions = extract_npub_mentions(content);

        assert_eq!(mentions.len(), 2);
    }

    // Test 2: Decode npub to pubkey
    #[test]
    fn test_npub_to_pubkey_valid() {
        let npub = "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";
        let result = npub_to_pubkey(npub);

        assert!(result.is_ok());
        let pubkey = result.unwrap();
        assert_eq!(pubkey.len(), 64); // Hex pubkey is 64 chars
        assert_eq!(
            pubkey,
            "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"
        );
    }

    #[test]
    fn test_npub_to_pubkey_invalid() {
        let npub = "invalid_npub";
        let result = npub_to_pubkey(npub);

        assert!(result.is_err());
    }

    #[test]
    fn test_npub_to_pubkey_wrong_prefix() {
        let nsec = "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5";
        let result = npub_to_pubkey(nsec);

        assert!(result.is_err());
    }

    // Test 7: Error handling
    #[test]
    fn test_mention_error_is_invalid_npub() {
        let error = MentionError::invalid_npub("bad_npub");
        assert!(error.is_invalid_npub());
        assert!(!error.is_profile_not_found());
    }

    #[test]
    fn test_mention_error_display() {
        let error = MentionError::invalid_npub("bad_npub");
        let display = format!("{}", error);
        assert!(display.contains("Invalid npub format"));
    }
}

/// Service for fetching profile metadata from Nostr relays.
#[allow(dead_code)] // Will be used when integrated with push notifications
pub struct ProfileService {
    relay_urls: Vec<String>,
}

#[allow(dead_code)]
impl ProfileService {
    /// Create profile service with metadata relay URLs.
    pub fn new(relay_urls: Vec<String>) -> Self {
        Self { relay_urls }
    }

    /// Fetch profile metadata for a single pubkey.
    ///
    /// Queries kind 0 (metadata) events from configured relays.
    ///
    /// # Errors
    ///
    /// Returns error if relay connection fails.
    pub async fn fetch_profile(
        &self,
        pubkey: &str,
    ) -> Result<Option<ProfileMetadata>, MentionError> {
        // Create temporary client for this query
        let keys = Keys::generate();
        let client = Client::new(keys);

        // Add all configured relays
        for url in &self.relay_urls {
            client
                .add_relay(url)
                .await
                .map_err(|e| MentionError::relay_error(format!("Failed to add relay: {}", e)))?;
        }

        // Connect to relays
        client.connect().await;

        // Parse pubkey
        let public_key =
            PublicKey::from_hex(pubkey).map_err(|_| MentionError::invalid_npub(pubkey))?;

        // Query kind 0 (metadata) events
        let filter = Filter::new()
            .kind(Kind::Metadata)
            .author(public_key)
            .limit(1);

        let timeout = std::time::Duration::from_secs(5);
        let events = client
            .fetch_events(filter, timeout)
            .await
            .map_err(|e| MentionError::relay_error(format!("Failed to fetch events: {}", e)))?;

        // Disconnect after query
        client.disconnect().await;

        // Parse first event if found
        if let Some(event) = events.first() {
            match serde_json::from_str::<Metadata>(&event.content) {
                Ok(metadata) => Ok(Some(ProfileMetadata {
                    pubkey: pubkey.to_string(),
                    name: metadata.name,
                    display_name: metadata.display_name,
                    picture: metadata.picture,
                })),
                Err(_) => Ok(None), // Invalid metadata, return None
            }
        } else {
            Ok(None)
        }
    }

    /// Fetch multiple profiles in a single batch query.
    ///
    /// More efficient than individual queries when resolving multiple mentions.
    ///
    /// # Errors
    ///
    /// Returns error if relay connection fails.
    pub async fn fetch_profiles_batch(
        &self,
        pubkeys: &[String],
    ) -> Result<HashMap<String, ProfileMetadata>, MentionError> {
        if pubkeys.is_empty() {
            return Ok(HashMap::new());
        }

        // Create temporary client for this query
        let keys = Keys::generate();
        let client = Client::new(keys);

        // Add all configured relays
        for url in &self.relay_urls {
            client
                .add_relay(url)
                .await
                .map_err(|e| MentionError::relay_error(format!("Failed to add relay: {}", e)))?;
        }

        // Connect to relays
        client.connect().await;

        // Parse all pubkeys
        let public_keys: Vec<PublicKey> = pubkeys
            .iter()
            .filter_map(|pk| PublicKey::from_hex(pk).ok())
            .collect();

        if public_keys.is_empty() {
            return Ok(HashMap::new());
        }

        // Query kind 0 (metadata) events for all pubkeys
        let filter = Filter::new()
            .kind(Kind::Metadata)
            .authors(public_keys)
            .limit(pubkeys.len());

        let timeout = std::time::Duration::from_secs(10);
        let events = client
            .fetch_events(filter, timeout)
            .await
            .map_err(|e| MentionError::relay_error(format!("Failed to fetch events: {}", e)))?;

        // Disconnect after query
        client.disconnect().await;

        // Parse events into HashMap
        let mut profiles = HashMap::new();
        for event in events {
            if let Ok(metadata) = serde_json::from_str::<Metadata>(&event.content) {
                profiles.insert(
                    event.pubkey.to_hex(),
                    ProfileMetadata {
                        pubkey: event.pubkey.to_hex(),
                        name: metadata.name,
                        display_name: metadata.display_name,
                        picture: metadata.picture,
                    },
                );
            }
        }

        Ok(profiles)
    }

    /// Format content for push notifications by replacing mentions with friendly names.
    ///
    /// Replaces `nostr:npub...` mentions with `@name` or `@display_name`.
    /// Falls back to truncated npub format if profile not found or has no name.
    ///
    /// # Examples
    ///
    /// ```
    /// let service = ProfileService::new(relays);
    /// let formatted = service.format_content_for_push("Hello nostr:npub1...!").await?;
    /// // Returns: "Hello @jack!"
    /// ```
    ///
    /// # Errors
    ///
    /// Returns error if relay connection fails.
    pub async fn format_content_for_push(
        &self,
        content: impl AsRef<str>,
    ) -> Result<String, MentionError> {
        let content = content.as_ref();

        // Handle empty content
        if content.is_empty() {
            return Ok(String::new());
        }

        // Extract all npub mentions (returns lowercase normalized)
        let npub_mentions = extract_npub_mentions(content);

        // If no mentions, return original content
        if npub_mentions.is_empty() {
            return Ok(content.to_string());
        }

        // Convert npubs to pubkeys
        let mut npub_to_pubkey_map: HashMap<String, String> = HashMap::new();
        for npub in &npub_mentions {
            if let Ok(pubkey) = npub_to_pubkey(npub) {
                npub_to_pubkey_map.insert(npub.clone(), pubkey);
            }
        }

        // Fetch profiles in batch
        let pubkeys: Vec<String> = npub_to_pubkey_map.values().cloned().collect();
        let profiles = self.fetch_profiles_batch(&pubkeys).await?;

        // Build replacement map: npub -> friendly name
        let mut replacements: HashMap<String, String> = HashMap::new();
        for (npub, pubkey) in &npub_to_pubkey_map {
            let friendly_name = if let Some(profile) = profiles.get(pubkey) {
                // Try display_name first, then name, then truncated npub
                profile
                    .display_name
                    .clone()
                    .or_else(|| profile.name.clone())
                    .unwrap_or_else(|| truncate_npub(npub))
            } else {
                // Profile not found, use truncated npub
                truncate_npub(npub)
            };

            replacements.insert(npub.clone(), format!("@{}", friendly_name));
        }

        // Replace mentions in content - use regex to find and replace case-insensitively
        let re = Regex::new(r"(?i)nostr:(npub[a-z0-9]{58,60})").unwrap();
        let mut result = content.to_string();

        // Find all matches and collect them first (to avoid borrow checker issues)
        let matches: Vec<(String, usize, usize)> = re
            .captures_iter(&result)
            .map(|cap| {
                let full_match = cap.get(0).unwrap();
                let npub = cap.get(1).unwrap().as_str().to_lowercase();
                (npub, full_match.start(), full_match.end())
            })
            .collect();

        // Replace from end to start to maintain correct indices
        for (npub, start, end) in matches.iter().rev() {
            if let Some(replacement) = replacements.get(npub) {
                result.replace_range(start..end, replacement);
            }
        }

        Ok(result)
    }
}

/// Truncate npub to readable format: npub1xxxx...xxxxxx (first 10 + last 6 chars).
fn truncate_npub(npub: &str) -> String {
    if npub.len() >= 16 {
        format!("{}...{}", &npub[..10], &npub[npub.len() - 6..])
    } else {
        npub.to_string()
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;

    // Test helper to create service with test relays
    fn create_test_service() -> ProfileService {
        ProfileService::new(vec![
            "wss://relay.damus.io".to_string(),
            "wss://relay.nos.social".to_string(),
        ])
    }

    #[tokio::test]
    async fn test_fetch_profile_returns_none_for_nonexistent() {
        let service = create_test_service();
        let fake_pubkey = "0000000000000000000000000000000000000000000000000000000000000000";

        let result = service.fetch_profile(fake_pubkey).await;

        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_fetch_profile_returns_metadata_for_known_user() {
        let service = create_test_service();
        // Use jack@cash.app's pubkey (well-known, should have profile)
        let pubkey = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";

        let result = service.fetch_profile(pubkey).await;

        assert!(result.is_ok());
        let profile = result.unwrap();
        assert!(profile.is_some());

        if let Some(profile) = profile {
            assert_eq!(profile.pubkey, pubkey);
            // Jack should have a name or display_name
            assert!(profile.name.is_some() || profile.display_name.is_some());
        }
    }

    #[tokio::test]
    async fn test_fetch_profiles_batch_returns_multiple() {
        let service = create_test_service();
        let pubkeys = vec![
            "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2".to_string(), // jack
            "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d".to_string(), // another user
        ];

        let result = service.fetch_profiles_batch(&pubkeys).await;

        assert!(result.is_ok());
        let profiles = result.unwrap();

        // Should have at least one result (jack)
        assert!(!profiles.is_empty());
        assert!(profiles.contains_key(&pubkeys[0]));
    }

    #[tokio::test]
    async fn test_fetch_profiles_batch_empty_input() {
        let service = create_test_service();
        let pubkeys: Vec<String> = vec![];

        let result = service.fetch_profiles_batch(&pubkeys).await;

        assert!(result.is_ok());
        let profiles = result.unwrap();
        assert!(profiles.is_empty());
    }
}

#[cfg(test)]
mod format_tests {
    use super::*;

    // Test helper to create service with test relays
    fn create_test_service() -> ProfileService {
        ProfileService::new(vec![
            "wss://relay.damus.io".to_string(),
            "wss://relay.nos.social".to_string(),
        ])
    }

    // Test 1: Replace single mention with @name
    #[tokio::test]
    async fn test_format_single_mention_with_name() {
        let service = create_test_service();
        // Use jack@cash.app's npub (well-known, should have profile)
        let content =
            "Hello nostr:npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m!";

        let result = service.format_content_for_push(content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        // Should replace with @name or @display_name or truncated npub
        assert!(formatted.contains("@"));
        assert!(!formatted.contains("nostr:npub"));
    }

    // Test 2: Replace multiple mentions
    #[tokio::test]
    async fn test_format_multiple_mentions() {
        let service = create_test_service();
        // Use two well-known npubs (jack and another user)
        let content = "Hey nostr:npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m and nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6!";

        let result = service.format_content_for_push(content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        assert!(!formatted.contains("nostr:npub"));
        // Should have replaced both mentions
        let at_count = formatted.matches('@').count();
        assert!(at_count >= 2);
    }

    // Test 3: Handle missing profiles (use truncated npub)
    #[tokio::test]
    async fn test_format_missing_profile() {
        let service = create_test_service();
        // Generate a random npub that won't have a profile
        let random_keys = Keys::generate();
        let random_npub = random_keys.public_key().to_bech32().unwrap();
        let content = format!("Hello nostr:{}!", random_npub);

        let result = service.format_content_for_push(&content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        // Should truncate npub since profile not found
        // Format: @npub1xxxx...xxxxxx (first 10 chars + last 6 chars)
        assert!(formatted.contains(&format!("@{}...", &random_npub[..10])));
        assert!(formatted.contains(&random_npub[random_npub.len() - 6..]));
    }

    // Test 4: Handle profiles without names (use truncated npub)
    #[tokio::test]
    async fn test_format_profile_without_name() {
        let service = create_test_service();
        // Use a valid npub
        let content =
            "Message to nostr:npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6";

        let result = service.format_content_for_push(content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        // Should have some @mention format (either name or truncated npub)
        assert!(formatted.contains("@"));
        assert!(!formatted.contains("nostr:npub"));
    }

    // Test 5: Mixed content (mentions + regular text)
    #[tokio::test]
    async fn test_format_mixed_content() {
        let service = create_test_service();
        let content = "Check out this note from nostr:npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m about the event!";

        let result = service.format_content_for_push(content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        // Regular text should be preserved
        assert!(formatted.contains("Check out"));
        assert!(formatted.contains("about the event"));
        // Mention should be replaced
        assert!(!formatted.contains("nostr:npub"));
        assert!(formatted.contains("@"));
    }

    // Test 6: Empty content
    #[tokio::test]
    async fn test_format_empty_content() {
        let service = create_test_service();
        let content = "";

        let result = service.format_content_for_push(content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        assert_eq!(formatted, "");
    }

    // Test 7: No mentions (content unchanged)
    #[tokio::test]
    async fn test_format_no_mentions() {
        let service = create_test_service();
        let content = "Just a regular message without any mentions";

        let result = service.format_content_for_push(content).await;

        assert!(result.is_ok());
        let formatted = result.unwrap();
        assert_eq!(formatted, content);
    }
}
