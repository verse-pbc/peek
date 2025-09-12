# Research Findings: Community Hub Implementation

**Date**: 2025-09-10  
**Feature**: Community Hub for Location-Based Groups

## Technology Decisions

### 1. MKStack for PWA Development
**Decision**: Use MKStack with Vite, React, and Tailwind CSS  
**Rationale**: 
- Pre-configured PWA setup with service workers
- Optimized build pipeline for mobile performance
- React ecosystem compatibility with nostr-tools
- Tailwind for rapid UI development

**Alternatives considered**:
- Next.js: Overkill for client-side PWA, server components not needed
- Vue/Nuxt: Less ecosystem support for Nostr libraries
- Native apps: Higher barrier to entry, slower iteration

### 2. NIP-29 Relay Integration
**Decision**: Use verse-pbc/groups_relay (our existing implementation)  
**Rationale**:
- Already deployed and maintained by our team
- Full NIP-29 support with invitation system
- Customizable for our specific needs
- Direct control over relay behavior

**Alternatives considered**:
- strfry: Would require additional setup when we have our own
- Custom relay from scratch: Unnecessary when groups_relay exists
- Traditional backend: Defeats decentralization purpose

### 3. Location Validation Approach
**Decision**: Rust validation service with geo crate  
**Rationale**:
- Rust preferred for server-side tooling
- Prevents client-side tampering
- geo crate provides accurate haversine calculations
- Simple 25m radius check
- High performance for concurrent validations

**Alternatives considered**:
- Node.js service: Less performant, not our server preference
- Client-only: Too easy to spoof
- Third-party APIs: Unnecessary dependency, privacy concerns

### 4. Token & Invitation Strategy
**Decision**: Two-phase system - JWT validation token + NIP-29 invite code  
**Rationale**:
- JWT proves location validation passed (5-min expiry)
- Exchange JWT for actual NIP-29 invite code
- Validation service controls invite code generation
- Relay accepts standard NIP-29 join requests with codes
- Clean separation of concerns

**Flow**:
1. Location validation → JWT token
2. JWT exchange → NIP-29 invite code
3. Client sends kind:9021 with invite code to relay
4. Relay accepts and adds member to group

**Alternatives considered**:
- Direct relay integration: Would couple relay to validation logic
- Custom auth events: Breaks NIP-29 compatibility
- Session cookies: Doesn't work well with PWA

### 5. Photo Verification (Deferred)
**Decision**: Defer to post-MVP  
**Rationale**:
- GPS validation sufficient for initial launch
- Photo analysis adds significant complexity
- Can be added without breaking changes
- Allows faster MVP iteration

**Future approach**:
- Perceptual hashing for QR detection
- Challenge-response for liveness
- ML-based scene verification

## Implementation Patterns

### PWA Architecture
```
pwa-client/
├── src/
│   ├── hooks/        # React hooks for nostr, location
│   ├── lib/          # QR scanner, crypto utilities
│   ├── components/   # Reusable UI components
│   ├── pages/        # Route-based pages
│   └── services/     # API clients, relay connection
```

### Validation Service Architecture (Rust)
```
validation-service/
├── src/
│   ├── handlers/     # Axum/Actix route handlers
│   ├── services/     # Business logic
│   ├── models/       # Data structures
│   ├── geo/          # Location validation with geo crate
│   └── auth/         # JWT generation, invite codes
├── Cargo.toml        # Dependencies: axum, geo, jsonwebtoken, redis
```

### NIP-29 Group Structure
- Group ID: Derived from QR code UUID
- Metadata: Community name, description, location
- Permissions: Admin (first scanner), members
- Moderation: NIP-29 native ban/mute events

### QR Code Payload Format
```json
{
  "v": 1,
  "id": "uuid-v4",
  "relay": "wss://relay.peek.app",
  "lat": 59.9139,
  "lng": 10.7522,
  "name": "Oslo Coffee House"
}
```

## Performance Considerations

### GPS Accuracy Handling
- Request high accuracy mode
- Reject if horizontalAccuracy > 20m
- Timeout after 10 seconds
- Fallback to manual entry (future)

### Token Lifecycle
- Generate on successful location check
- 5-minute TTL in Redis
- Single-use flag on redemption
- Automatic cleanup via Redis expiry

### PWA Optimization
- Code splitting by route
- Lazy load QR scanner
- Cache relay connections
- IndexedDB for offline messages

## Security Considerations

### Location Spoofing Prevention
- Server-side validation only
- No client hints accepted
- Rate limiting per IP (future)
- Timestamp validation within 30s

### Token Security
- Signed with server secret
- Contains: community ID, user pubkey, expiry
- Validated before relay invite
- No replay possible (single-use)

### Privacy Protection
- No raw coordinates stored after validation
- Coarse location buckets only (100m grid)
- Photos immediately discarded (when implemented)
- No tracking between communities

## MVP Scope Decisions

### Included in MVP
- QR scanning and generation
- GPS-based location validation
- NIP-29 group creation/joining
- Basic timeline view
- Admin moderation tools
- PWA with offline support

### Deferred Post-MVP
- Photo verification
- Rate limiting
- Push notifications
- Native app versions
- Discovery features
- Payment integration
- Multi-relay support

## Testing Strategy

### Contract Testing
- Mock relay responses
- Synthetic GPS data
- Token validation edge cases
- API schema validation

### Integration Testing
- Real Redis instance
- Test relay deployment
- Browser geolocation API
- End-to-end user flows

### Performance Testing
- 1000 concurrent validations
- Relay connection pooling
- PWA lighthouse scores
- Bundle size monitoring

## Deployment Considerations

### Infrastructure (Future)
- Validation service: Docker on cloud VM
- Redis: Managed instance
- Relay: Dedicated strfry server
- PWA: CDN distribution
- Monitoring: Structured logs to observability platform

### Progressive Rollout
1. Local development with test relay
2. Staging with single test location
3. Pilot in one city (5-10 locations)
4. Gradual geographic expansion
5. Multi-relay federation (future)

---
*Research completed for Phase 0 requirements*