# Implementation Tasks: Community Hub for Location-Based Groups

**Feature Branch**: `001-build-community-hub`
**Generated**: 2025-09-10
**Total Tasks**: 44

## Overview
Build a PWA client using MKStack scaffolding (React, TypeScript, Tailwind, shadcn/ui, Nostrify) and a Rust validation service that creates NIP-29 invites on the groups_relay for location-based communities.

## Task Execution Strategy

### Parallel Execution
Tasks marked with [P] can be executed in parallel using the Task agent:
```bash
# Example: Execute T001, T002, T003 in parallel
Task: "Complete T001: Initialize monorepo structure"
Task: "Complete T002: Scaffold PWA with MKStack CLI"  
Task: "Complete T003: Setup Rust validation service"
```

### Dependencies
- Setup tasks (T001-T005) must complete first
- Contract tests (T006-T007) before API implementation
- Models (T008-T011) before services
- Services before endpoints
- All core tasks before integration tests

---

## Phase 1: Setup & Infrastructure (T001-T005)

### T001: Initialize monorepo structure [P] ✅
**File**: `/package.json`, `/pnpm-workspace.yaml`
- Create monorepo with pnpm workspaces
- Add packages/ directory structure
- Setup shared/ for common types
- Add root scripts for running all services

### T002: Scaffold PWA with MKStack CLI [P] ✅
**File**: `/packages/pwa-client/`
- Install @getstacks/stacks CLI globally
- Run: stacks naddr1qvzqqqrhl5pzqprpljlvcnpnw3pejvkkhrc3y6wvmd7vjuad0fg2ud3dky66gaxaqqrk66mnw3skx6c4g6ltw
- Move generated project to packages/pwa-client
- Verify Nostrify, shadcn/ui, and Tailwind setup

### T003: Setup Rust validation service [P] ✅
**File**: `/packages/validation-service/Cargo.toml`
- Create Rust project with cargo init
- Add dependencies: axum, tokio, serde, geo, nostr-sdk
- Setup basic Axum server structure
- Add environment config loading

### T004: Configure development environment
**File**: `/.env.example`, `/docker-compose.yml`
- Create .env.example with required variables
- Add docker-compose for local relay (groups_relay)
- Setup development scripts in package.json
- Document environment setup

### T005: Setup CI/CD pipeline [P]
**File**: `/.github/workflows/ci.yml`
- Add GitHub Actions workflow
- Configure Rust tests and clippy
- Configure TypeScript tests and ESLint
- Add build verification

---

## Phase 2: Contract Tests (T006-T007)

### T006: Write contract tests for validate-location endpoint
**File**: `/packages/validation-service/tests/contracts/validate_location.rs`
```rust
// Test successful validation returns invite code
// Test accuracy > 20m rejection
// Test distance > 25m rejection  
// Test expired timestamp rejection
// Test invalid coordinates rejection
```

### T007: Write contract tests for community preview endpoint [P]
**File**: `/packages/validation-service/tests/contracts/community_preview.rs`
```rust
// Test returns community info without auth
// Test handles non-existent community
// Test response matches OpenAPI schema
```

---

## Phase 3: Core Models & Libraries (T008-T013)

### T008: Implement Community model [P] ✅
**File**: `/packages/validation-service/src/models/community.rs`
```rust
pub struct Community {
    pub id: Uuid,
    pub group_id: String,
    pub name: String,
    pub location: Location,
    // ... other fields from data-model.md
}
```

### T009: Implement LocationProof model [P] ✅
**File**: `/packages/validation-service/src/models/location.rs`
```rust
pub struct LocationProof {
    pub coordinates: Coordinates,
    pub accuracy: f64,
    pub timestamp: i64,
}
```

### T010: Implement location-check library [P] ✅
**File**: `/packages/validation-service/src/lib/location_check.rs`
- Use geo crate for haversine distance
- Validate coordinates within 25m radius
- Check GPS accuracy ≤ 20m
- Verify timestamp freshness (30s window)

### T011: Implement invite-creator library [P] ✅ (Replaced with direct group membership via relay service)
**File**: `/packages/validation-service/src/lib/invite_creator.rs`
- Connect to relay using nostr-sdk
- Create kind:9009 events with admin keypair
- Set 5-minute expiration
- Return invite code to caller

### T012: Implement QR scanner library (TypeScript) [P] ✅
**File**: `/packages/pwa-client/src/lib/qr-scanner.ts`
- Integrate @zxing/library
- Parse QR payload (id, relay, lat, lng)
- Validate QR data structure
- Handle camera permissions

### T013: Implement location capture library [P] ✅
**File**: `/packages/pwa-client/src/lib/peek-nostr.ts`
- Extend Nostrify's relay handling for NIP-29
- Add methods for kind:9021 join requests
- Subscribe to group messages
- Handle Peek-specific event types

---

## Phase 4: API Implementation (T014-T015)

### T014: Implement validate-location endpoint ✅
**File**: `/packages/validation-service/src/handlers/validate_location.rs`
- Parse request body
- Call location-check library
- On success, call invite-creator
- Return invite code + relay info
- Handle all error cases

