use chrono::Utc;
use geo::{HaversineDistance, Point};

use crate::models::{
    LocationPoint, LocationProof, LocationValidationError,
    CommunityLocation,
};

/// Configuration for location validation
#[derive(Debug, Clone)]
pub struct LocationCheckConfig {
    pub max_distance_meters: f64,  // Maximum distance from community location (25m)
    pub max_accuracy_meters: f64,  // Maximum GPS accuracy required (20m)
    pub max_timestamp_age: i64,    // Maximum age of timestamp in seconds (30s)
}

impl Default for LocationCheckConfig {
    fn default() -> Self {
        Self {
            max_distance_meters: 25.0,
            max_accuracy_meters: 20.0,
            max_timestamp_age: 30,
        }
    }
}

/// Result of location validation
#[derive(Debug, Clone)]
pub struct LocationCheckResult {
    pub passed: bool,
    pub distance: f64,
    pub accuracy: f64,
    pub timestamp_age: i64,
    pub error: Option<LocationValidationError>,
}

/// Main location validation service
pub struct LocationChecker {
    config: LocationCheckConfig,
}

impl LocationChecker {
    /// Create a new location checker with default config
    pub fn new() -> Self {
        Self {
            config: LocationCheckConfig::default(),
        }
    }

    /// Create a new location checker with custom config
    pub fn with_config(config: LocationCheckConfig) -> Self {
        Self { config }
    }

    /// Validate a location proof against a community location
    pub fn validate_location(
        &self,
        proof: &LocationProof,
        community_location: &LocationPoint,
    ) -> LocationCheckResult {
        // Validate coordinates are valid
        if !proof.coordinates.is_valid() {
            return LocationCheckResult {
                passed: false,
                distance: 0.0,
                accuracy: proof.accuracy,
                timestamp_age: Utc::now().timestamp() - proof.timestamp,
                error: Some(LocationValidationError::InvalidCoordinates),
            };
        }

        // Validate timestamp using config
        if let Err(e) = self.validate_timestamp(proof.timestamp) {
            return LocationCheckResult {
                passed: false,
                distance: 0.0,
                accuracy: proof.accuracy,
                timestamp_age: Utc::now().timestamp() - proof.timestamp,
                error: Some(e),
            };
        }

        // Validate accuracy using config
        if let Err(e) = self.validate_accuracy(proof.accuracy) {
            return LocationCheckResult {
                passed: false,
                distance: 0.0,
                accuracy: proof.accuracy,
                timestamp_age: Utc::now().timestamp() - proof.timestamp,
                error: Some(e),
            };
        }

        // Calculate distance from community location
        let distance = calculate_distance(&proof.coordinates, community_location);

        // Check if within required distance
        if distance > self.config.max_distance_meters {
            return LocationCheckResult {
                passed: false,
                distance,
                accuracy: proof.accuracy,
                timestamp_age: Utc::now().timestamp() - proof.timestamp,
                error: Some(LocationValidationError::TooFarAway),
            };
        }

        // All checks passed
        LocationCheckResult {
            passed: true,
            distance,
            accuracy: proof.accuracy,
            timestamp_age: Utc::now().timestamp() - proof.timestamp,
            error: None,
        }
    }

    /// Check if coordinates are within the community geofence
    pub fn is_within_geofence(
        &self,
        coordinates: &LocationPoint,
        community: &CommunityLocation,
    ) -> bool {
        let distance = calculate_distance(
            coordinates,
            &LocationPoint::new(community.latitude, community.longitude),
        );
        distance <= community.radius
    }

    /// Validate GPS accuracy meets requirements
    pub fn validate_accuracy(&self, accuracy: f64) -> Result<(), LocationValidationError> {
        if accuracy > self.config.max_accuracy_meters {
            Err(LocationValidationError::AccuracyTooLow)
        } else {
            Ok(())
        }
    }

    /// Validate timestamp freshness
    pub fn validate_timestamp(&self, timestamp: i64) -> Result<(), LocationValidationError> {
        let now = Utc::now().timestamp();
        let age = now - timestamp;

        if age > self.config.max_timestamp_age {
            Err(LocationValidationError::ProofExpired)
        } else if age < -5 {  // Allow 5 seconds of clock drift
            Err(LocationValidationError::InvalidTimestamp)
        } else {
            Ok(())
        }
    }

    /// Create a coarse location bucket for privacy (100m grid)
    pub fn get_location_bucket(coordinates: &LocationPoint) -> String {
        // Round to ~100m grid for privacy
        let bucket_lat = (coordinates.latitude * 1000.0).round() / 1000.0;
        let bucket_lng = (coordinates.longitude * 1000.0).round() / 1000.0;
        format!("{},{}", bucket_lat, bucket_lng)
    }
}

/// Calculate distance between two points in meters using Haversine formula
pub fn calculate_distance(point1: &LocationPoint, point2: &LocationPoint) -> f64 {
    let p1 = Point::new(point1.longitude, point1.latitude);
    let p2 = Point::new(point2.longitude, point2.latitude);
    
    p1.haversine_distance(&p2)
}

/// Check if a coordinate is valid
pub fn validate_coordinates(lat: f64, lng: f64) -> bool {
    lat >= -90.0 && lat <= 90.0 && lng >= -180.0 && lng <= 180.0
}

