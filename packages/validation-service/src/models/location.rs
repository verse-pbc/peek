use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationPoint {
    pub latitude: f64,
    pub longitude: f64,
}

impl LocationPoint {
    /// Create a new location point
    pub fn new(latitude: f64, longitude: f64) -> Self {
        Self { latitude, longitude }
    }
    
    /// Validate that coordinates are within valid GPS ranges
    pub fn is_valid(&self) -> bool {
        self.latitude >= -90.0 && self.latitude <= 90.0 &&
        self.longitude >= -180.0 && self.longitude <= 180.0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationProof {
    pub coordinates: LocationPoint,
    pub accuracy: f64,       // Horizontal accuracy in meters
    pub timestamp: i64,      // Unix timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude: Option<f64>,     // Altitude in meters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude_accuracy: Option<f64>, // Vertical accuracy in meters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<f64>,      // Direction in degrees from north
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,        // Speed in meters/second
}

impl LocationProof {
    /// Create a new location proof with minimal required fields
    pub fn new(coordinates: LocationPoint, accuracy: f64) -> Self {
        Self {
            coordinates,
            accuracy,
            timestamp: Utc::now().timestamp(),
            altitude: None,
            altitude_accuracy: None,
            heading: None,
            speed: None,
        }
    }
    
    /// Create a location proof with all fields
    pub fn new_with_details(
        coordinates: LocationPoint,
        accuracy: f64,
        altitude: Option<f64>,
        altitude_accuracy: Option<f64>,
        heading: Option<f64>,
        speed: Option<f64>,
    ) -> Self {
        Self {
            coordinates,
            accuracy,
            timestamp: Utc::now().timestamp(),
            altitude,
            altitude_accuracy,
            heading,
            speed,
        }
    }
    
    /// Validate the location proof constraints
    pub fn validate(&self) -> Result<(), LocationValidationError> {
        // Check GPS accuracy (must be <= 20m)
        if self.accuracy > 20.0 {
            return Err(LocationValidationError::AccuracyTooLow);
        }

        // Check timestamp freshness (must be within 30 seconds)
        let now = Utc::now().timestamp();
        let age = now - self.timestamp;
        
        if age > 30 {
            return Err(LocationValidationError::ProofExpired);
        }
        
        if age < -5 {  // Allow 5 seconds of clock drift into future
            return Err(LocationValidationError::InvalidTimestamp);
        }

        // Validate coordinates using LocationPoint's validation
        if !self.coordinates.is_valid() {
            return Err(LocationValidationError::InvalidCoordinates);
        }

        Ok(())
    }
    
    /// Check if the location proof is recent (within specified seconds)
    pub fn is_recent(&self, max_age_seconds: i64) -> bool {
        let now = Utc::now().timestamp();
        let age = now - self.timestamp;
        age >= 0 && age <= max_age_seconds
    }
    
    /// Calculate the distance to another location point in meters
    pub fn distance_to(&self, other: &LocationPoint) -> f64 {
        crate::services::location::calculate_distance(&self.coordinates, other)
    }
    
    /// Check if this proof is within a specified distance of a location
    pub fn is_within_range(&self, location: &LocationPoint, max_distance: f64) -> bool {
        self.distance_to(location) <= max_distance
    }
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum LocationValidationError {
    #[error("GPS accuracy too low. Please enable precise location.")]
    AccuracyTooLow,
    
    #[error("Location proof expired. Please try again.")]
    ProofExpired,
    
    #[error("Invalid timestamp.")]
    InvalidTimestamp,
    
    #[error("Invalid coordinates provided.")]
    InvalidCoordinates,
    
    #[error("You must be at the location to join this community.")]
    TooFarAway,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_valid_proof() -> LocationProof {
        LocationProof::new(
            LocationPoint::new(37.7749, -122.4194),
            15.0,
        )
    }

    #[test]
    fn test_valid_location_proof() {
        let proof = create_valid_proof();
        assert!(proof.validate().is_ok());
    }

    #[test]
    fn test_accuracy_too_low() {
        let mut proof = create_valid_proof();
        proof.accuracy = 25.0;
        
        assert!(matches!(
            proof.validate(),
            Err(LocationValidationError::AccuracyTooLow)
        ));
    }

    #[test]
    fn test_expired_proof() {
        let mut proof = create_valid_proof();
        proof.timestamp = Utc::now().timestamp() - 35;
        
        assert!(matches!(
            proof.validate(),
            Err(LocationValidationError::ProofExpired)
        ));
    }

    #[test]
    fn test_future_timestamp() {
        let mut proof = create_valid_proof();
        proof.timestamp = Utc::now().timestamp() + 60;
        
        assert!(matches!(
            proof.validate(),
            Err(LocationValidationError::InvalidTimestamp)
        ));
    }

    #[test]
    fn test_invalid_coordinates() {
        let mut proof = create_valid_proof();
        proof.coordinates.latitude = 91.0;
        
        assert!(matches!(
            proof.validate(),
            Err(LocationValidationError::InvalidCoordinates)
        ));

        proof.coordinates.latitude = 45.0;
        proof.coordinates.longitude = -181.0;
        
        assert!(matches!(
            proof.validate(),
            Err(LocationValidationError::InvalidCoordinates)
        ));
    }

    #[test]
    fn test_boundary_accuracy() {
        let mut proof = create_valid_proof();
        proof.accuracy = 20.0;  // Exactly at boundary
        assert!(proof.validate().is_ok());

        proof.accuracy = 20.01;  // Just over boundary
        assert!(proof.validate().is_err());
    }

    #[test]
    fn test_boundary_timestamp() {
        let mut proof = create_valid_proof();
        proof.timestamp = Utc::now().timestamp() - 30;  // Exactly at boundary
        assert!(proof.validate().is_ok());

        proof.timestamp = Utc::now().timestamp() - 31;  // Just over boundary
        assert!(proof.validate().is_err());
    }
    
    #[test]
    fn test_location_point_validation() {
        let valid_point = LocationPoint::new(45.0, -120.0);
        assert!(valid_point.is_valid());
        
        let invalid_lat = LocationPoint::new(91.0, 0.0);
        assert!(!invalid_lat.is_valid());
        
        let invalid_lng = LocationPoint::new(0.0, 181.0);
        assert!(!invalid_lng.is_valid());
    }
    
    #[test]
    fn test_is_recent() {
        let proof = create_valid_proof();
        assert!(proof.is_recent(30));
        assert!(proof.is_recent(60));
        
        let mut old_proof = create_valid_proof();
        old_proof.timestamp = Utc::now().timestamp() - 45;
        assert!(!old_proof.is_recent(30));
        assert!(old_proof.is_recent(60));
    }
    
    #[test]
    fn test_location_proof_with_details() {
        let proof = LocationProof::new_with_details(
            LocationPoint::new(37.7749, -122.4194),
            10.0,
            Some(50.0),  // altitude
            Some(5.0),   // altitude accuracy
            Some(180.0), // heading south
            Some(2.5),   // speed
        );
        
        assert!(proof.validate().is_ok());
        assert_eq!(proof.altitude, Some(50.0));
        assert_eq!(proof.heading, Some(180.0));
    }
    
    #[test]
    fn test_distance_and_range_checking() {
        let proof = LocationProof::new(
            LocationPoint::new(37.7749, -122.4194),
            10.0,
        );
        
        let nearby = LocationPoint::new(37.7750, -122.4194);
        let distance = proof.distance_to(&nearby);
        assert!(distance < 20.0); // Should be ~11 meters
        
        assert!(proof.is_within_range(&nearby, 25.0));
        assert!(!proof.is_within_range(&nearby, 5.0));
    }
}