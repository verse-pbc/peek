# Keycast Integration Guide for Peek

Guide for integrating Keycast's personal authentication and NIP-46 remote signing into Peek.

**⚠️ IMPORTANT: OAUTH MIGRATION (2025-11-13)**

Peek has migrated from ROPC (Resource Owner Password Credentials) to standard OAuth 2.0 popup flow with PKCE. The ROPC endpoints documented below are **deprecated** and no longer used by Peek.

**New Flow:**
- User clicks "Connect with Keycast" button
- Popup window opens to Keycast OAuth authorization page
- User registers/logs in directly on Keycast domain
- Peek receives authorization code via popup callback
- Code exchanged for bunker URL using PKCE verification

**Benefits:**
- ✅ More secure: Credentials never pass through Peek
- ✅ Better UX: User sees Keycast URL in popup for trust verification
- ✅ Works on iOS PWAs: Pre-open pattern bypasses popup blocking
- ✅ Standards-compliant: OAuth 2.1 removes ROPC entirely

See implementation in:
- `packages/pwa-client/src/services/keycast.ts` - OAuth service
- `packages/pwa-client/src/lib/pkce.ts` - PKCE utilities
- `packages/pwa-client/public/oauth-callback.html` - Callback page

---

## Overview

Keycast provides secure remote signing for Nostr apps using NIP-46 (Nostr Connect). Instead of storing private keys in the browser, users can create a Keycast account that stores their encrypted keys server-side and provides a bunker URL for remote signing.

**Benefits for Peek users:**
- Keep using their existing Nostr identity (import their current nsec)
- Access their identity across devices (phone, desktop, web)
- No more localStorage key loss
- Backup their keys securely
- Use same identity in other Nostr apps via bunker URL

## Architecture

```
┌──────────────┐                          ┌──────────────────┐
│   Peek App   │  OAuth Popup Flow        │  Keycast Server  │
│              │◄────────────────────────►│ keycast.dcadenas │
│  - Open      │  PKCE + Auth Code        │       .dev       │
│    Popup     │  ────────────────────►   │                  │
│  - BYOK via  │  ◄────────────────────   │  - Stores keys   │
│    postMsg   │  (bunker URL)            │  - OAuth server  │
└──────┬───────┘                          └────────┬─────────┘
       │                                           │
       │  Exchange code for bunker URL             │
       │  (PKCE verifier) ──────────────────────►  │
       │  ◄──── bunker://pubkey?relay&secret       │
       │                                           │
       │                                           │
       │         NIP-46 Signing Requests           │
       ├──────────────via relay─────────────────► │
       │         (kind 24133 encrypted)            │
       │                                           │
       │  ◄──────── Signed Events ──────────────── │
       │         (via same relay)                  │
       │                                           │
```

## API Endpoints

Base URL: `https://keycast.dcadenas.dev`

### 1. Registration (ROPC)

**Endpoint:** `POST /api/auth/register`

**CORS:** Restricted to `peek.verse.app` and `localhost:*`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "nsec": "optional-hex-or-bech32-private-key"
}
```

**Response (Success):**
```json
{
  "user_id": "user-pubkey-hex",
  "email": "user@example.com",
  "pubkey": "user-pubkey-hex",
  "token": "eyJ0eXAiOiJKV1Q..."
}
```

**Response (Error):**
```json
{
  "error": "This Nostr key is already registered. Please log in instead or use a different key."
}
```

**Important Notes:**
- `nsec` field accepts **BOTH** formats:
  - 64-character hex: `"0a1b2c3d4e5f..."`
  - NIP-19 bech32: `"nsec1abc123..."`
- If `nsec` is omitted, Keycast auto-generates a new keypair
- If `nsec` is provided, Keycast uses that existing key (BYOK - Bring Your Own Key)
- Keys are encrypted with AES-256-GCM and stored in PostgreSQL
- JWT token expires in 24 hours

### 2. Login (ROPC)

**Endpoint:** `POST /api/auth/login`

**CORS:** Restricted to `peek.verse.app` and `localhost:*`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (Success):**
```json
{
  "token": "eyJ0eXAiOiJKV1Q...",
  "pubkey": "user-pubkey-hex"
}
```

**Response (Error):**
```json
{
  "error": "Invalid email or password"
}
```

### 3. Get Bunker URL

**Endpoint:** `GET /api/user/bunker`

**CORS:** Permissive (JWT-protected, no phishing risk)

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "bunker_url": "bunker://pubkey?relay=wss://relay.damus.io&secret=connection-secret"
}
```

