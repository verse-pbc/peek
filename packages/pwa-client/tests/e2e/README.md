# E2E Tests

End-to-end tests for Peek using Playwright.

## Running Tests

### Local Development
```bash
# Interactive UI mode (recommended for debugging)
npm run test:e2e:ui

# Headless mode
npm run test:e2e

# Debug mode (step through)
npm run test:e2e:debug
```

### Against Production
```bash
# Run against deployed environment
BASE_URL=https://peek.verse.app npm run test:e2e
```

## Why Skipped in CI?

E2E tests are **intentionally skipped** in CI (`test.describe.skip`) because:

1. **Flaky** - Require real relay connections, network timing sensitive
2. **Slow** - Full journey takes ~3 minutes
3. **Environment-specific** - Better tested against staging/production
4. **Unit tests sufficient** - 118 unit/integration tests provide CI coverage

## When to Run E2E

- ✅ Before production deployments
- ✅ After major routing/flow changes
- ✅ Manual smoke testing on staging
- ❌ Not on every commit in CI

## Test Coverage

**complete-journey.spec.ts** tests:
- Anonymous user creates community (founder flow)
- Identity migration (anonymous → permanent nsec via kind:1776)
- Second user joins existing community
- Real-time message updates (WebSocket)
- Location validation failure (wrong geohash)
- Retry with correct location succeeds

## Debugging Failed Tests

1. Check screenshots: `test-results/*/test-failed-*.png`
2. View trace: `npx playwright show-trace test-results/*/trace.zip`
3. Run with UI: `npm run test:e2e:ui`
4. Check HTML report: `npx playwright show-report`
