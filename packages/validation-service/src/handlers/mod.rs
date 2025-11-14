pub mod nostr_validation;

use axum::{response::IntoResponse, Json};

pub use nostr_validation::NostrValidationHandler;

pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "validation-service",
        "version": env!("CARGO_PKG_VERSION")
    }))
}