**Bunker URL Format:**
- `bunker://` protocol identifier
- User's public key (hex)
- `relay`: WebSocket relay for NIP-46 communication
- `secret`: Connection authentication secret

## Peek Implementation

### Step 1: User Initiates "Secure Account" Flow

When user clicks "Create Account" or "Secure My Identity":

```typescript
import { bytesToHex } from '@noble/hashes/utils';

async function createKeycastAccount(email: string, password: string) {
  // Get user's existing local identity from localStorage
  const localIdentity = getLocalIdentity();

  // Convert secret key to hex (simpler than nsec encoding)
  const secretHex = bytesToHex(localIdentity.secretKey);

  try {
    // Step 1: Register with existing nsec
    const registerRes = await fetch('https://keycast.dcadenas.dev/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        nsec: secretHex  // Import peek's existing key
      })
    });

    if (!registerRes.ok) {
      const error = await registerRes.json();

      // If key already registered, try login instead
      if (error.error?.includes('already registered')) {
        return await loginToKeycast(email, password);
      }

      throw new Error(error.error || 'Registration failed');
    }

    const { token, pubkey } = await registerRes.json();

    // Verify the pubkey matches peek's local identity
    const localPubkey = getPublicKey(localIdentity.secretKey);
    if (pubkey !== localPubkey) {
      throw new Error('Pubkey mismatch - registration failed');
    }

    // Step 2: Get bunker URL
    const bunkerRes = await fetch('https://keycast.dcadenas.dev/api/user/bunker', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const { bunker_url } = await bunkerRes.json();

    // Step 3: Store credentials for future use
    localStorage.setItem('keycast_email', email);
    localStorage.setItem('keycast_jwt', token);
    localStorage.setItem('keycast_bunker_url', bunker_url);

    return { token, pubkey, bunker_url };

  } catch (error) {
    console.error('Keycast registration failed:', error);
    throw error;
  }
}
```

### Step 2: Login (Returning Users)

```typescript
async function loginToKeycast(email: string, password: string) {
  try {
    // Step 1: Login to get JWT
    const loginRes = await fetch('https://keycast.dcadenas.dev/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
      const error = await loginRes.json();
      throw new Error(error.error || 'Login failed');
    }

    const { token, pubkey } = await loginRes.json();

    // Step 2: Get bunker URL
    const bunkerRes = await fetch('https://keycast.dcadenas.dev/api/user/bunker', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const { bunker_url } = await bunkerRes.json();

    // Step 3: Store credentials
    localStorage.setItem('keycast_email', email);
    localStorage.setItem('keycast_jwt', token);
    localStorage.setItem('keycast_bunker_url', bunker_url);

    return { token, pubkey, bunker_url };

  } catch (error) {
    console.error('Keycast login failed:', error);
    throw error;
  }
}
```

### Step 3: Use Bunker URL for Signing

Once you have the bunker URL, use it exactly like you currently use nsec.app:

```typescript
import { loginWithBunker } from './lib/nostr-identity';

// After registration or login
const { bunker_url } = await createKeycastAccount(email, password);

// Use existing peek code to connect via bunker URL
const bunkerIdentity = await loginWithBunker(bunker_url);

// Save as current identity (replaces local identity)
localStorage.setItem('peek_nostr_identity', JSON.stringify(bunkerIdentity));

// Reload to activate bunker identity
window.location.reload();
```

## UI/UX Flow Recommendation

### Current Peek Flow:
1. User opens peek → Auto-generates local identity
2. User uses peek with local keys
3. (Eventually) User clicks profile → "Secure Account"

### Enhanced Flow with Keycast:

**Option A: Upgrade Existing Identity**
```
User has local identity in peek
  ↓
Clicks "Secure My Account"
  ↓
Shows form: Email + Password
  ↓
Calls createKeycastAccount() with peek's nsec
  ↓
Switches to bunker identity (same pubkey!)
  ↓
User keeps all history, now secured remotely
```

**Option B: Login to Existing Account**
```
User has keycast account on different device
  ↓
On new device, clicks "Login with Keycast"
  ↓
Shows form: Email + Password
  ↓
Calls loginToKeycast()
  ↓
Gets bunker URL for their existing identity
  ↓
User's identity restored across devices
```

