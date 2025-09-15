# Feature Specification: Community Hub for Location-Based Groups

**Feature Branch**: `001-build-community-hub`  
**Created**: 2025-09-10  
**Status**: Draft  
**Input**: User description: "Build 'Community Hub for Location-Based Groups': people join hyperlocal communities by scanning a physical QR posted at a venue (café, park, building, event). A fresh QR's first scan creates the community and assigns that scanner as admin; later scans show a join screen and add the member. Joining requires on-site proof of presence: (a) an on-location photo with the posted QR clearly visible and (b) geofence pass where device-reported position is within ≤25 m of the QR's lat/lng AND horizontal accuracy ≤20 m; both thresholds are hardcoded for typical phone GNSS error. Remote scans (screenshots/forwarded codes) must fail. Communities persist so members can keep chatting after leaving the location. Admin can rename, set description/rules, promote/demote co-admins, remove members, and mute/ban for spam. Discovery is physical-first: there is no global search; access requires scanning the specific QR. Identity is Nostr-based: users must join with a Nostr account (npub), either importing an existing one or creating a new one; membership and admin/bans bind to the pubkey."

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identified: users, communities, QR codes, admins, location verification, Nostr identity
3. For each unclear aspect:
   → All aspects clearly specified in input
4. Fill User Scenarios & Testing section
   → User flows clearly defined
5. Generate Functional Requirements
   → Each requirement is testable
   → No ambiguous requirements remain
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → No [NEEDS CLARIFICATION] items
   → No implementation details included
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

---

## Core Concept: Two-Phase QR Code Lifecycle

### Phase 1: Setup Phase (Fresh QR)
When a QR code is scanned for the first time, it enters setup phase where the first scanner claims ownership and establishes the community. The first scanner's GPS location becomes the permanent location for that community. This person automatically becomes the founding admin with full control over the community settings.

### Phase 2: Join Phase (Established Community)
After initial setup, all subsequent scans enter join phase where visitors must prove physical presence through GPS verification. If they are within 25 meters of the community's established location (with GPS accuracy ≤20m), they are automatically added to the NIP-29 group.

## User Scenarios & Testing *(mandatory)*

### Primary User Story
A person visits a local café and notices a QR code posted on the community board. They scan it with their phone, creating a new hyperlocal community for that café with their current GPS location set as the community's permanent location. As the first scanner, they become the admin. Other café visitors scan the same QR code and are automatically added to the community if their GPS shows they are within 25 meters of the original location. Members can continue chatting and participating in the community even after leaving the café, but new members must be physically present to join.

### Travel & Discovery Pattern
A traveler visiting Oslo discovers a QR code at a popular coffee shop. They scan it, take a photo showing the QR in its physical location, and join the local community. After returning home to New York, they maintain their membership and can continue participating in discussions, sharing experiences, and connecting with other people who've visited that same Oslo café. This creates lasting connections between people who've shared the same physical spaces.

### Acceptance Scenarios
1. **Given** a fresh QR code that has never been scanned, **When** a user scans it, **Then** a new community is created with a stable ID and the scanner becomes the admin
2. **Given** an existing community QR code, **When** a new user scans it on-site, **Then** they see a join screen showing community preview (name, description, member count)
3. **Given** a user attempting to join, **When** they are within 25m of the community's established location AND have horizontal accuracy ≤20m, **Then** they are automatically added to the NIP-29 group
4. **Given** a user attempting to join, **When** they are more than 25m away OR horizontal accuracy >20m, **Then** join is rejected with a clear reason
5. **Given** someone shares a QR code image or text online, **When** a remote user tries to scan it, **Then** they fail presence verification and cannot join
6. **Given** an existing member, **When** they access the community from anywhere, **Then** they can participate without re-verification
7. **Given** an admin user, **When** they access admin controls, **Then** they can rename community, set description/rules, promote/demote co-admins, remove members, and mute/ban users
8. **Given** a banned user's Nostr pubkey, **When** they try to rejoin via the same QR, **Then** they are prevented from joining unless unbanned
9. **Given** a QR code contains only a URL with community ID, **When** it's shared or reproduced, **Then** access still requires physical presence at the original location
10. **Given** the validation service has the relay's secret key, **When** a user passes location validation, **Then** they are directly added to the NIP-29 group without invite codes

