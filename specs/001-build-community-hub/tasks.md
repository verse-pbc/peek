# Implementation Tasks: Community Hub for Location-Based Groups

**Feature Branch**: `001-build-community-hub`  
**Generated**: 2025-09-10  
**Total Tasks**: 35

## Overview
Build a PWA client with MKStack and a Rust validation service that creates NIP-29 invites on the groups_relay for location-based communities.

## Task Execution Strategy

### Parallel Execution
Tasks marked with [P] can be executed in parallel using the Task agent:
```bash
# Example: Execute T001, T002, T003 in parallel
Task: "Complete T001: Initialize monorepo structure"
Task: "Complete T002: Setup PWA client with MKStack"  
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

### T001: Initialize monorepo structure [P]
**File**: `/package.json`, `/pnpm-workspace.yaml`
- Create monorepo with pnpm workspaces
- Add packages/ directory structure
- Setup shared/ for common types
- Add root scripts for running all services

### T002: Setup PWA client with MKStack [P]
**File**: `/packages/pwa-client/`
- Initialize Vite + React + TypeScript project
- Configure MKStack (Tailwind, PWA manifest)
- Setup routing with React Router
- Add service worker for offline support

### T003: Setup Rust validation service [P]
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

### T008: Implement Community model [P]
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

### T009: Implement LocationProof model [P]
**File**: `/packages/validation-service/src/models/location.rs`
```rust
pub struct LocationProof {
    pub coordinates: Coordinates,
    pub accuracy: f64,
    pub timestamp: i64,
}
```

### T010: Implement location-check library [P]
**File**: `/packages/validation-service/src/lib/location_check.rs`
- Use geo crate for haversine distance
- Validate coordinates within 25m radius
- Check GPS accuracy ≤ 20m
- Verify timestamp freshness (30s window)

### T011: Implement invite-creator library [P]
**File**: `/packages/validation-service/src/lib/invite_creator.rs`
- Connect to relay using nostr-sdk
- Create kind:9009 events with admin keypair
- Set 5-minute expiration
- Return invite code to caller

### T012: Implement QR scanner library (TypeScript) [P]
**File**: `/packages/pwa-client/src/lib/qr-scanner.ts`
- Integrate @zxing/library
- Parse QR payload (id, relay, lat, lng)
- Validate QR data structure
- Handle camera permissions

### T013: Implement Nostr client wrapper (TypeScript) [P]
**File**: `/packages/pwa-client/src/lib/nostr-client.ts`
- Wrap nostr-tools for NIP-29
- Handle relay connections
- Send kind:9021 join requests
- Subscribe to group messages

---

## Phase 4: API Implementation (T014-T015)

### T014: Implement validate-location endpoint
**File**: `/packages/validation-service/src/handlers/validate_location.rs`
- Parse request body
- Call location-check library
- On success, call invite-creator
- Return invite code + relay info
- Handle all error cases

### T015: Implement community preview endpoint
**File**: `/packages/validation-service/src/handlers/community_preview.rs`
- Query relay for community metadata
- Return name, description, member count
- Cache results briefly (60s)
- No authentication required

---

## Phase 5: PWA Components (T016-T022)

### T016: Create QR Scanner component [P]
**File**: `/packages/pwa-client/src/components/QRScanner.tsx`
- Full-screen camera view
- QR detection overlay
- Parse and validate QR data
- Navigate to join flow

### T017: Create Location Permission component [P]
**File**: `/packages/pwa-client/src/components/LocationPermission.tsx`
- Request precise location
- Show accuracy indicator
- Handle permission denial
- Display GPS status

### T018: Create Community Preview component [P]
**File**: `/packages/pwa-client/src/components/CommunityPreview.tsx`
- Fetch and display preview data
- Show member count
- Display location name
- Join button

### T019: Create Join Flow page
**File**: `/packages/pwa-client/src/pages/JoinFlow.tsx`
- Orchestrate location validation
- Call validation API
- Handle invite code response
- Send NIP-29 join request

### T020: Create Community Feed component [P]
**File**: `/packages/pwa-client/src/components/CommunityFeed.tsx`
- Display NIP-29 messages
- Real-time updates via relay
- Message input/send
- Show member list

### T021: Create Admin Panel component [P]
**File**: `/packages/pwa-client/src/components/AdminPanel.tsx`
- Member management UI
- Promote/demote/ban actions
- Community settings
- QR code management

### T022: Create Home page with communities list
**File**: `/packages/pwa-client/src/pages/Home.tsx`
- List joined communities
- QR scan button
- Navigation to feeds
- Profile management

---

## Phase 6: Integration Tests (T023-T027)

### T023: Test fresh QR creates community [P]
**File**: `/packages/pwa-client/tests/integration/create-community.test.ts`
- Scan fresh QR
- Verify admin assignment
- Check community creation on relay

### T024: Test on-site join flow [P]
**File**: `/packages/pwa-client/tests/integration/join-community.test.ts`
- Mock GPS within 25m
- Complete join flow
- Verify relay membership

### T025: Test remote join rejection [P]
**File**: `/packages/pwa-client/tests/integration/remote-rejection.test.ts`
- Mock GPS > 25m away
- Verify rejection message
- Check no relay access

### T026: Test admin moderation [P]
**File**: `/packages/pwa-client/tests/integration/admin-actions.test.ts`
- Test promote/demote
- Test ban/unban
- Verify relay events

### T027: Test invite expiration [P]
**File**: `/packages/validation-service/tests/integration/invite_expiry.rs`
- Create invite
- Wait 5+ minutes
- Verify rejection

---

## Phase 7: Services & Utilities (T028-T031)

### T028: Implement API client service
**File**: `/packages/pwa-client/src/services/api.ts`
- Axios/fetch wrapper
- Type-safe requests
- Error handling
- Request/response logging

### T029: Implement relay connection service
**File**: `/packages/pwa-client/src/services/relay.ts`
- WebSocket management
- Auto-reconnection
- Subscription handling
- Event filtering

### T030: Implement state management
**File**: `/packages/pwa-client/src/store/`
- Zustand or Context setup
- User profile state
- Communities state
- Messages cache

### T031: Implement error reporting
**File**: `/packages/pwa-client/src/services/error-reporter.ts`
- Capture client errors
- Send to validation service
- Include context (user, action)

---

## Phase 8: Polish & Documentation (T032-T035)

### T032: Add structured logging [P]
**File**: `/packages/validation-service/src/logging.rs`
- Setup tracing/env_logger
- Add request IDs
- Log all API calls
- Performance metrics

### T033: Write E2E tests [P]
**File**: `/e2e/`
- Playwright setup
- Full user journey tests
- Multi-user scenarios
- Performance benchmarks

### T034: Create developer documentation [P]
**File**: `/docs/`, `/README.md`
- Architecture overview
- Setup instructions
- API documentation
- Deployment guide

### T035: Setup production configs [P]
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
6. **Components**: T016-T018, T020, T021 [P]
7. **Pages**: T019, T022
8. **Services**: T028-T031

### Week 4: Testing & Polish
9. **Integration Tests**: T023-T027 [P]
10. **Polish**: T032-T035 [P]

---

## Success Criteria
- [ ] All contract tests passing
- [ ] Location validation < 500ms
- [ ] PWA installable on mobile
- [ ] Relay integration working
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