## Example UI Component

```typescript
function KeycastAccountModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'register') {
        await createKeycastAccount(email, password);
        alert('Account created! Your identity is now secured with Keycast.');
      } else {
        await loginToKeycast(email, password);
        alert('Login successful! Your identity has been restored.');
      }

      onClose();
      window.location.reload();

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal">
      <h2>Secure Your Nostr Identity</h2>

      <div className="tabs">
        <button onClick={() => setMode('register')}
                className={mode === 'register' ? 'active' : ''}>
          Secure Account
        </button>
        <button onClick={() => setMode('login')}
                className={mode === 'login' ? 'active' : ''}>
          Login
        </button>
      </div>

      {mode === 'register' && (
        <p className="info">
          This will backup your current Nostr identity to Keycast.
          You'll be able to access it from any device.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : mode === 'register' ? 'Create Account' : 'Login'}
        </button>
      </form>

      {mode === 'register' && (
        <div className="warning">
          ⚠️ Remember your email and password. There's no recovery if you lose them.
        </div>
      )}
    </div>
  );
}
```

## Security Considerations

### CORS Protection

Keycast restricts `/api/auth/register` and `/api/auth/login` to:
- `https://peek.verse.app`
- `http://localhost:*` (any port for development)

This prevents phishing sites from stealing credentials.

### Password Security

- Passwords are hashed with bcrypt before storage
- Never sent to any third party
- Only exchanged with keycast over HTTPS

### Key Security

- Private keys encrypted with AES-256-GCM at rest
- Keys only decrypted when signing events (in signer daemon)
- Connection secrets are unique per user and random (48 chars)
- Bunker URLs use NIP-44 encryption for all NIP-46 messages

## Migration Path for Existing Peek Users

### Phase 1: Optional Feature (Low Friction)
```
- Add "Secure Account" button in profile
- Show benefits: cross-device, backup, etc.
- Keep local identity as default
- Users opt-in when ready
```

### Phase 2: Encourage Migration
```
- Show banner after X days: "Secure your identity"
- Offer one-click import of local nsec
- Explain they keep same pubkey/history
- Still allow "Skip" to use local storage
```

### Phase 3: Default (Future)
```
- New users start with Keycast by default
- Generate keypair server-side
- Provide bunker URL immediately
- Local keys become "advanced" option
```

## Testing Locally

### 1. Start Local Keycast (for development)

```bash
cd ../keycast

# Start PostgreSQL
docker run --name keycast-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=keycast \
  -p 5432:5432 -d postgres:16

# Start API + Signer
DATABASE_URL=postgres://postgres:password@localhost/keycast \
RUST_LOG=info \
MASTER_KEY_PATH=./master.key \
ALLOWED_ORIGINS=http://localhost:5173 \
cargo run --bin keycast_api &

DATABASE_URL=postgres://postgres:password@localhost/keycast \
RUST_LOG=info,keycast_signer=debug \
MASTER_KEY_PATH=./master.key \
cargo run --bin keycast_signer &
```

### 2. Update Peek Config

In peek's `.env.local`:
```bash
VITE_KEYCAST_URL=http://localhost:3000
```

### 3. Test Registration

```typescript
// In browser console
const localId = JSON.parse(localStorage.getItem('peek_nostr_identity'));
const secretHex = Array.from(localId.secretKey)
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');

const res = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'test123',
    nsec: secretHex
  })
});

const data = await res.json();
console.log('Registered:', data);

// Get bunker URL
const bunkerRes = await fetch('http://localhost:3000/api/user/bunker', {
  headers: { 'Authorization': `Bearer ${data.token}` }
});

const { bunker_url } = await bunkerRes.json();
console.log('Bunker URL:', bunker_url);

// Now test with peek's existing loginWithBunker()
```

## Production Deployment

### Environment Variables

Set in peek's production environment:
```bash
VITE_KEYCAST_URL=https://keycast.dcadenas.dev
```

### Domain Whitelisting

Contact keycast admin (rabble) to add peek domains to `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://peek.verse.app,https://peek-staging.verse.app,http://localhost
```

## Error Handling

### Common Errors and Solutions

**"Failed to provision tenant"**
- Cause: Database migration issue
- Solution: Wait for server restart or contact admin

