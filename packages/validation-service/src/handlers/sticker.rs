use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};

use crate::services::sticker_generator::{generate_sticker_svg, StickerConfig};

pub async fn generate_sticker() -> Response {
    let config = StickerConfig {
        base_url: std::env::var("BASE_URL")
            .unwrap_or_else(|_| "https://peek.verse.app".to_string()),
        ..Default::default()
    };

    match generate_sticker_svg(&config) {
        Ok(svg_content) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "image/svg+xml")],
            svg_content,
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to generate sticker: {}", e),
        )
            .into_response(),
    }
}
