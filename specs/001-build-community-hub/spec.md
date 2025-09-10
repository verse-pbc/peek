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

## User Scenarios & Testing *(mandatory)*

### Primary User Story
A person visits a local café and notices a QR code posted on the community board. They scan it with their phone, creating a new hyperlocal community for that café. As the first scanner, they become the admin. Other café visitors scan the same QR code, verify their physical presence by taking a photo showing the QR code and passing the geofence check, and join the community. Members can continue chatting and participating in the community even after leaving the café, but new members must be physically present to join.

### Acceptance Scenarios
1. **Given** a fresh QR code that has never been scanned, **When** a user scans it, **Then** a new community is created with a stable ID and the scanner becomes the admin
2. **Given** an existing community QR code, **When** a new user scans it on-site, **Then** they see a join screen showing community preview (name, description, member count)
3. **Given** a user attempting to join, **When** they are within 25m of the QR location AND provide a photo with the QR visible AND have horizontal accuracy ≤20m, **Then** they successfully join the community
4. **Given** a user attempting to join, **When** they are more than 25m away OR horizontal accuracy >20m OR photo is missing/invalid, **Then** join is rejected with a clear reason
5. **Given** someone shares a QR code image or text online, **When** a remote user tries to scan it, **Then** they fail presence verification and cannot join
6. **Given** an existing member, **When** they access the community from anywhere, **Then** they can participate without re-verification
7. **Given** an admin user, **When** they access admin controls, **Then** they can rename community, set description/rules, promote/demote co-admins, remove members, and mute/ban users
8. **Given** a banned user's Nostr pubkey, **When** they try to rejoin via the same QR, **Then** they are prevented from joining unless unbanned
9. **Given** an admin wants to update the physical QR, **When** they rotate/replace it, **Then** old codes become invalid for new joins but existing members retain access
10. **Given** a member wants to leave, **When** they request deletion, **Then** their verification artifacts are removed while preserving only pass/fail result

### Edge Cases
- What happens when GPS signal is poor? System rejects join if horizontal accuracy exceeds 20m threshold
- What happens when multiple people scan a fresh QR simultaneously? First scanner to complete the process becomes admin
- How does system handle photo manipulation attempts? Photo must clearly show the physical QR code at the location
- What happens if network connection is lost during join? Join must complete on-site with live connection; no deferred completion
- How are community name conflicts handled? Each community has a unique stable ID regardless of name

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST create a new community with stable ID when a fresh QR code is scanned for the first time
- **FR-002**: System MUST assign admin role to the first scanner of a fresh QR code
- **FR-003**: System MUST require on-site presence verification for joining, consisting of both photo proof AND geofence validation
- **FR-004**: System MUST validate that joining user is within 25 meters of QR location with horizontal accuracy ≤20 meters
- **FR-005**: System MUST require an on-location photo showing the posted QR code clearly visible
- **FR-006**: System MUST reject join attempts from screenshots, forwarded codes, or any off-site scanning
- **FR-007**: System MUST show clear rejection reason when presence verification fails
- **FR-008**: System MUST allow existing members to access community from anywhere without re-verification
- **FR-009**: System MUST provide admin capabilities: rename, set description/rules, promote/demote co-admins, remove members, mute/ban
- **FR-010**: System MUST bind membership and admin/ban status to Nostr pubkey
- **FR-011**: System MUST prevent banned pubkeys from rejoining via same QR unless unbanned
- **FR-012**: System MUST show pre-join preview with community name, description, and member count
- **FR-013**: System MUST prevent message access until user has successfully joined
- **FR-014**: System MUST store only verification result (pass/fail) and coarse location bucket after verification
- **FR-015**: System MUST discard raw GPS coordinates and photos after verification is complete
- **FR-016**: System MUST allow members to request deletion of their verification artifacts
- **FR-017**: System MUST require live connection for verification and join completion on-site
- **FR-018**: System MUST NOT allow deferred or grace-window join completion after leaving location
- **FR-019**: System MUST allow admins to rotate/replace physical QR codes
- **FR-020**: System MUST invalidate old QR codes for new joins while maintaining existing member access
- **FR-021**: System MUST require users to have or create a Nostr account (npub) to join
- **FR-022**: System MUST support both importing existing Nostr accounts and creating new ones
- **FR-023**: System MUST NOT provide global search or directory of communities
- **FR-024**: System MUST require physical QR scanning for community discovery

### Key Entities
- **Community**: Represents a hyperlocal group tied to a physical location, with unique stable ID, name, description, rules, and member list
- **QR Code**: Physical identifier posted at venue, contains community ID and location coordinates (lat/lng)
- **User**: Person with Nostr identity (pubkey/npub), can be regular member, co-admin, or admin
- **Membership**: Relationship between user and community, includes join timestamp, verification status, and role
- **Verification Record**: Proof of presence consisting of pass/fail result and coarse location bucket (raw data discarded)
- **Admin Action**: Moderation events like promote, demote, remove, mute, ban, tied to admin's pubkey
- **Ban Record**: Prohibition of specific pubkey from rejoining community, can be reversed by admin

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