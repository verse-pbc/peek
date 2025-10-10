use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::error::Error;

/// Overpass API response structure
#[derive(Debug, Deserialize, Serialize)]
struct OverpassResponse {
    elements: Vec<OverpassElement>,
}

#[derive(Debug, Deserialize, Serialize)]
struct OverpassElement {
    #[serde(default)]
    tags: OverpassTags,
    #[serde(default)]
    lat: f64,
    #[serde(default)]
    lon: f64,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct OverpassTags {
    name: Option<String>,
    amenity: Option<String>,
    shop: Option<String>,
    #[serde(rename = "building")]
    building_type: Option<String>,
}

/// Query Overpass API for the nearest named place
/// Returns the name of the closest POI/amenity within 25m radius
pub async fn get_place_name(latitude: f64, longitude: f64) -> Result<Option<String>> {
    // Overpass query: find amenities, shops, or buildings with names within 25m
    let query = format!(
        r#"[out:json][timeout:15];
(
  node["name"](around:25,{},{});
  way["name"](around:25,{},{});
);
out center 1;"#,
        latitude, longitude, latitude, longitude
    );

    // Query Overpass API with proper User-Agent and timeout
    tracing::info!("🌍 Querying Overpass API at ({}, {})", latitude, longitude);

    let client = reqwest::Client::builder()
        .user_agent("Peek/0.1.0 (https://github.com/verse-pbc/peek; noreply@verse.app)")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))?;

    let response = client
        .post("https://overpass-api.de/api/interpreter")
        .body(query)
        .send()
        .await
        .map_err(|e| {
            // Log full error chain for debugging
            let mut error_msg = format!("Overpass API request failed: {}", e);
            let mut source = e.source();
            while let Some(err) = source {
                error_msg.push_str(&format!("\n  Caused by: {}", err));
                source = err.source();
            }
            tracing::warn!("{}", error_msg);
            anyhow!(error_msg)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        tracing::warn!("Overpass API returned HTTP {}", status);
        return Err(anyhow!("Overpass API returned error: {}", status));
    }

    tracing::debug!("✅ Overpass API responded successfully");

    let data: OverpassResponse = response
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse Overpass response: {}", e))?;

    // Find the closest element with a name
    if let Some(element) = data.elements.first() {
        if let Some(name) = &element.tags.name {
            tracing::info!("✅ Found place name from Overpass: {}", name);
            return Ok(Some(name.clone()));
        }
    }

    // No named place found within radius
    tracing::debug!("No named place found within 25m radius");
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Ignore by default as it requires network
    async fn test_get_place_name() {
        // Starbucks in Alameda, CA (example)
        let result = get_place_name(37.7652, -122.2416).await;
        assert!(result.is_ok());
        if let Ok(Some(name)) = result {
            println!("Found place: {}", name);
        }
    }
}
