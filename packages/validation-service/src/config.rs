use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_port")]
    pub port: u16,
    
    #[serde(default = "default_relay_url")]
    pub relay_url: String,
    
    // Relay's secret key for managing groups and accessing all events
    pub relay_secret_key: String,
    
    // Admin private key for creating NIP-29 invites (deprecated, using relay key instead)
    pub admin_nsec: Option<String>,

    // Service private key for NIP-59 gift wrap communication
    pub service_nsec: String,

    #[serde(default = "default_max_distance")]
    pub max_distance_meters: f64,

    #[serde(default = "default_max_accuracy")]
    pub max_accuracy_meters: f64,

    #[serde(default = "default_max_timestamp_age")]
    pub max_timestamp_age_seconds: i64,

    #[serde(default = "default_invite_expiry")]
    pub invite_expiry_seconds: u64,
}

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        envy::from_env::<Config>()
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: default_port(),
            relay_url: default_relay_url(),
            relay_secret_key: String::new(), // Must be provided via environment
            admin_nsec: None,
            service_nsec: String::new(), // Must be provided via environment
            max_distance_meters: default_max_distance(),
            max_accuracy_meters: default_max_accuracy(),
            max_timestamp_age_seconds: default_max_timestamp_age(),
            invite_expiry_seconds: default_invite_expiry(),
        }
    }
}

fn default_port() -> u16 {
    3000
}

fn default_relay_url() -> String {
    "wss://peek.hol.is".to_string()
}

fn default_max_distance() -> f64 {
    25.0 // 25 meters
}

fn default_max_accuracy() -> f64 {
    20.0 // 20 meters
}

fn default_max_timestamp_age() -> i64 {
    30 // 30 seconds
}

fn default_invite_expiry() -> u64 {
    300 // 5 minutes
}