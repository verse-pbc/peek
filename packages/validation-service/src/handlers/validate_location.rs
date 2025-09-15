use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use tracing::{debug, error, info};

use crate::{
    config::Config,
    libraries::location_check::{LocationChecker, LocationCheckConfig},
    models::{
        ValidateLocationRequest, ValidateLocationResponse, LocationPoint, CommunityPreview,
    },
    services::community::CommunityService,
};

/// Handle location validation and group membership
/// 
/// This endpoint:
/// 1. For first scan: Creates community with location from scanner
/// 2. For subsequent scans: Validates location against stored community location
/// 3. Directly adds valid users to the NIP-29 group (no invite codes needed)
pub async fn validate_location(
    State((config, community_service)): State<(Config, Arc<CommunityService>)>,
    Json(request): Json<ValidateLocationRequest>,
) -> Result<Json<ValidateLocationResponse>, StatusCode> {
    debug!(
        "Validating location for community: {}, user: {}", 
        request.community_id, 
        request.user_pubkey
    );

    // Extract location from the request
    let user_location = LocationPoint {
        latitude: request.location_proof.coordinates.latitude,
        longitude: request.location_proof.coordinates.longitude,
    };

    // Get or create community
    let (community, is_new) = match community_service.get_or_create(
        request.community_id,
        request.community_id.to_string(), // Using community_id as QR id for now
        user_location.clone(),
        request.user_pubkey.clone(),
    ).await {
        Ok(result) => result,
        Err(e) => {
            error!("Failed to get/create community: {}", e);
            return Ok(Json(ValidateLocationResponse::error(
                "Failed to process community".to_string()
            )));
        }
    };

    if is_new {
        info!(
            "Created new community {} at location ({}, {})",
            community.community_id,
            user_location.latitude,
            user_location.longitude
        );
        
        // First scanner is automatically added as admin
        return Ok(Json(ValidateLocationResponse::success_new_community(
            community.group_id.clone(),
            config.relay_url.clone(),
            community.name.clone(),
        )));
    }

    // Validate location for subsequent scanners
    let check_config = LocationCheckConfig {
        max_distance_meters: config.max_distance_meters,
        max_accuracy_meters: config.max_accuracy_meters,
        max_timestamp_age: 30,  // 30 seconds
    };
    let checker = LocationChecker::with_config(check_config);

    let check_result = checker.validate_location(
        &request.location_proof,
        &community.location,
    );

    debug!(
        "Location check result - passed: {}, distance: {:.1}m, accuracy: {:.1}m",
        check_result.passed, check_result.distance, check_result.accuracy
    );

    if !check_result.passed {
        let error_message = check_result.error
            .map(|e| e.to_string())
            .unwrap_or_else(|| format!(
                "Location validation failed. You are {:.0}m away from the community location.",
                check_result.distance
            ));
        return Ok(Json(ValidateLocationResponse::error(error_message)));
    }

    // Prepare community preview (only shown after passing location check)
    let preview = CommunityPreview {
        name: community.name.clone(),
        description: Some(format!(
            "Location-based community created on {}",
            community.created_at.format("%Y-%m-%d")
        )),
        member_count: 1, // TODO: Get actual count from relay
        created_at: community.created_at.to_rfc3339(),
        is_new: false,
    };

    // Add user directly to the NIP-29 group
    match community_service.add_user_to_group(
        &community.group_id,
        &request.user_pubkey,
    ).await {
        Ok(_) => {
            info!(
                "Added user {} to community group {}",
                request.user_pubkey,
                community.community_id
            );
            
            Ok(Json(ValidateLocationResponse::success_join_community(
                community.group_id.clone(),
                config.relay_url.clone(),
                preview,
            )))
        }
        Err(e) => {
            error!("Failed to add user to group: {}", e);
            Ok(Json(ValidateLocationResponse::error(
                "Failed to add to community".to_string()
            )))
        }
    }
}