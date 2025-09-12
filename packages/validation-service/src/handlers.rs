use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{debug, error};
use uuid::Uuid;

use crate::{
    config::Config,
    libraries::location_check::{LocationChecker, LocationCheckConfig},
    models::{
        CommunityPreviewRequest, CommunityPreviewResponse, ValidateLocationRequest,
        ValidateLocationResponse, LocationPoint, LocationInfo,
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

    // Create location checker with config from environment
    let check_config = LocationCheckConfig {
        max_distance_meters: config.max_distance_meters,
        max_accuracy_meters: config.max_accuracy_meters,
        max_timestamp_age: 30,  // 30 seconds
    };
    let checker = LocationChecker::with_config(check_config);

    // TODO: Get actual community location from relay
    // For now, use a mock location
    let community_location = LocationPoint {
        latitude: 37.7749,
        longitude: -122.4194,
    };

    // Validate location using the location checker
    let check_result = checker.validate_location(
        &request.location_proof,
        &community_location,
    );

    debug!(
        "Location check result - passed: {}, distance: {:.1}m, accuracy: {:.1}m",
        check_result.passed, check_result.distance, check_result.accuracy
    );

    if !check_result.passed {
        let error_message = check_result.error
            .map(|e| e.to_string())
            .unwrap_or_else(|| "Location validation failed".to_string());
        return Ok(Json(ValidateLocationResponse::error(error_message)));
    }

    // Create NIP-29 invite
    match services::nostr::create_invite(
        &config,
        &request.community_id,
        &request.user_pubkey,
    )
    .await
    {
        Ok(invite_code) => {
            let expires_at = chrono::Utc::now().timestamp() + config.invite_expiry_seconds as i64;
            Ok(Json(ValidateLocationResponse::success(
                invite_code,
                config.relay_url.clone(),
                expires_at,
            )))
        }
        Err(e) => {
            error!("Failed to create invite: {}", e);
            Ok(Json(ValidateLocationResponse::error(
                "Failed to create invite".to_string()
            )))
        }
    }
}

pub async fn community_preview(
    State(_config): State<Config>,
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