### Edge Cases
- What happens when GPS signal is poor? System rejects join if horizontal accuracy exceeds 20m threshold
- What happens when multiple people scan a fresh QR simultaneously? First scanner to complete the process becomes admin and sets the community location
- How does the QR code work? Contains only a URL with unique community identifier, no location data
- What happens if network connection is lost during join? Join must complete on-site with live connection; no deferred completion
- How are community name conflicts handled? Each community has a unique stable ID regardless of name

## Community Administration & Governance

### Admin Establishment
The first person to scan a fresh QR code becomes the founding administrator with complete control over the community. This ownership model ensures every community has a clear leader from inception who was physically present at the location.

### Admin Capabilities
- **Community Settings**: Rename community, update description, establish community rules
- **Member Management**: View member list, remove disruptive members, review join requests if moderation enabled
- **Moderation Tools**: Mute members temporarily, ban users permanently (by Nostr pubkey), unban previously banned users
- **Admin Hierarchy**: Promote trusted members to co-admin status, demote co-admins if needed, transfer primary ownership

### Spam Prevention & Moderation
Communities naturally resist spam through the physical presence requirement, but admins have additional tools to maintain quality:
- Ban disruptive users by their Nostr pubkey (prevents rejoin attempts)
- Mute members for temporary infractions
- Set community rules visible to all members
- Remove content that violates community standards

## Anti-Spam & Physical Presence Verification

### GPS-Based Presence Validation
The system prevents remote access through GPS verification:

**Geofence Validation**: Device GPS must report position within 25 meters of the community's established location (set by the first scanner) with horizontal accuracy ≤20 meters. These hardcoded thresholds account for typical smartphone GNSS error while preventing remote joins.

### Technical Measures Against Fraud
- **Dynamic Location Setting**: First scanner sets the community location, preventing pre-knowledge of expected coordinates
- **Location Spoofing Resistance**: Spoofers would need both the QR's unique ID and knowledge of where it was first scanned
- **Timestamp Validation**: GPS data must be fresh (within 30 seconds)
- **Direct Group Addition**: Validation service uses relay's secret key to add members directly, no invite codes to share
- **Combined Requirements**: Need both the unique QR identifier AND physical presence at the original location

### Why Physical Presence Matters
This GPS verification creates a community of people who've genuinely shared the same physical space, establishing higher trust and authenticity than purely digital communities. The effort required to physically visit the location naturally filters out spam and creates meaningful local connections.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST create a new community with stable ID when a fresh QR code is scanned for the first time
- **FR-002**: System MUST assign admin role to the first scanner of a fresh QR code
- **FR-003**: System MUST require on-site presence verification for joining through GPS geofence validation
- **FR-004**: System MUST validate that joining user is within 25 meters of the community's established location with horizontal accuracy ≤20 meters
- **FR-005**: System MUST set community location from the first scanner's GPS coordinates
- **FR-006**: System MUST reject join attempts from users not physically present at the community location
- **FR-007**: System MUST show clear rejection reason when presence verification fails
- **FR-008**: System MUST allow existing members to access community from anywhere without re-verification
- **FR-009**: System MUST provide admin capabilities: rename, set description/rules, promote/demote co-admins, remove members, mute/ban
- **FR-010**: System MUST bind membership and admin/ban status to Nostr pubkey
- **FR-011**: System MUST prevent banned pubkeys from rejoining via same QR unless unbanned
- **FR-012**: System MUST show pre-join preview with community name, description, and member count
- **FR-013**: System MUST prevent message access until user has been added to the NIP-29 group
- **FR-014**: System MUST store community location set by first scanner in relay as encrypted metadata
- **FR-015**: System MUST use relay's secret key to directly add validated users to NIP-29 groups
- **FR-016**: System MUST store QR codes as URLs containing only community identifier
- **FR-017**: System MUST require live connection for verification and join completion on-site
- **FR-018**: System MUST NOT allow deferred or grace-window join completion after leaving location
- **FR-019**: System MUST maintain consistent community location even if QR code is reprinted
- **FR-020**: System MUST use validation service with relay secret key for group management
- **FR-021**: System MUST require users to have or create a Nostr account (npub) to join
- **FR-022**: System MUST support both importing existing Nostr accounts and creating new ones
- **FR-023**: System MUST NOT provide global search or directory of communities
- **FR-024**: System MUST require physical QR scanning for community discovery

