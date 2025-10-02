# Peek - Location-Based Community Hub

## Project Overview
Peek is a location-based community platform where physical QR codes create hyperlocal groups. Users must prove physical presence to join communities.

## Tech Stack
- **Frontend**: MKStack (Vite, React, TypeScript, Tailwind CSS)
- **Backend**: Rust (Axum web framework)
- **Relay**: wss://peek.hol.is (verse-pbc/groups_relay) - stores all data
- **Protocol**: Nostr (NIP-29 groups)
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
    │   ├── lib/         # location-check, geohash validation
    │   └── nostr/       # Relay client for group management
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
- `POST /api/validate-location` - Verify physical presence, add user to NIP-29 group
- `GET /api/community/{id}/preview` - Public community info

## Join Flow
1. User proves location to validation service
2. Service directly adds user to group via kind:9000 event on wss://peek.hol.is (using admin key)
3. Service returns success confirmation to user
4. User is now a member and can access the community

## Key Design Decisions
- **No Redis**: All state stored in relay as NIP-29 events
- **Direct group addition**: Validation service has admin keypair for relay
- **Single source of truth**: Relay handles all data persistence and expiry

## Core Constraints
- Location validation: 25m radius, 20m GPS accuracy (hardcoded)
- Location validation timeout: 30 seconds
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
cd packages/validation-service && cargo run  # Always use 'cargo run' to auto-rebuild on changes
```

## Nostr Tooling (Nak)

### Nak Command Patterns
When using nak (Nostr Army Knife) with authenticated relays:

```bash
# Query events (authenticated)
nak req -k <kind> --tag <tag>=<value> -l <limit> --fpa --sec $COMMUNITIES2 <relay>

# Send events (authenticated)
nak event -k <kind> -t <tag>='<value>' --sec $COMMUNITIES2 -c "" <relay>

# Examples
nak req -k 39000 --tag d=peek-xyz -l 1 --fpa --sec $COMMUNITIES2 communities2.nos.social
nak event -k 9002 -t h=peek-xyz -t name='My Group' --sec $COMMUNITIES2 -c "" communities2.nos.social
```

**Critical flags:**
- `--fpa` = Force pubkey authentication (REQUIRED for private relays)
- `--sec $VAR` = Use private key from environment variable (NEVER echo the variable)
- Always use both `--fpa` and `--sec` together for authenticated requests

**Common mistakes:**
- Forgetting `--fpa` flag → auth fails
- Using `--sec` without `--fpa` → request not authenticated
- Echoing `$COMMUNITIES2` → exposes private key

## Spec-Kit Commands (Claude)
- `/specify` - Create a new feature specification and branch
- `/plan` - Generate implementation plan from specification
- `/tasks` - Break down plan into executable tasks
- `/task-update` - Mark tasks as complete (e.g., `/task-update T001` or `/task-update T001-T005`)
- `/refresh` - Restore context by re-reading spec, plan, and tasks (use when Claude loses context)

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
*AI Assistant Context - Last Updated: 2025-09-16*