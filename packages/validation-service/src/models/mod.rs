pub mod community;
pub mod location;
pub mod requests;

// Re-export commonly used types
pub use community::{Community, CommunityStatus, Location as CommunityLocation};
pub use location::{LocationPoint, LocationProof, LocationValidationError};
pub use requests::{
    ValidateLocationRequest, ValidateLocationResponse, CommunityPreview,
};