### Key Entities
- **Community**: Represents a hyperlocal group tied to a physical location, with unique stable ID, name, description, rules, and member list
- **QR Code**: Physical identifier posted at venue, contains only a URL with unique community ID (e.g., https://peek.com/c/{uuid})
- **User**: Person with Nostr identity (pubkey/npub), can be regular member, co-admin, or admin
- **Membership**: Relationship between user and community, includes join timestamp, verification status, and role
- **Community Location**: GPS coordinates established by first scanner, stored as encrypted metadata on relay
- **Admin Action**: Moderation events like promote, demote, remove, mute, ban, tied to admin's pubkey
- **Ban Record**: Prohibition of specific pubkey from rejoining community, can be reversed by admin

## QR Code Distribution & Placement Context

### Distribution Methods
- **Printable Stickers**: Downloadable QR designs optimized for weather-resistant sticker printing
- **Digital Templates**: PDF/PNG files for businesses to print and laminate
- **Physical Ordering**: Option to order pre-printed waterproof stickers for venues
- **Event Materials**: Temporary QR codes for conferences, festivals, and gatherings

### Strategic Placement Scenarios
- **Businesses**: Coffee shops, restaurants, bars, bookstores - creating customer communities
- **Public Spaces**: Parks, libraries, community centers - fostering local civic engagement
- **Events**: Conferences, concerts, meetups - connecting attendees beyond the event
- **Buildings**: Apartment complexes, offices - building neighbor/colleague networks
- **Tourist Spots**: Landmarks, museums - linking travelers who've visited same places

### Placement Considerations
QR codes should be placed where they're easily discoverable but not intrusive, at eye level when possible, protected from weather if outdoors, and in locations where people naturally gather or pause. The physical placement becomes part of the community's identity and story.

## Privacy & Trust Benefits

### Higher Trust Through Physical Verification
Physical presence requirements create an inherent trust layer absent in purely digital communities. Members know that everyone in the community has genuinely visited the same location, creating shared experience and reducing anonymous trolling behavior.

### Natural Spam Resistance
The effort required to physically visit a location and complete dual verification naturally filters out:
- Bot accounts and automated spam
- Mass marketing attempts
- Drive-by trolling
- Low-effort disruption

### Privacy-First Design
- **Data Minimization**: Only community location stored, individual join locations not retained
- **No Photo Storage**: System uses GPS only, no photo capture or storage
- **Direct Group Membership**: No invite codes or tokens that could be intercepted
- **No Tracking**: System doesn't track member movements or location history
- **Decentralized Identity**: Nostr-based identity means no central authority controls user accounts

### Community Value Proposition
Communities formed through shared physical presence have stronger bonds than purely digital groups. The verification friction is a feature, not a bug - it ensures quality over quantity and creates communities of people with genuine shared experiences.

## Scope Clarifications

### Community Persistence
Once a user successfully joins a community by proving physical presence, they maintain permanent access regardless of their current location. A member who joined an Oslo café community can participate from anywhere in the world. The physical presence requirement applies only at the moment of joining, not for ongoing participation.

### Nostr Ecosystem Integration
By using Nostr for identity, Peek communities become part of the larger decentralized social web:
- **Portable Identity**: Users bring their existing Nostr identity or create one within Peek
- **No Platform Lock-in**: Communities aren't controlled by a single company
- **Interoperability**: Potential for cross-app community participation
- **Censorship Resistance**: Decentralized architecture prevents single-point takedowns
- **User Sovereignty**: Users own their identity and can't be deplatformed

This positions Peek as a physical-first entry point into the decentralized social ecosystem, bridging real-world locations with digital communities in a trust-minimized way.

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous  
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---