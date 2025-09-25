# Peek - Location-Based Community Hub

A PWA client and validation service for creating hyperlocal communities using QR codes and location verification.

## Prerequisites

- Node.js 20+
- pnpm 8.15+
- Rust 1.75+
- Docker and Docker Compose

## Setup

1. Clone the repository:
```bash
git clone https://github.com/verse-pbc/peek.git
cd peek
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment:
```bash
cp .env.example .env
cp packages/validation-service/.env.example packages/validation-service/.env
cp packages/pwa-client/.env.example packages/pwa-client/.env
```

4. **IMPORTANT**: Edit the `.env` files and add your real Nostr keys:
   - Generate keys with: `nak key generate` or use the provided node command
   - Add your relay admin key to `RELAY_SECRET_KEY`
   - Add service keys for `SERVICE_NSEC`/`SERVICE_NPUB`
   - **Never commit `.env` files** - they are gitignored for security

> **Note**: The service now uses `wss://communities2.nos.social` by default. No local relay setup required!

## Development

Run all services in parallel:
```bash
pnpm dev
```

Or run services individually:
```bash
pnpm dev:pwa          # PWA client on http://localhost:5173
pnpm dev:validation   # Validation service on http://localhost:3000
```

For Docker development:
```bash
docker-compose up --build    # Build and run validation service in Docker
```

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

## Architecture

- `/packages/pwa-client` - React PWA built with MKStack
- `/packages/validation-service` - Rust service for location validation
- `/packages/shared` - Shared TypeScript types

## License

MIT# Trigger rebuild
# Deploy test
# Force workflow detection
