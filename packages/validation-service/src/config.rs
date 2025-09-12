use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_port")]
    pub port: u16,
    
    #[serde(default = "default_relay_url")]
    pub relay_url: String,
    
    // Admin private key for creating NIP-29 invites
    pub admin_nsec: Option<String>,
    
    #[serde(default = "default_max_distance")]
    pub max_distance_meters: f64,
    
    #[serde(default = "default_max_accuracy")]
    pub max_accuracy_meters: f64,
    
    #[serde(default = "default_invite_expiry")]
    pub invite_expiry_seconds: u64,
}

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        envy::from_env::<Config>()
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

fn default_invite_expiry() -> u64 {
    300 // 5 minutes
}