mod validate_location;

use axum::{
    response::IntoResponse,
    Json,
};

pub use validate_location::validate_location;

pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "validation-service",
        "version": env!("CARGO_PKG_VERSION")
    }))
}