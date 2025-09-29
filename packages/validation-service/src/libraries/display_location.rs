use geohash::{decode, encode, Coord};
use rand::Rng;
use std::f64::consts::PI;

/// Maximum offset distance in meters from actual location
const MAX_OFFSET_METERS: f64 = 750.0;

/// Earth radius in meters (for distance calculations)
const EARTH_RADIUS_METERS: f64 = 6_371_000.0;

/// Generate a display location that is randomly offset from the actual location.
/// The offset will be within MAX_OFFSET_METERS (750m) to ensure the actual location
/// is always within the 1km fog circle centered on the display location.
///
/// Returns a 9-character geohash for the display location.
pub fn generate_display_location(actual_lat: f64, actual_lon: f64) -> Result<String, String> {
    let mut rng = rand::thread_rng();

    // Generate random distance (0 to 750 meters)
    let distance_meters = rng.gen_range(0.0..MAX_OFFSET_METERS);

    // Generate random bearing (0 to 360 degrees)
    let bearing_degrees = rng.gen_range(0.0..360.0);
    let bearing_radians = bearing_degrees * PI / 180.0;

    // Calculate offset point using Haversine formula
    let lat_rad = actual_lat * PI / 180.0;
    let lon_rad = actual_lon * PI / 180.0;

    // Angular distance
    let angular_distance = distance_meters / EARTH_RADIUS_METERS;

    // Calculate new latitude
    let new_lat_rad = (lat_rad.sin() * angular_distance.cos()
        + lat_rad.cos() * angular_distance.sin() * bearing_radians.cos())
    .asin();

    // Calculate new longitude
    let new_lon_rad = lon_rad
        + (bearing_radians.sin() * angular_distance.sin() * lat_rad.cos())
            .atan2(angular_distance.cos() - lat_rad.sin() * new_lat_rad.sin());

    // Convert back to degrees
    let display_lat = new_lat_rad * 180.0 / PI;
    let display_lon = new_lon_rad * 180.0 / PI;

    // Encode as 9-character geohash for higher precision
    encode(
        Coord {
            x: display_lon,
            y: display_lat,
        },
        9,
    )
    .map_err(|e| format!("Failed to encode display location: {}", e))
}

/// Generate display location from an 8-character geohash
#[allow(dead_code)]
pub fn generate_display_from_geohash(actual_geohash: &str) -> Result<String, String> {
    if actual_geohash.len() != 8 {
        return Err(format!(
            "Expected 8-character geohash, got {}",
            actual_geohash.len()
        ));
    }

    // Decode the actual location
    let (coord, _, _) =
        decode(actual_geohash).map_err(|e| format!("Failed to decode geohash: {}", e))?;

    generate_display_location(coord.y, coord.x)
}

/// Calculate distance between two points using Haversine formula
#[allow(dead_code)]
pub fn calculate_distance_meters(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let lat1_rad = lat1 * PI / 180.0;
    let lat2_rad = lat2 * PI / 180.0;
    let delta_lat = (lat2 - lat1) * PI / 180.0;
    let delta_lon = (lon2 - lon1) * PI / 180.0;

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lon / 2.0).sin().powi(2);

    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS_METERS * c
}

/// Verify that a display location is valid for the actual location
/// (i.e., actual location is within 1km of display location)
#[allow(dead_code)]
pub fn verify_display_location(
    actual_lat: f64,
    actual_lon: f64,
    display_geohash: &str,
) -> Result<bool, String> {
    // Decode display location
    let (display_coord, _, _) =
        decode(display_geohash).map_err(|e| format!("Failed to decode display geohash: {}", e))?;

    // Calculate distance
    let distance =
        calculate_distance_meters(actual_lat, actual_lon, display_coord.y, display_coord.x);

    // Actual location must be within 1km of display location
    Ok(distance <= 1000.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_display_location() {
        let lat = 37.7749;
        let lon = -122.4194;

        // Generate multiple display locations to test randomness
        let mut generated = Vec::new();
        for _ in 0..10 {
            let display_geohash = generate_display_location(lat, lon).unwrap();
            assert_eq!(display_geohash.len(), 9);

            // Verify the actual location is within 1km
            assert!(verify_display_location(lat, lon, &display_geohash).unwrap());

            generated.push(display_geohash);
        }

        // Check that we're getting different locations (randomness)
        let unique_count = generated
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len();
        assert!(unique_count > 5); // At least half should be unique
    }

    #[test]
    fn test_distance_calculation() {
        // San Francisco to Palo Alto (approximately 48km)
        let distance = calculate_distance_meters(37.7749, -122.4194, 37.4419, -122.1430);
        assert!((distance - 48_000.0).abs() < 5_000.0); // Within 5km tolerance

        // Very close points (100m apart)
        let lat1 = 37.7749;
        let lon1 = -122.4194;
        let lat2 = 37.7758; // ~100m north
        let lon2 = -122.4194;
        let distance = calculate_distance_meters(lat1, lon1, lat2, lon2);
        assert!((distance - 100.0).abs() < 20.0); // Within 20m tolerance
    }

    #[test]
    fn test_display_within_max_offset() {
        let lat = 40.7128;
        let lon = -74.0060;

        for _ in 0..20 {
            let display_geohash = generate_display_location(lat, lon).unwrap();
            let (display_coord, _, _) = decode(&display_geohash).unwrap();

            let distance = calculate_distance_meters(lat, lon, display_coord.y, display_coord.x);
            assert!(distance <= MAX_OFFSET_METERS);
        }
    }
}