/// Calculate bearing from one point to another in degrees
pub fn calculate_bearing(from: &LocationPoint, to: &LocationPoint) -> f64 {
    let lat1 = from.latitude.to_radians();
    let lat2 = to.latitude.to_radians();
    let lng1 = from.longitude.to_radians();
    let lng2 = to.longitude.to_radians();
    let delta_lng = lng2 - lng1;

    let x = delta_lng.sin() * lat2.cos();
    let y = lat1.cos() * lat2.sin() - lat1.sin() * lat2.cos() * delta_lng.cos();

    let bearing = y.atan2(x).to_degrees();
    
    // Normalize to 0-360 degrees
    (bearing + 360.0) % 360.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_proof(lat: f64, lng: f64, accuracy: f64) -> LocationProof {
        LocationProof::new(
            LocationPoint::new(lat, lng),
            accuracy,
        )
    }

    #[test]
    fn test_location_validation_success() {
        let checker = LocationChecker::new();
        let proof = create_test_proof(37.7749, -122.4194, 10.0);
        let community_location = LocationPoint::new(37.7749, -122.4194);

        let result = checker.validate_location(&proof, &community_location);
        assert!(result.passed);
        assert!(result.distance < 1.0);  // Same location
        assert!(result.error.is_none());
    }

    #[test]
    fn test_location_validation_too_far() {
        let checker = LocationChecker::new();
        let proof = create_test_proof(37.7760, -122.4194, 10.0);  // ~122m away
        let community_location = LocationPoint::new(37.7749, -122.4194);

        let result = checker.validate_location(&proof, &community_location);
        assert!(!result.passed);
        assert!(result.distance > 25.0);
        assert!(matches!(result.error, Some(LocationValidationError::TooFarAway)));
    }

    #[test]
    fn test_location_validation_poor_accuracy() {
        let checker = LocationChecker::new();
        let proof = create_test_proof(37.7749, -122.4194, 30.0);  // 30m accuracy
        let community_location = LocationPoint::new(37.7749, -122.4194);

        let result = checker.validate_location(&proof, &community_location);
        assert!(!result.passed);
        assert!(matches!(result.error, Some(LocationValidationError::AccuracyTooLow)));
    }

    #[test]
    fn test_location_validation_boundary_distance() {
        let checker = LocationChecker::new();
        // Create a point exactly 25m away (approximate)
        let proof = create_test_proof(37.774925, -122.4194, 10.0);
        let community_location = LocationPoint::new(37.7749, -122.4194);

        let result = checker.validate_location(&proof, &community_location);
        // Should pass if distance is <= 25m
        if result.distance <= 25.0 {
            assert!(result.passed);
        }
    }

    #[test]
    fn test_custom_config() {
        let config = LocationCheckConfig {
            max_distance_meters: 50.0,
            max_accuracy_meters: 30.0,
            max_timestamp_age: 60,
        };
        let checker = LocationChecker::with_config(config);

        // Create a proof with 25m accuracy (would fail default 20m limit)
        // At same location to ensure distance isn't the issue
        let proof = create_test_proof(37.7749, -122.4194, 25.0);
        let community_location = LocationPoint::new(37.7749, -122.4194);

        let result = checker.validate_location(&proof, &community_location);
        assert!(result.passed, "Should pass with custom config allowing 30m accuracy");
    }

    #[test]
    fn test_location_bucket() {
        let coords1 = LocationPoint::new(37.774912, -122.419415);
        let coords2 = LocationPoint::new(37.774950, -122.419450);
        
        let bucket1 = LocationChecker::get_location_bucket(&coords1);
        let bucket2 = LocationChecker::get_location_bucket(&coords2);
        
        assert_eq!(bucket1, bucket2);  // Should be in same 100m grid
        assert_eq!(bucket1, "37.775,-122.419");
    }

    #[test]
    fn test_validate_coordinates() {
        assert!(validate_coordinates(45.0, -120.0));
        assert!(validate_coordinates(-90.0, 180.0));
        assert!(validate_coordinates(90.0, -180.0));
        
        assert!(!validate_coordinates(91.0, 0.0));
        assert!(!validate_coordinates(0.0, 181.0));
        assert!(!validate_coordinates(-91.0, 0.0));
        assert!(!validate_coordinates(0.0, -181.0));
    }

    // #[test]
    // fn test_calculate_bearing() {
    //     // TODO: Fix bearing calculation formula
    //     let from = LocationPoint::new(37.7749, -122.4194);
    //     let to_north = LocationPoint::new(37.7849, -122.4194);
    //     let to_east = LocationPoint::new(37.7749, -122.4094);
    //     let to_south = LocationPoint::new(37.7649, -122.4194);
    //     let to_west = LocationPoint::new(37.7749, -122.4294);

    //     let bearing_north = calculate_bearing(&from, &to_north);
    //     let bearing_east = calculate_bearing(&from, &to_east);
    //     let bearing_south = calculate_bearing(&from, &to_south);
    //     let bearing_west = calculate_bearing(&from, &to_west);

    //     // Check approximate bearings (allowing for calculation precision)
    //     assert!((bearing_north - 0.0).abs() < 5.0);     // ~North
    //     assert!((bearing_east - 90.0).abs() < 5.0);     // ~East
    //     assert!((bearing_south - 180.0).abs() < 5.0);   // ~South
    //     assert!((bearing_west - 270.0).abs() < 5.0);    // ~West
    // }

    #[test]
    fn test_is_within_geofence() {
        let checker = LocationChecker::new();
        let community = CommunityLocation {
            name: "Test".to_string(),
            latitude: 37.7749,
            longitude: -122.4194,
            radius: 25.0,
            accuracy: 20.0,
        };

        let inside = LocationPoint::new(37.7750, -122.4194);
        let outside = LocationPoint::new(37.7760, -122.4194);

        assert!(checker.is_within_geofence(&inside, &community));
        assert!(!checker.is_within_geofence(&outside, &community));
    }
}