**"This Nostr key is already registered"**
- Cause: User trying to register with already-imported nsec
- Solution: Prompt user to login instead

**"Invalid email or password"**
- Cause: Wrong credentials
- Solution: Show "Forgot password?" link (coming soon)

**"Service temporarily unavailable"**
- Cause: Server rate limiting or internal error
- Solution: Retry after a few seconds

**CORS error in console**
- Cause: Domain not whitelisted
- Solution: Check ALLOWED_ORIGINS on server

## Advanced: Direct Bunker URL Usage

If user already has a Keycast account from another app, they can paste their bunker URL directly:

```typescript
// Existing peek code works as-is!
const bunkerUrl = userInput;  // "bunker://pubkey?relay=...&secret=..."

const bunkerIdentity = await loginWithBunker(bunkerUrl);
localStorage.setItem('peek_nostr_identity', JSON.stringify(bunkerIdentity));
window.location.reload();
```

## Migration Checklist

- [x] Add Keycast account creation UI to peek
- [x] Implement registration with nsec import
- [x] Implement login flow
- [x] Store JWT token securely
- [x] Handle errors gracefully
- [ ] Test cross-device identity sync
- [x] Add "Login with Keycast" to identity modal
- [ ] Update documentation for users
- [ ] Request domain whitelisting from keycast admin

## Implementation Status

**Completed (2025-11-06):**

### Files Created
- `packages/pwa-client/src/services/keycast.ts` - Keycast API service
- `packages/pwa-client/src/components/KeycastAccountModal.tsx` - Keycast UI component
- `packages/pwa-client/.env.local` - Local development configuration

### Files Modified
- `packages/pwa-client/.env.example` - Added VITE_KEYCAST_URL
- `packages/pwa-client/public/locales/en/translation.json` - English translations
- `packages/pwa-client/public/locales/es/translation.json` - Spanish translations
- `packages/pwa-client/src/components/IdentityModal.tsx` - Added Keycast tab
- `packages/pwa-client/src/components/UserIdentityButton.tsx` - Added "Secure with Keycast" menu item

### Features Implemented
1. **Two User Flows:**
   - New users: Keycast tab in IdentityModal (alongside Extension and Bunker)
   - Existing users: "Secure with Keycast" in user menu (local identities only)

2. **API Integration:**
   - Register with email/password (imports existing local nsec)
   - Login to existing Keycast account
   - Automatic bunker URL retrieval
   - Auto-retry on "key already registered" error

3. **UI/UX:**
   - Bilingual (English/Spanish) with i18n
   - Password visibility toggle
   - Responsive design (mobile and desktop)
   - Clear error messages
   - Success toasts with auto-reload

4. **Security:**
   - Local nsec import (hex format)
   - JWT token storage in localStorage
   - HTTPS-only communication
   - Bunker URL integration with existing NIP-46 support

### Testing Next Steps

1. **Start Local Keycast:**
   ```bash
   cd ../keycast
   # Follow setup instructions from KEYCAST_INTEGRATION.md line 446-469
   ```

2. **Start Peek:**
   ```bash
   cd packages/pwa-client
   npm run dev
   ```

3. **Test Flows:**
   - Create local identity → "Secure with Keycast" → Register
   - New browser → "Switch Account" → Keycast tab → Login
   - Verify bunker URL works
   - Test cross-device sync

### Known Limitations
- JWT refresh not implemented (24-hour expiration)
- No "Forgot Password" flow (planned by Keycast team)
- Domain whitelisting required for production (pending)

### Resolved Issues

