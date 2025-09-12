use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationPoint {
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationProof {
    pub coordinates: LocationPoint,
    pub accuracy: f64,  // meters
    pub timestamp: i64,  // Unix timestamp
}

impl LocationProof {
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

        // Validate coordinates range
        if self.coordinates.latitude < -90.0 || self.coordinates.latitude > 90.0 {
            return Err(LocationValidationError::InvalidCoordinates);
        }

        if self.coordinates.longitude < -180.0 || self.coordinates.longitude > 180.0 {
            return Err(LocationValidationError::InvalidCoordinates);
        }

        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
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
        LocationProof {
            coordinates: LocationPoint {
                latitude: 37.7749,
                longitude: -122.4194,
            },
            accuracy: 15.0,
            timestamp: Utc::now().timestamp(),
        }
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
}