### T015: Implement community preview endpoint ✅ (Merged into validate-location)
**File**: `/packages/validation-service/src/handlers/community_preview.rs`
- Query relay for community metadata
- Return name, description, member count
- Cache results briefly (60s)
- No authentication required

---

## Phase 5: PWA Components (T016-T021)

### T016: Create Location Permission component [P]
**File**: `/packages/pwa-client/src/components/LocationPermission.tsx`
- Use shadcn/ui Alert and Button components
- Request precise location
- Show accuracy indicator
- Handle permission denial
- Display GPS status

### T017: Create Community Preview component [P]
**File**: `/packages/pwa-client/src/components/CommunityPreview.tsx`
- Use shadcn/ui Card and Skeleton components
- Fetch and display preview data
- Show member count
- Display location name
- Join button with loading state

### T018: Create Join Flow page
**File**: `/packages/pwa-client/src/pages/JoinFlow.tsx`
- Use shadcn/ui Stepper or custom flow
- Orchestrate location validation
- Call validation API
- Handle invite code response
- Use Nostrify to send NIP-29 join request

### T019: Create Community Feed component [P]
**File**: `/packages/pwa-client/src/components/CommunityFeed.tsx`
- Use shadcn/ui ScrollArea and Input components
- Display NIP-29 messages via Nostrify subscriptions
- Real-time updates via relay
- Message input/send using Nostrify
- Show member list

### T020: Create Admin Panel component [P]
**File**: `/packages/pwa-client/src/components/AdminPanel.tsx`
- Use shadcn/ui Table and Dialog components
- Member management UI
- Promote/demote/ban actions via Nostrify
- Community settings
- QR code management

### T021: Customize MKStack Home page
**File**: `/packages/pwa-client/src/pages/Home.tsx`
- Adapt MKStack's default home for Peek
- List joined communities from Nostrify
- QR scan button using shadcn/ui
- Navigation to feeds
- Use existing MKStack profile components

---

## Phase 6: Integration Tests (T022-T026)

### T022: Test fresh QR creates community [P]
**File**: `/packages/pwa-client/tests/integration/create-community.test.ts`
- Scan fresh QR
- Verify admin assignment
- Check community creation on relay

### T023: Test on-site join flow [P]
**File**: `/packages/pwa-client/tests/integration/join-community.test.ts`
- Mock GPS within 25m
- Complete join flow
- Verify relay membership

### T024: Test remote join rejection [P]
**File**: `/packages/pwa-client/tests/integration/remote-rejection.test.ts`
- Mock GPS > 25m away
- Verify rejection message
- Check no relay access

### T025: Test admin moderation [P]
**File**: `/packages/pwa-client/tests/integration/admin-actions.test.ts`
- Test promote/demote
- Test ban/unban
- Verify relay events

### T026: Test invite expiration [P]
**File**: `/packages/validation-service/tests/integration/invite_expiry.rs`
- Create invite
- Wait 5+ minutes
- Verify rejection

---

## Phase 7: Services & Utilities (T027-T030)

### T027: Implement API client service
**File**: `/packages/pwa-client/src/services/api.ts`
- Axios/fetch wrapper
- Type-safe requests
- Error handling
- Request/response logging

### T028: Enhance Nostrify relay connections for Peek
**File**: `/packages/pwa-client/src/services/peek-relay.ts`
- Extend Nostrify's relay management
- Add Peek-specific subscriptions
- Handle NIP-29 group events
- Event filtering for communities

### T029: Extend MKStack state for Peek features
**File**: `/packages/pwa-client/src/store/`
- Extend MKStack's existing state management
- Add communities state
- Location validation state
- QR scan history

### T030: Implement error reporting
**File**: `/packages/pwa-client/src/services/error-reporter.ts`
- Capture client errors
- Send to validation service
- Include context (user, action)

---

## Phase 8: Polish & Documentation (T031-T034)

### T031: Add structured logging [P]
**File**: `/packages/validation-service/src/logging.rs`
- Setup tracing/env_logger
- Add request IDs
- Log all API calls
- Performance metrics

### T032: Write E2E tests [P]
**File**: `/e2e/`
- Playwright setup
- Full user journey tests
- Multi-user scenarios
- Performance benchmarks

### T033: Create developer documentation [P]
**File**: `/docs/`, `/README.md`
- Architecture overview
- Setup instructions
- API documentation
- Deployment guide

### T034: Setup production configs [P]
**File**: `/packages/*/Dockerfile`, `/k8s/`
- Docker containers
- Production env configs
- Kubernetes manifests (optional)
- Health check endpoints

---

## Execution Order

### Week 1: Foundation
1. **Parallel Setup**: T001, T002, T003, T005 [P]
2. **Sequential**: T004
3. **Contract Tests**: T006, T007 [P]

### Week 2: Core Implementation
4. **Models & Libraries**: T008-T013 [P]
5. **API Endpoints**: T014, T015