**2025-11-07: Bunker Signing Timeouts (RESOLVED)**
- **Problem**: Peek timeouts when trying to sign events via bunker
- **Root Cause**: Keycast publishes NIP-46 responses to 3 relays for redundancy, but bunker URL only listed 1 relay (wss://relay.damus.io). When that relay rate-limited, Peek never received responses.
- **Fix**: Keycast now includes all 3 relays in bunker URL:
  ```
  bunker://<pubkey>@relay.damus.io?relay=wss://relay.damus.io&relay=wss://nos.lol&relay=wss://relay.nsec.app
  ```
- **Result**: Peek's BunkerSigner listens on all 3 relays. Even if one rate-limits, responses come through on others.
- **Status**: ✅ Fixed in Keycast deployment
- **Lesson**: Multi-relay redundancy is essential for NIP-46 reliability

**2025-11-07: Login Returns 404 on /api/user/bunker (RESOLVED)**
- **Problem**: Existing users could login successfully but got 404 when fetching bunker URL
- **Root Cause**: User registered via OAuth test flow (test-webapp), not ROPC flow. OAuth authorization existed for test-webapp but not for keycast-login (now keycast-ropc).
- **Fix**: `/api/auth/login` now auto-creates `keycast-ropc` OAuth authorization if missing
- **Details**:
  - ROPC (Resource Owner Password Credentials) flow for first-party apps
  - All first-party apps share `client_id='keycast-ropc'`
  - Login endpoint creates authorization on-demand using user's encrypted key from personal_keys table
  - Signer daemon automatically reloads on new authorizations
- **Status**: ✅ Fixed in Keycast deployment
- **Lesson**: Login endpoints should be idempotent - ensure all required setup exists

## Support

For issues or questions:
- Keycast issues: https://github.com/rabble/keycast/issues
- Peek issues: https://github.com/verbiricha/peek/issues
- Contact: rabble (maintainer)

## Technical Notes

### Relay Configuration for NIP-46 Communication

**How Relays Work in Keycast (per NIP-46 spec):**

The bunker URL defines the communication contract between client and signer:
```
bunker://<remote-signer-pubkey>?relay=<wss://relay1>&relay=<wss://relay2>&secret=<secret>
```

**Keycast Architecture:**
- Relays are configured at **deployment level**, not per-user
- Signer operator chooses trusted relays (security + scalability)
- All bunker URLs reference the same relay set
- Clients connect to those specific relays for NIP-46 communication

**Default Relays (Hardcoded in Keycast):**
- `wss://relay.damus.io`
- `wss://relay.nsec.app`
- `wss://nos.lol`

**Why This Design?**
1. **Security**: Operator vets relay infrastructure
2. **Scalability**: 3 relay connections serve millions of users
3. **Reliability**: Multi-relay redundancy handles rate-limiting
4. **Simplicity**: No per-user relay management

**For Custom Deployment:**

To use different relays (e.g., `wss://communities2.nos.social`):

1. **Modify Keycast Signer** (`/signer/src/signer_daemon.rs:136-145`):
   ```rust
   // Replace hardcoded relays with environment variable
   let relays = env::var("BUNKER_RELAYS")
       .unwrap_or_else(|_| "wss://relay.damus.io,wss://relay.nsec.app,wss://nos.lol".to_string());

   for relay_url in relays.split(',') {
       self.client.add_relay(relay_url.trim()).await?;
   }
   ```

2. **Deploy with Environment Variable**:
   ```bash
   BUNKER_RELAYS="wss://communities2.nos.social,wss://relay.damus.io"
   ```

3. **Update Bunker URL Generation** (ensure it references the same relays)

**Important**: This is **deployment-time configuration**, not a per-user setting. All users of a Keycast deployment share the same relay infrastructure.

---

### Why ROPC Instead of OAuth? (DEPRECATED)

**UPDATE 2025-11-13**: Peek has migrated from ROPC to standard OAuth popup flow. See migration notice at top of document.

~~Peek and Keycast are owned by the same organization (trusted first-party apps).~~

~~**ROPC (Resource Owner Password Credentials):**~~
~~- ✅ Simpler: 2 API calls vs OAuth redirect dance~~
~~- ✅ Better UX: User stays in peek's UI~~
~~- ✅ Secure: HTTPS only, domain restricted via CORS~~
~~- ✅ What we built: `/api/auth/login` + `/api/user/bunker`~~

~~**OAuth would be used for third-party apps** where peek shouldn't handle passwords directly.~~

### NIP-46 Protocol

After getting the bunker URL, peek uses standard NIP-46 (Nostr Connect):
1. Client sends encrypted request via relay (kind 24133)
2. Keycast signer daemon receives and decrypts
3. Signer checks permissions and signs event
4. Returns signed event via relay
5. Client receives and publishes to Nostr network

All signing happens server-side. Private key never leaves Keycast's encrypted database.

### Multi-Tenancy

Keycast supports multiple deployments via domain-based tenancy:
- `keycast.dcadenas.dev` = Divine Video tenant
- `localhost` = Auto-provisioned dev tenant
- Each tenant has isolated users/keys/policies

Same email can exist in different tenants with different keys.
