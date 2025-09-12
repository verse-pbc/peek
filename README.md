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
```

Edit the `.env` files and add your Nostr admin keypair for the relay.

4. Start the local relay:
```bash
pnpm relay:start
```

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

## Scripts

- `pnpm dev` - Run all services in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run all tests
- `pnpm lint` - Run linting
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm relay:start` - Start local groups_relay
- `pnpm relay:stop` - Stop local groups_relay
- `pnpm relay:logs` - View relay logs
- `pnpm clean` - Clean all build artifacts

## Architecture

- `/packages/pwa-client` - React PWA built with MKStack
- `/packages/validation-service` - Rust service for location validation
- `/packages/shared` - Shared TypeScript types

## License

MIT