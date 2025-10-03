# Peek - Location-Based Communities

**Hyperlocal communities through physical QR codes and GPS verification.**

Scan a QR code at a location → Prove you're there with GPS → Join the community.

---

## What is Peek

Peek creates communities for people who've shared the same physical space. Scan a QR code at a café, park, or event, prove you're actually there with GPS, and join a hyperlocal group. The first person to scan becomes the admin. Members keep access forever, but new members must physically visit the location to join.

Built on Nostr (NIP-29), Peek bridges physical spaces with decentralized digital communities.

---

## How It Works

### Three Simple Steps

1. **Scan QR code** at a physical location (café, park, building, event)
2. **Prove presence** via GPS verification (within 25m, accuracy ≤20m)
3. **Join community** - chat and connect with others who've been there

### Two-Phase QR Lifecycle

**Phase 1: First Scan (Community Creation)**
- Fresh QR code → First scanner creates the community
- Scanner's GPS location becomes the permanent community location
- First scanner automatically becomes founding admin

**Phase 2: Subsequent Scans (Join Flow)**
- Existing community → Show preview (name, member count)
- GPS validation required: within 25m of established location
- Automatic membership on successful validation

---

## Key Features

### 🌍 GPS-Based Location Verification

- **Validation:** Must be within 25 meters of community location
- **Accuracy:** GPS accuracy must be ≤20 meters
- **No Photos:** GPS-only verification (simpler, privacy-focused)
- **One-Time:** Prove presence once, keep access forever

### 🔑 Seamless Identity Migration (Unique Feature)

Peek uses a frictionless identity progression:

**Start Anonymous:**
- Automatic ephemeral identity on first use
- No signup required - join communities immediately
- Zero friction for new users

**Upgrade to Permanent:**
- Link to your existing Nostr account
- Or create a new Nostr identity
- Migration preserves all memberships and admin status
- Uses kind:1776 events for verifiable identity continuity

**Technical Details:** See [NIP-XX Identity Migration Draft](packages/pwa-client/docs/nip-identity-migration-draft.md)

This allows users to try Peek instantly (anonymous) then commit to a permanent identity when ready, without losing access to communities they've joined.

### 🔗 Native Nostr Integration (NIP-29)

- Communities are NIP-29 groups on `wss://communities2.nos.social`
- All membership stored on relay (no central database)
- Direct group addition via kind:9000 events
- No invite codes or tokens - pure Nostr protocol
- Censorship-resistant, decentralized

### 🛡️ Admin Tools

Admins can:
- **Edit community:** Name, description, picture
- **Manage members:** Remove members from group
- **Manage roles:** Promote/demote admin status
- **View members:** See who's joined the community

### 🔒 Privacy & Security

- **No GPS tracking:** Coordinates validated once, never stored
- **Geohash for discovery:** Public map shows ~1km precision only
- **No central database:** All data in NIP-29 relay events
- **Decentralized identity:** Nostr-based, user-controlled
- **Physical-first discovery:** No global search, must scan QR

---

## Tech Stack

- **Frontend:** React PWA (Vite, TypeScript, Tailwind CSS)
- **Backend:** Rust validation service (Axum web framework)
- **Protocol:** Nostr (NIP-29 groups, kind:1776 identity migration)
- **Relay:** wss://communities2.nos.social (groups_relay)
- **Libraries:** nostr-tools, nostr-sdk, geo crate, leaflet

---

## Prerequisites

- Node.js 20+
- pnpm 8.15+
- Rust 1.75+
- Docker and Docker Compose (optional)

---

## Setup

### 1. Clone Repository

```bash
git clone https://github.com/verse-pbc/peek.git
cd peek
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

```bash
cp .env.example .env
cp packages/validation-service/.env.example packages/validation-service/.env
cp packages/pwa-client/.env.example packages/pwa-client/.env
```

**IMPORTANT:** Edit the `.env` files and add your Nostr keys:
- Generate keys: `nak key generate`
- Add relay admin key to `RELAY_SECRET_KEY`
- Add service keys for `SERVICE_NSEC`/`SERVICE_NPUB`
- **Never commit `.env` files** - they are gitignored for security

> **Note:** Uses `wss://communities2.nos.social` by default. No local relay required!

---

## Development

### Run All Services

```bash
pnpm dev
```

### Individual Services

```bash
pnpm dev:pwa          # PWA client on http://localhost:3000
pnpm dev:validation   # Validation service on http://localhost:3001
```

### Docker (Optional)

```bash
docker-compose up --build
```

---

## Scripts

- `pnpm dev` - Run all services in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Run linting
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm docker:up` - Start validation service in Docker
- `pnpm docker:down` - Stop Docker services
- `pnpm docker:logs` - View validation service logs
- `pnpm clean` - Clean all build artifacts

---

## Project Structure

```
peek/
├── packages/
│   ├── pwa-client/              # React PWA
│   │   ├── src/
│   │   │   ├── components/      # UI components
│   │   │   ├── pages/           # Routes (/, /c/{uuid})
│   │   │   ├── services/        # Relay, group, identity services
│   │   │   └── lib/             # QR scanner, location capture
│   │   └── tests/
│   └── validation-service/      # Rust backend
│       ├── src/
│       │   ├── handlers/        # HTTP + Nostr gift wrap handlers
│       │   ├── services/        # Relay client, identity migration
│       │   └── lib/             # Geohash, location validation
│       └── tests/
└── specs/                       # Feature specifications (for reference)
```

---

## Core Architecture

### Location Validation Flow

```
1. User scans QR → opens /c/{uuid}
2. If not member → JoinFlow component
3. GPS capture → Send to validation service (NIP-59 gift wrap)
4. Validation service checks: distance ≤25m, accuracy ≤20m
5. If valid → Service adds user to NIP-29 group (kind:9000)
6. User gets membership, sees community feed
```

### Identity Migration System

```
1. User joins with anonymous ephemeral key (auto-generated)
2. User later links to permanent Nostr identity
3. Migration event (kind:1776) published with dual signatures
4. All memberships transfer to new identity
5. Old identity resolves to new identity via migration chain
```

See [NIP-XX Identity Migration](packages/pwa-client/docs/nip-identity-migration-draft.md) for protocol details.

### No Central Database

All state lives in NIP-29 relay events:
- **kind:39000** - Community metadata (name, about, picture)
- **kind:39001** - Admin list
- **kind:39002** - Member list
- **kind:9** - Chat messages
- **kind:1776** - Identity migrations

No Redis, no PostgreSQL - pure Nostr protocol.

---

## Unique Value Propositions

### 1. Zero-Friction Onboarding
Start completely anonymous, no signup. Upgrade to permanent identity when ready without losing anything.

### 2. Physical Trust Layer
Everyone in the community has physically visited the same place. Higher trust than purely digital groups.

### 3. Verifiable Decentralization
Built on Nostr - no platform lock-in, censorship-resistant, user-owned identities.

### 4. Privacy-First
- GPS validated once, never tracked
- Public discovery map shows ~1km precision (geohash)
- No photo storage or history

---

## License

MIT
