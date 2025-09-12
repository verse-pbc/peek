use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod handlers;
mod libraries;
mod models;
mod services;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "validation_service=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenv::dotenv().ok();
    let config = config::Config::from_env().expect("Failed to load configuration");

    info!("Starting validation service on port {}", config.port);

    // Build our application with routes
    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/api/validate-location", post(handlers::validate_location))
        .route("/api/community/preview", get(handlers::community_preview))
        .layer(CorsLayer::permissive())
        .with_state(config.clone());

    // Run it
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    info!("Listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to address");
        
    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
