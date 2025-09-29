use axum::{extract::State, response::IntoResponse, Json};
use geohash::decode;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::services::relay::RelayService;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommunityDiscoveryData {
    pub id: String,
    pub name: String,
    pub display_location: DisplayLocation,
    pub member_count: u32,
    pub created_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DisplayLocation {
    pub geohash: String,
    pub latitude: f64,
    pub longitude: f64,
    pub fog_radius_meters: u32,
}

#[derive(Debug, Serialize)]
pub struct DiscoveryResponse {
    pub communities: Vec<CommunityDiscoveryData>,
    pub total_count: usize,
}

/// Get all communities for public discovery map
/// Returns only display locations (not actual locations) for privacy
pub async fn get_discovery_map(
    State(relay_service): State<Arc<RwLock<RelayService>>>,
) -> impl IntoResponse {
    info!("Fetching communities for discovery map");

    let relay = relay_service.read().await;

    // Fetch all NIP-29 groups with peek- prefix
    match fetch_all_peek_communities(&relay).await {
        Ok(communities) => {
            let count = communities.len();
            info!("Found {} communities for discovery map", count);

            Json(DiscoveryResponse {
                communities,
                total_count: count,
            })
        }
        Err(e) => {
            error!("Failed to fetch communities for discovery: {}", e);
            Json(DiscoveryResponse {
                communities: vec![],
                total_count: 0,
            })
        }
    }
}

async fn fetch_all_peek_communities(
    relay_service: &RelayService,
) -> Result<Vec<CommunityDiscoveryData>, Box<dyn std::error::Error>> {
    use nostr_sdk::prelude::*;
    use std::time::Duration;

    // Fetch all kind 39000 (group metadata) events that have a display geohash
    let filter = Filter::new().kind(Kind::from(39000)).limit(100); // Limit for safety

    let events = relay_service
        .client()
        .fetch_events(filter, Duration::from_secs(5))
        .await?;

    let mut communities = Vec::new();

    for event in events {
        // Parse the event to check if it's a Peek community with display location
        let mut group_id = None;
        let mut name = None;
        let mut display_geohash = None;
        let mut member_count = 0u32;

        for tag in event.tags.iter() {
            if let TagKind::Custom(tag_name) = tag.kind() {
                match tag_name.as_ref() {
                    "d" => {
                        // Group identifier
                        if let Some(content) = tag.content() {
                            // Check if it's a peek community
                            if content.starts_with("peek-") {
                                group_id = Some(content.to_string());
                            }
                        }
                    }
                    "name" => {
                        name = tag.content().map(|s| s.to_string());
                    }
                    "dg" => {
                        // Display geohash (9 characters)
                        if let Some(content) = tag.content() {
                            if content.len() == 9 {
                                display_geohash = Some(content.to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        // Only include communities with display locations
        if let (Some(id), Some(community_name), Some(dg_hash)) = (group_id, name, display_geohash) {
            // Decode the display geohash to get coordinates
            if let Ok((coord, _, _)) = decode(&dg_hash) {
                // Try to get member count
                if let Ok(count) = relay_service.get_group_member_count(&id).await {
                    member_count = count;
                }

                communities.push(CommunityDiscoveryData {
                    id: id.strip_prefix("peek-").unwrap_or(&id).to_string(),
                    name: community_name,
                    display_location: DisplayLocation {
                        geohash: dg_hash,
                        latitude: coord.y,
                        longitude: coord.x,
                        fog_radius_meters: 1000, // 1km fog circle
                    },
                    member_count,
                    created_at: event.created_at.as_u64(),
                });
            }
        }
    }

    Ok(communities)
}

/// Get discovery data for a specific community
pub async fn get_community_discovery(
    axum::extract::Path(community_id): axum::extract::Path<String>,
    State(relay_service): State<Arc<RwLock<RelayService>>>,
) -> impl IntoResponse {
    info!("Fetching discovery data for community: {}", community_id);

    let relay = relay_service.read().await;
    let group_id = format!("peek-{}", community_id);

    match relay.get_group_metadata(&group_id).await {
        Ok(metadata) => {
            // Only return display location, not actual location
            if let Some(display_geohash) = metadata.display_geohash {
                if let Ok((coord, _, _)) = decode(&display_geohash) {
                    let discovery_data = CommunityDiscoveryData {
                        id: community_id,
                        name: metadata.name,
                        display_location: DisplayLocation {
                            geohash: display_geohash,
                            latitude: coord.y,
                            longitude: coord.x,
                            fog_radius_meters: 1000,
                        },
                        member_count: metadata.member_count,
                        created_at: metadata.created_at.as_u64(),
                    };

                    return Json(serde_json::json!({
                        "success": true,
                        "community": discovery_data
                    }));
                }
            }

            // Community exists but has no display location
            Json(serde_json::json!({
                "success": false,
                "error": "Community has no display location"
            }))
        }
        Err(e) => {
            error!(
                "Failed to fetch community {} for discovery: {}",
                community_id, e
            );
            Json(serde_json::json!({
                "success": false,
                "error": "Community not found"
            }))
        }
    }
}
