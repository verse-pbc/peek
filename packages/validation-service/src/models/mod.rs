pub mod community;
pub mod location;
pub mod requests;

// Re-export commonly used types
pub use community::{Community, CommunityPreview, CommunityStatus, Location as CommunityLocation};
pub use location::{LocationPoint, LocationProof, LocationValidationError};
pub use requests::{
    ValidateLocationRequest, ValidateLocationResponse,
    CommunityPreviewRequest, CommunityPreviewResponse,
    LocationInfo
};