### Week 3: Frontend
6. **Components**: T016-T017, T019, T020 [P]
7. **Pages**: T018, T021
8. **Services**: T027-T030

### Week 4: Testing & Polish
9. **Integration Tests**: T022-T026 [P]
10. **Polish**: T031-T034 [P]

### Week 5: NIP-59 Security Update (Critical)
11. **Backend NIP-59**: T036
12. **Parallel Tasks**: T037, T038, T039 [P]
13. **Verification**: Run full test suite after implementation

### Week 6: Infrastructure Fixes (Critical)
14. **Nostrify Setup**: T040, T041
15. **Parallel Services**: T042, T043, T044 [P]
16. **Verification**: Ensure TypeScript compilation passes

---

## Phase 9: NIP-59 Gift Wrap Implementation (Critical Security Update)

### Week 5: Privacy-Preserving Communication
11. **Gift Wrap Protocol**: T035-T039

### T035: Implement NIP-59 gift wrap client service ✅
**File**: `/packages/pwa-client/src/services/nostr-location.ts`
- Create NostrLocationService class with gift wrap support
- Implement three-layer encryption: rumor → seal → gift wrap
- Use custom ephemeral kinds (27492/27493) for location validation
- Add NIP-44 v2 encryption for all layers
- Generate ephemeral keys for outer gift wrap privacy
- Randomize timestamps to prevent correlation

### T036: Update backend for NIP-59 gift wrap handling
**File**: `/packages/validation-service/src/handlers/nostr_validation.rs`
- Connect to Nostr relays using nostr-sdk crate
- Subscribe to kind 1059 gift wrap events for service pubkey
- Implement gift wrap unwrapping with service private key
- Unseal inner kind 13 events to extract rumor
- Process location validation requests (kind 27492)
- Create and send gift-wrapped responses (kind 27493)

### T037: Configure validation service keypair [P]
**File**: `/packages/validation-service/.env`, `/packages/pwa-client/.env`
- Generate validation service Nostr keypair
- Store private key in validation service environment
- Configure public key in PWA client (VITE_VALIDATION_SERVICE_PUBKEY)
- Document key rotation procedure
- Add key backup and recovery process

### T038: Fix TypeScript compilation errors [P]
**File**: `/packages/pwa-client/src/lib/location-capture.ts`
- Resolve test file import issues
- Fix type definitions for location utilities
- Ensure proper module exports
- Update test configuration for Vitest compatibility

### T039: Write integration tests for NIP-59 flow [P]
**File**: `/packages/pwa-client/tests/integration/gift-wrap-validation.test.ts`
- Test gift wrap creation and encryption
- Test request/response flow end-to-end
- Verify privacy properties (no metadata leaks)
- Test error handling for decryption failures
- Validate timeout and retry behavior

---

## Phase 10: Critical Infrastructure Fixes

### Week 6: Nostrify Integration & NIP-29 Support
12. **Infrastructure Tasks**: T040-T044

### T040: Fix Nostrify import issues
**File**: `/packages/pwa-client/src/lib/nostrify-shim.ts`
- Install @nostrify/nostrify and @nostrify/react packages
- Configure proper module resolution in tsconfig.json
- Update import paths throughout the codebase
- Ensure compatibility with MKStack's bundler configuration
- Add type definitions for Nostrify modules

### T041: Update NostrProvider exports
**File**: `/packages/pwa-client/src/components/NostrProvider.tsx`
- Fix export syntax for NostrProvider component
- Ensure proper default vs named exports
- Update index.ts barrel exports
- Verify all consuming components import correctly

### T042: Create relay connection service
**File**: `/packages/pwa-client/src/services/relay-manager.ts`
- Implement WebSocket connection to wss://peek.hol.is
- Handle connection lifecycle (connect, disconnect, reconnect)
- Implement subscription management for NIP-29 groups
- Add connection status monitoring
- Cache relay state for offline support

### T043: Implement NIP-29 group management
**File**: `/packages/pwa-client/src/services/group-manager.ts`
- Implement group creation (kind 9007)
- Handle member addition (kind 9000)
- Process admin permissions (kind 9002)
- Subscribe to group messages
- Implement group metadata handling (kind 30078)
- Cache group state locally

### T044: Setup validation service public key
**File**: `/packages/pwa-client/.env.development`, `/packages/validation-service/.env`
- Generate Nostr keypair for validation service
- Store private key in validation service .env
- Add VITE_VALIDATION_SERVICE_PUBKEY to PWA client
- Document in .env.example files
- Add key generation script to package.json

---

## Success Criteria
- [ ] All contract tests passing
- [x] Location validation < 500ms
- [ ] PWA installable on mobile
- [x] Relay integration working
- [ ] E2E tests passing
- [ ] Documentation complete

## Notes
- Tests MUST be written before implementation (TDD)
- Each task should result in a separate commit
- Use feature flags for incomplete features
- Keep PRs small and focused
- Run linting before commits

---
*Generated from plan.md, data-model.md, contracts/, and quickstart.md*