use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{debug, error};

use crate::{
    config::Config,
    models::{
        CommunityPreviewRequest, CommunityPreviewResponse, ValidateLocationRequest,
        ValidateLocationResponse,
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

pub async fn validate_location(
    State(config): State<Config>,
    Json(request): Json<ValidateLocationRequest>,
) -> Result<Json<ValidateLocationResponse>, StatusCode> {
    debug!("Validating location for community: {}", request.community_id);

    // Validate location is within range
    let distance = services::location::calculate_distance(
        &request.qr_data.location,
        &request.location.coordinates,
    );

    debug!("Distance from QR location: {} meters", distance);

    if distance > config.max_distance_meters {
        return Ok(Json(ValidateLocationResponse {
            success: false,
            invite_code: None,
            error: Some(format!(
                "Too far from location. You are {:.1}m away, must be within {:.0}m",
                distance, config.max_distance_meters
            )),
            requires_photo_proof: None,
        }));
    }

    // Check GPS accuracy
    if request.location.accuracy > config.max_accuracy_meters {
        return Ok(Json(ValidateLocationResponse {
            success: false,
            invite_code: None,
            error: Some(format!(
                "GPS accuracy too low. Current: {:.1}m, required: {:.0}m or better",
                request.location.accuracy, config.max_accuracy_meters
            )),
            requires_photo_proof: None,
        }));
    }

    // Create NIP-29 invite
    match services::nostr::create_invite(
        &config,
        &request.community_id,
        &request.user_pubkey,
    )
    .await
    {
        Ok(invite_code) => Ok(Json(ValidateLocationResponse {
            success: true,
            invite_code: Some(invite_code),
            error: None,
            requires_photo_proof: Some(false), // Future enhancement
        })),
        Err(e) => {
            error!("Failed to create invite: {}", e);
            Ok(Json(ValidateLocationResponse {
                success: false,
                invite_code: None,
                error: Some("Failed to create invite".to_string()),
                requires_photo_proof: None,
            }))
        }
    }
}

pub async fn community_preview(
    State(config): State<Config>,
    Query(request): Query<CommunityPreviewRequest>,
) -> Result<Json<CommunityPreviewResponse>, StatusCode> {
    debug!("Getting preview for community: {}", request.community_id);

    // TODO: Query relay for community metadata
    // For now, return mock data
    Ok(Json(CommunityPreviewResponse {
        name: format!("Community {}", request.community_id),
        description: Some("A location-based community".to_string()),
        member_count: 0,
        requires_location: true,
        distance_from_venue: None,
    }))
}