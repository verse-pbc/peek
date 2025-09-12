use geo::{HaversineDistance, Point};

use crate::models::LocationPoint;

/// Calculate distance between two points in meters using Haversine formula
pub fn calculate_distance(point1: &LocationPoint, point2: &LocationPoint) -> f64 {
    let p1 = Point::new(point1.longitude, point1.latitude);
    let p2 = Point::new(point2.longitude, point2.latitude);
    
    p1.haversine_distance(&p2)
}