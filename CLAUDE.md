# Peek - Location-Based Community Hub

## Project Overview
Peek is a location-based community platform where physical QR codes create hyperlocal groups. Users must prove physical presence to join communities.

## Tech Stack
- **Frontend**: MKStack (Vite, React, TypeScript, Tailwind CSS)
- **Backend**: Rust (Axum web framework)
- **Relay**: verse-pbc/groups_relay (NIP-29 implementation) - stores all data
- **Protocol**: Nostr (NIP-29 groups with kind:9009 invitations)
- **Libraries**: nostr-tools, @zxing/library (JS), geo crate, nostr-sdk (Rust)

## Project Structure
```
packages/
├── pwa-client/          # Progressive Web App
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route-based pages
│   │   ├── services/    # API clients, relay connection
│   │   └── lib/         # QR scanner, utilities
│   └── tests/
└── validation-service/  # Rust location validation backend
    ├── src/
    │   ├── handlers/    # Axum route handlers
    │   ├── services/    # Business logic
    │   ├── models/      # Data structures
    │   ├── lib/         # location-check, invite-creator
    │   └── nostr/       # Relay client for creating invites
    ├── tests/
    └── Cargo.toml
```

## Key Features
1. **QR Code Scanning**: First scanner creates community, becomes admin
2. **Location Validation**: GPS verification within 25m radius, 20m accuracy
3. **Nostr Identity**: Users join with Nostr pubkey (npub)
4. **Admin Tools**: Promote/demote, mute/ban members
5. **Persistent Access**: Members keep access after leaving location

## API Endpoints
- `POST /api/validate-location` - Verify physical presence, get NIP-29 invite code
- `GET /api/community/{id}/preview` - Public community info

## Join Flow
1. User proves location to validation service
2. Service creates kind:9009 invite event on relay (using admin key)
3. Service returns invite code to user
4. Client sends kind:9021 with invite code to groups_relay
5. Relay validates against stored kind:9009 and adds user to group

## Key Design Decisions
- **No Redis**: All state stored in relay as NIP-29 events
- **Direct invite creation**: Validation service has admin keypair for relay
- **Single source of truth**: Relay handles all data persistence and expiry

## Core Constraints
- Location validation: 25m radius, 20m GPS accuracy (hardcoded)
- Invite code expiry: 5 minutes
- No global search/directory (physical discovery only)
- Live connection required for joining

## Development Commands
```bash
# Start services
npm run dev              # Start both client and service
npm run test            # Run test suite
npm run generate-qr     # Create test QR code

# Individual packages
cd packages/pwa-client && npm run dev
cd packages/validation-service && cargo run
```

## Testing Approach
- TDD: Write tests first, then implementation
- Contract tests before integration tests
- Use real Redis, relay instances (no mocks)

## MVP Deferrals
- Photo verification (GPS only for now)
- Rate limiting
- Push notifications
- Native apps
- Multi-relay support

## Recent Changes
- Initial project setup with MKStack
- NIP-29 relay integration
- Location validation service

---
*AI Assistant Context - Last Updated: 2025-09-10*