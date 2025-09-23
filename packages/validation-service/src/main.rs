use std::sync::Arc;
use tracing::{info, error};
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

    info!("Starting validation service (Nostr-only mode)");
    
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

    // Keep the service running
    // The Nostr handler is running in a background task
    info!("Validation service running. Listening for Nostr gift wrap messages only.");

    // Block forever since we're only running the Nostr listener
    tokio::signal::ctrl_c().await.expect("Failed to install Ctrl-C handler");
    info!("Shutting down...");
}
