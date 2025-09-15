mod validate_location;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use tracing::{debug};

pub use validate_location::validate_location;

use crate::{
    config::Config,
    models::{
        CommunityPreviewRequest, CommunityPreviewResponse, LocationInfo,
    },
    services,
};

pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "validation-service",
        "version": env!("CARGO_PKG_VERSION")
    }))
}


pub async fn community_preview(
    State((_config, _community_service)): State<(Config, Arc<services::community::CommunityService>)>,
    Query(request): Query<CommunityPreviewRequest>,
) -> Result<Json<CommunityPreviewResponse>, StatusCode> {
    debug!("Getting preview for community: {}", request.id);

    // TODO: Query relay for community metadata
    // For now, return mock data
    Ok(Json(CommunityPreviewResponse {
        id: request.id,
        name: format!("Community {}", request.id),
        description: Some("A location-based community".to_string()),
        member_count: 42,
        location: LocationInfo {
            name: "SF Coffee House".to_string(),
            latitude: 37.7749,
            longitude: -122.4194,
        },
        created_at: chrono::Utc::now().to_rfc3339(),
        error: None,
    }))
}