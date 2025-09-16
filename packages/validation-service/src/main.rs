use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{info, error};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod handlers;
mod libraries;
mod models;
mod services;

use services::{community::CommunityService, relay::RelayService};
use handlers::NostrValidationHandler;

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
    
    // Initialize community service with relay connection
    let community_service = CommunityService::new(
        &config.relay_url,
        &config.relay_secret_key,
    )
    .await
    .expect("Failed to initialize community service");

    let community_service_arc = Arc::new(community_service);

    // Initialize relay service
    let relay_service = RelayService::new(
        config.relay_url.clone(),
        config.relay_secret_key.clone(),
    )
    .await
    .expect("Failed to initialize relay service");

    let relay_service_arc = Arc::new(tokio::sync::RwLock::new(relay_service));

    // Start Nostr validation handler in background
    let nostr_config = config.clone();
    let nostr_community_service = community_service_arc.clone();
    let nostr_relay_service = relay_service_arc.clone();

    tokio::spawn(async move {
        info!("Starting Nostr gift wrap listener");

        let handler = NostrValidationHandler::new(
            nostr_config,
            nostr_community_service,
            nostr_relay_service,
        )
        .await
        .expect("Failed to initialize Nostr handler");

        if let Err(e) = handler.start().await {
            error!("Nostr handler failed: {}", e);
        }
    });

    // Create shared state for REST endpoints
    let app_state = (config.clone(), community_service_arc);

    // Build our application with routes
    let app = Router::new()
        .route("/health", get(handlers::health))
        .route("/api/validate-location", post(handlers::validate_location))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

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
