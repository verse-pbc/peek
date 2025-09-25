use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default = "default_port")]
    pub port: u16,

    #[serde(default = "default_relay_url")]
    pub relay_url: String,

    // Public relay URL to return to browser clients (defaults to relay_url if not specified)
    #[serde(default = "default_relay_url")]
    pub public_relay_url: String,

    // Relay's secret key for managing groups and accessing all events
    pub relay_secret_key: String,

    // Service private key for NIP-59 gift wrap communication (hex format)
    pub service_secret_key: String,
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
            public_relay_url: default_relay_url(),
            relay_secret_key: String::new(), // Must be provided via environment
            service_secret_key: String::new(), // Must be provided via environment
        }
    }
}

fn default_port() -> u16 {
    3000
}

fn default_relay_url() -> String {
    "wss://communities2.nos.social".to_string()
}
