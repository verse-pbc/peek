use axum::{routing::get, Router};
use std::sync::Arc;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod handlers;
mod libraries;
mod models;
mod services;

#[cfg(test)]
mod test_gift_wrap;

#[cfg(test)]
mod test_h_tag_filter;

use handlers::{get_community_discovery, get_discovery_map, health, NostrValidationHandler};
use services::{community::CommunityService, relay::RelayService};

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

    info!("Starting validation service (Nostr-only mode)");

    // Initialize community service with relay connection
    let community_service = CommunityService::new(&config.relay_url, &config.relay_secret_key)
        .await
        .expect("Failed to initialize community service");

    let community_service_arc = Arc::new(community_service);

    // Initialize relay service
    let relay_service =
        RelayService::new(config.relay_url.clone(), config.relay_secret_key.clone())
            .await
            .expect("Failed to initialize relay service");

    let relay_service_arc = Arc::new(tokio::sync::RwLock::new(relay_service));

    // Start Nostr validation handler in background
    let nostr_config = config.clone();
    let nostr_community_service = community_service_arc.clone();
    let nostr_relay_service = relay_service_arc.clone();

    tokio::spawn(async move {
        info!("Starting Nostr gift wrap listener");

        let handler =
            NostrValidationHandler::new(nostr_config, nostr_community_service, nostr_relay_service)
                .await
                .expect("Failed to initialize Nostr handler");

        if let Err(e) = handler.start().await {
            error!("Nostr handler failed: {}", e);
        }
    });

    // Set up HTTP server for health checks and discovery endpoints
    let app = Router::new()
        .route("/health", get(health))
        .route("/api/health", get(health))
        .route("/api/discovery", get(get_discovery_map))
        .route("/api/discovery/:community_id", get(get_community_discovery))
        .with_state(relay_service_arc.clone());

    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", config.port).parse().unwrap();
    info!("HTTP server listening on {}", addr);
    info!("Validation service running. Listening for Nostr gift wrap messages and serving health endpoint.");

    // Run the HTTP server
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .await
        .expect("Failed to start HTTP server");

    info!("Shutting down...");
}
