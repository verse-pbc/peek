use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub radius: f64,    // Geofence radius in meters (25m)
    pub accuracy: f64,  // Required GPS accuracy in meters (20m)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommunityStatus {
    Active,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Community {
    pub id: Uuid,                        // UUID v4 from QR code
    pub group_id: String,                // NIP-29 group identifier
    pub name: String,                    // Community display name
    pub description: Option<String>,     // Community description
    pub rules: Option<String>,           // Community rules/guidelines
    pub created_at: DateTime<Utc>,       // Creation timestamp
    pub creator_pubkey: String,          // Nostr pubkey of first scanner
    pub location: Location,              // Physical location details
    pub member_count: u32,               // Current member count
    pub relay: String,                   // Relay URL (wss://peek.hol.is)
    pub status: CommunityStatus,         // Active or archived
}

impl Community {
    /// Create a new community from the first QR scan
    pub fn new(
        id: Uuid,
        name: String,
        creator_pubkey: String,
        location: Location,
        relay: String,
    ) -> Self {
        Self {
            id,
            group_id: format!("peek_{}", id),
            name,
            description: None,
            rules: None,
            created_at: Utc::now(),
            creator_pubkey,
            location,
            member_count: 1, // Creator is first member
            relay,
            status: CommunityStatus::Active,
        }
    }

    /// Validate community data
    pub fn validate(&self) -> Result<(), ValidationError> {
        // Validate name length
        if self.name.is_empty() || self.name.len() > 100 {
            return Err(ValidationError::InvalidName);
        }

        // Validate description length
        if let Some(ref desc) = self.description {
            if desc.len() > 500 {
                return Err(ValidationError::DescriptionTooLong);
            }
        }

        // Validate GPS coordinates
        if self.location.latitude < -90.0 || self.location.latitude > 90.0 {
            return Err(ValidationError::InvalidLatitude);
        }

        if self.location.longitude < -180.0 || self.location.longitude > 180.0 {
            return Err(ValidationError::InvalidLongitude);
        }

        // Validate relay URL
        if !self.relay.starts_with("wss://") && !self.relay.starts_with("ws://") {
            return Err(ValidationError::InvalidRelayUrl);
        }

        // Validate creator pubkey format (basic check)
        if self.creator_pubkey.is_empty() {
            return Err(ValidationError::InvalidPubkey);
        }

        Ok(())
    }

    /// Check if the community is active
    pub fn is_active(&self) -> bool {
        matches!(self.status, CommunityStatus::Active)
    }

    /// Archive the community (admin action)
    pub fn archive(&mut self) {
        self.status = CommunityStatus::Archived;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityPreview {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub member_count: u32,
    pub location: Location,
    pub created_at: DateTime<Utc>,
}

impl From<&Community> for CommunityPreview {
    fn from(community: &Community) -> Self {
        Self {
            id: community.id,
            name: community.name.clone(),
            description: community.description.clone(),
            member_count: community.member_count,
            location: community.location.clone(),
            created_at: community.created_at,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("Community name must be between 1 and 100 characters")]
    InvalidName,
    
    #[error("Description cannot exceed 500 characters")]
    DescriptionTooLong,
    
    #[error("Invalid latitude: must be between -90 and 90")]
    InvalidLatitude,
    
    #[error("Invalid longitude: must be between -180 and 180")]
    InvalidLongitude,
    
    #[error("Invalid relay URL: must start with wss:// or ws://")]
    InvalidRelayUrl,
    
    #[error("Invalid public key")]
    InvalidPubkey,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_location() -> Location {
        Location {
            name: "Test Venue".to_string(),
            latitude: 37.7749,
            longitude: -122.4194,
            radius: 25.0,
            accuracy: 20.0,
        }
    }

    #[test]
    fn test_community_creation() {
        let id = Uuid::new_v4();
        let community = Community::new(
            id,
            "Test Community".to_string(),
            "npub1testkey".to_string(),
            create_test_location(),
            "wss://peek.hol.is".to_string(),
        );

        assert_eq!(community.id, id);
        assert_eq!(community.group_id, format!("peek_{}", id));
        assert_eq!(community.name, "Test Community");
        assert_eq!(community.member_count, 1);
        assert!(community.is_active());
    }

    #[test]
    fn test_community_validation_valid() {
        let community = Community::new(
            Uuid::new_v4(),
            "Valid Community".to_string(),
            "npub1valid".to_string(),
            create_test_location(),
            "wss://peek.hol.is".to_string(),
        );

        assert!(community.validate().is_ok());
    }

    #[test]
    fn test_community_validation_invalid_name() {
        let mut community = Community::new(
            Uuid::new_v4(),
            "".to_string(),
            "npub1test".to_string(),
            create_test_location(),
            "wss://peek.hol.is".to_string(),
        );

        assert!(matches!(
            community.validate(),
            Err(ValidationError::InvalidName)
        ));

        community.name = "a".repeat(101);
        assert!(matches!(
            community.validate(),
            Err(ValidationError::InvalidName)
        ));
    }

    #[test]
    fn test_community_validation_invalid_coordinates() {
        let mut location = create_test_location();
        location.latitude = 91.0;
        
        let community = Community::new(
            Uuid::new_v4(),
            "Test".to_string(),
            "npub1test".to_string(),
            location,
            "wss://peek.hol.is".to_string(),
        );

        assert!(matches!(
            community.validate(),
            Err(ValidationError::InvalidLatitude)
        ));
    }

    #[test]
    fn test_community_archive() {
        let mut community = Community::new(
            Uuid::new_v4(),
            "Test".to_string(),
            "npub1test".to_string(),
            create_test_location(),
            "wss://peek.hol.is".to_string(),
        );

        assert!(community.is_active());
        community.archive();
        assert!(!community.is_active());
    }

    #[test]
    fn test_community_preview_conversion() {
        let community = Community::new(
            Uuid::new_v4(),
            "Test Community".to_string(),
            "npub1test".to_string(),
            create_test_location(),
            "wss://peek.hol.is".to_string(),
        );

        let preview: CommunityPreview = (&community).into();
        
        assert_eq!(preview.id, community.id);
        assert_eq!(preview.name, community.name);
        assert_eq!(preview.member_count, community.member_count);
    }
}