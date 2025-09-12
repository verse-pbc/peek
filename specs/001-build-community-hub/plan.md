# Implementation Plan: Community Hub for Location-Based Groups

**Branch**: `001-build-community-hub` | **Date**: 2025-09-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-build-community-hub/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → Feature spec loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → No NEEDS CLARIFICATION items found in spec
   → Set Structure Decision: Option 2 (Web application)
3. Evaluate Constitution Check section below
   → Initial assessment shows compliance with simplicity
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → Research MKStack, NIP-29, location validation approaches
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
6. Re-evaluate Constitution Check section
   → Design maintains simplicity
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach
8. STOP - Ready for /tasks command
```

## Summary
Build a location-based community platform where physical QR codes at venues create hyperlocal groups. Users must prove physical presence through GPS validation and photo verification to join. Implementation uses MKStack for PWA client, NIP-29 relays for decentralized messaging, and a validation service for location verification.

## Technical Context
**Language/Version**: TypeScript 5.0+ (PWA), Rust 1.75+ (validation service)  
**Primary Dependencies**: MKStack (Vite, React, Tailwind), Axum, nostr-tools, @zxing/library, geo crate  
**Storage**: Redis for short-lived tokens, verse-pbc/groups_relay for community data  
**Testing**: Vitest for frontend, cargo test for Rust, Playwright for E2E  
**Target Platform**: Progressive Web App (iOS/Android/Desktop browsers)
**Project Type**: web - PWA client + Rust validation service  
**Performance Goals**: <500ms join verification, 60fps UI, offline message reading  
**Constraints**: 25m geofence radius, 20m GPS accuracy threshold, live connection required for join  
**Scale/Scope**: MVP for 100 communities, 10k users, single relay initially

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 2 (pwa-client, validation-service)
- Using framework directly? Yes (MKStack, Fastify without wrappers)
- Single data model? Yes (NIP-29 events + join tokens)
- Avoiding patterns? Yes (no Repository/UoW, direct relay access)

**Architecture**:
- EVERY feature as library? Yes (location-check, token-issuer, qr-scanner)
- Libraries listed:
  - location-check: Validates GPS coordinates within radius (Rust)
  - token-issuer: Creates/validates JWT and NIP-29 invites (Rust)
  - qr-scanner: Decodes QR codes and extracts community data (TS)
  - nostr-client: Wraps nostr-tools for NIP-29 operations (TS)
- CLI per library: Rust crates expose CLI bins, TS libs have CLI wrappers
- Library docs: llms.txt format planned for each library

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes
- Git commits show tests before implementation? Will enforce
- Order: Contract→Integration→E2E→Unit strictly followed? Yes
- Real dependencies used? Yes (actual Redis, relay instances)
- Integration tests for: new libraries, contract changes, shared schemas? Yes
- FORBIDDEN: Implementation before test - understood

**Observability**:
- Structured logging included? Yes (pino for backend, console for PWA)
- Frontend logs → backend? Yes (error reporting endpoint)
- Error context sufficient? Yes (user ID, community ID, action context)

**Versioning**:
- Version number assigned? 0.1.0
- BUILD increments on every change? Yes
- Breaking changes handled? N/A for MVP

## Project Structure

### Documentation (this feature)
```
specs/001-build-community-hub/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 2: Web application (PWA + backend service)
packages/
├── pwa-client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── lib/
│   └── tests/
└── validation-service/  # Rust service
    ├── src/
    │   ├── handlers/
    │   ├── services/
    │   ├── models/
    │   └── lib/
    ├── tests/
    └── Cargo.toml

shared/
├── contracts/
└── types/
```

**Structure Decision**: Option 2 (Web application) - PWA client + validation backend

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context**:
   - MKStack implementation patterns for PWA
   - NIP-29 relay integration best practices
   - Photo verification approaches (MVP deferred)
   - Geolocation API accuracy handling
   - Token signing strategies (JWT vs Paseto)

2. **Generate and dispatch research agents**:
   ```
   Task: "Research MKStack PWA setup with Vite and React"
   Task: "Research verse-pbc/groups_relay NIP-29 implementation"
   Task: "Research Rust Axum patterns for API services"
   Task: "Research geo crate for haversine calculations"
   Task: "Research Redis integration with Rust"
   ```

3. **Consolidate findings** in `research.md`

**Output**: research.md with all technical decisions documented

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Community (NIP-29 group with location metadata)
   - NIP29InviteCode (relay invite, short-lived, single-use)
   - LocationProof (coordinates, accuracy, timestamp)
   - QRPayload (community ID, relay URL, location)

2. **Generate API contracts** from functional requirements:
   - POST /api/validate-location - Submit location, get invite code
   - GET /api/community/preview - Pre-join community info

3. **Generate contract tests** from contracts:
   - Test location validation edge cases
   - Test invite code expiry and single-use
   - Test preview without authentication

4. **Extract test scenarios** from user stories:
   - Fresh QR scan creates community
   - On-site user successfully joins
   - Remote user fails verification
   - Admin manages community

5. **Update CLAUDE.md incrementally**:
   - Add MKStack, NIP-29, geolocation context
   - Document project structure
   - Note MVP deferrals

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Generate from contracts: 2 API endpoint tests [P]
- Generate from entities: 4 model creation tasks [P]
- Generate from user stories: 4 integration test tasks
- Implementation tasks: PWA setup, validation service, relay integration
- UI component tasks: QR scanner, location prompt, community feed

**Ordering Strategy**:
1. Environment setup (MKStack, Fastify scaffolding) [P]
2. Contract tests (must fail first)
3. Models and libraries [P]
4. API implementation to pass contract tests
5. PWA components and pages
6. Integration tests
7. E2E test scenarios

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following TDD)  
**Phase 5**: Validation (run tests, execute quickstart.md, deploy MVP)

## Complexity Tracking
*No violations - maintaining simplicity with 2 projects and direct framework usage*

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*