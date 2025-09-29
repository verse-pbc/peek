use geohash::decode;
use std::f64::consts::PI;
use validation_service::libraries::display_location::generate_display_location;

const EARTH_RADIUS_METERS: f64 = 6_371_000.0;

// Test helper function for calculating distance
fn calculate_distance_meters(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let lat1_rad = lat1 * PI / 180.0;
    let lat2_rad = lat2 * PI / 180.0;
    let delta_lat = (lat2 - lat1) * PI / 180.0;
    let delta_lon = (lon2 - lon1) * PI / 180.0;

    let a = (delta_lat / 2.0).sin().powi(2)
        + lat1_rad.cos() * lat2_rad.cos() * (delta_lon / 2.0).sin().powi(2);

    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    EARTH_RADIUS_METERS * c
}

// Test helper for verifying display location
fn verify_display_location(
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

#[test]
fn test_display_location_within_bounds() {
    // Test location: San Francisco City Hall
    let actual_lat = 37.7793;
    let actual_lon = -122.4193;

    // Generate 100 display locations to test randomness and bounds
    for _ in 0..100 {
        let display_geohash = generate_display_location(actual_lat, actual_lon)
            .expect("Should generate display location");

        // Display geohash should be 9 characters
        assert_eq!(display_geohash.len(), 9);

        // Verify actual location is within 1km fog circle
        assert!(
            verify_display_location(actual_lat, actual_lon, &display_geohash).unwrap(),
            "Actual location should be within 1km of display location"
        );

        // Decode and verify distance is within 750m
        let (display_coord, _, _) = decode(&display_geohash).unwrap();
        let distance =
            calculate_distance_meters(actual_lat, actual_lon, display_coord.y, display_coord.x);

        assert!(
            distance <= 750.0,
            "Display location should be within 750m of actual location, got {}m",
            distance
        );
    }
}

#[test]
fn test_display_location_randomness() {
    let actual_lat = 40.7128; // New York City
    let actual_lon = -74.0060;

    // Generate multiple display locations
    let mut display_locations = Vec::new();
    for _ in 0..20 {
        let display_geohash = generate_display_location(actual_lat, actual_lon)
            .expect("Should generate display location");
        display_locations.push(display_geohash);
    }

    // Check that we get different locations (verifying randomness)
    let unique_count = display_locations
        .iter()
        .collect::<std::collections::HashSet<_>>()
        .len();

    // At least 10 unique locations out of 20 (allowing for some collisions)
    assert!(
        unique_count >= 10,
        "Should generate diverse random locations, got {} unique out of 20",
        unique_count
    );
}

#[test]
fn test_fog_circle_coverage() {
    // Test that actual location is always within the 1km fog circle
    let test_locations = vec![
        (37.7749, -122.4194), // San Francisco
        (40.7128, -74.0060),  // New York
        (51.5074, -0.1278),   // London
        (-33.8688, 151.2093), // Sydney
        (35.6762, 139.6503),  // Tokyo
    ];

    for (lat, lon) in test_locations {
        for _ in 0..10 {
            let display_geohash =
                generate_display_location(lat, lon).expect("Should generate display location");

            let (display_coord, _, _) = geohash::decode(&display_geohash).unwrap();
            let distance = calculate_distance_meters(lat, lon, display_coord.y, display_coord.x);

            // The actual location must be within 1km radius
            // Since we offset by max 750m, the actual is always within 1km fog circle
            assert!(
                distance <= 1000.0,
                "Actual location at ({}, {}) should be within 1km fog circle, distance: {}m",
                lat,
                lon,
                distance
            );
        }
    }
}

#[test]
fn test_privacy_preservation() {
    // Test that display location doesn't reveal actual location
    let actual_lat = 37.7749;
    let actual_lon = -122.4194;

    let display_geohash = generate_display_location(actual_lat, actual_lon)
        .expect("Should generate display location");

    // Decode both locations
    let actual_geohash = geohash::encode(
        geohash::Coord {
            x: actual_lon,
            y: actual_lat,
        },
        9,
    )
    .unwrap();

    // Display and actual geohashes should be different
    assert_ne!(
        display_geohash, actual_geohash,
        "Display location should be different from actual location"
    );

    // Calculate minimum distance (should be > 0)
    let (display_coord, _, _) = decode(&display_geohash).unwrap();
    let distance =
        calculate_distance_meters(actual_lat, actual_lon, display_coord.y, display_coord.x);

    assert!(
        distance > 0.0,
        "Display location should be offset from actual location"
    );
}
