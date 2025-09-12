# Data Model: Community Hub

**Date**: 2025-09-10  
**Feature**: Community Hub for Location-Based Groups

## Core Entities

### Community (NIP-29 Group)
Represents a location-based group created from a QR code scan.

```typescript
interface Community {
  id: string;              // UUID v4 from QR code
  groupId: string;         // NIP-29 group identifier
  name: string;            // Community display name
  description: string;     // Community description
  rules: string;           // Community rules/guidelines
  createdAt: number;       // Unix timestamp
  creatorPubkey: string;   // Nostr pubkey of first scanner
  location: {
    lat: number;           // Latitude of QR placement
    lng: number;           // Longitude of QR placement
    radius: number;        // Geofence radius (hardcoded 25m)
    accuracy: number;      // Required GPS accuracy (hardcoded 20m)
  };
  memberCount: number;     // Current member count
  relay: string;           // Relay URL hosting this group
  status: 'active' | 'archived';
}
```

**Validation Rules**:
- `id` must be valid UUID v4
- `name` required, 1-100 characters
- `description` optional, max 500 characters
- `location.lat` between -90 and 90
- `location.lng` between -180 and 180
- `creatorPubkey` must be valid Nostr pubkey

**State Transitions**:
- `non-existent` → `active` (first QR scan)
- `active` → `archived` (admin action)

### NIP-29 Invite Creation (kind:9009)
Validation service creates invite events directly on the relay using admin privileges.

```typescript
// Event created by validation service on relay
interface InviteCreationEvent {
  kind: 9009;              // NIP-29 create-invite
  pubkey: string;          // Admin pubkey (validation service)
  content: string;         // Invite code
  tags: [
    ["h", string],         // Group ID
    ["expiration", string], // Unix timestamp (created + 300s)
    ["uses", "1"],         // Single use
    ["for", string]        // Target user pubkey (optional)
  ];
}
```

**Flow**:
1. User passes location validation
2. Validation service creates kind:9009 event on relay
3. Service returns invite code to user
4. User sends kind:9021 with code to relay
5. Relay validates against stored kind:9009 event

**Benefits**:
- No external storage needed (no Redis)
- Relay handles expiry and single-use logic
- Invites hidden from non-admin users
- Native NIP-29 implementation

### LocationProof
Evidence of physical presence at community location.

```typescript
interface LocationProof {
  coordinates: {
    latitude: number;      // User's reported latitude
    longitude: number;     // User's reported longitude
  };
  accuracy: number;        // Horizontal accuracy in meters
  timestamp: number;       // Unix timestamp of reading
  distance: number;        // Calculated distance from QR location
  passed: boolean;         // Whether validation passed
}
```

**Validation Rules**:
- `accuracy` must be ≤ 20 meters
- `distance` must be ≤ 25 meters
- `timestamp` must be within 30s of server time
- Coordinates must be valid GPS range

### QRPayload
Data encoded in physical QR codes.

```typescript
interface QRPayload {
  v: 1;                    // Payload version
  id: string;              // Community UUID
  relay: string;           // Relay URL
  lat: number;             // QR location latitude
  lng: number;             // QR location longitude
  name?: string;           // Optional community name hint
}
```

**Validation Rules**:
- `v` must be 1 (current version)
- `id` must be valid UUID v4
- `relay` must be valid WSS URL
- Coordinates must be valid GPS range

### Member (NIP-29 Participant)
User who has joined a community.

```typescript
interface Member {
  pubkey: string;          // Nostr public key
  communityId: string;     // Community UUID
  joinedAt: number;        // Unix timestamp
  role: 'admin' | 'co-admin' | 'member';
  status: 'active' | 'muted' | 'banned';
  verificationBucket: string; // Coarse location (100m grid)
}
```

**Validation Rules**:
- `pubkey` must be valid Nostr pubkey
- First member automatically gets `admin` role
- Only `admin` can promote to `co-admin`
- Banned members cannot rejoin same community

**State Transitions**:
- `non-member` → `member` (successful join)
- `member` → `co-admin` (promotion)
- `member` → `muted` (moderation)
- `member` → `banned` (permanent removal)

## Relay Events (NIP-29)

### Group Creation Event
```json
{
  "kind": 9000,
  "content": "{\"name\":\"Oslo Coffee House\",\"about\":\"Local community\"}",
  "tags": [
    ["d", "community-uuid"],
    ["location", "59.9139", "10.7522", "25"]
  ]
}
```

### Join Request Event (NIP-29)
```json
{
  "kind": 9021,
  "content": "",
  "tags": [
    ["h", "group-id"],
    ["code", "invite-code-from-validation-service"]
  ]
}
```

### Message Event
```json
{
  "kind": 9,
  "content": "Hello community!",
  "tags": [
    ["g", "community-uuid"]
  ]
}
```

### Moderation Event
```json
{
  "kind": 9003,
  "content": "",
  "tags": [
    ["g", "community-uuid"],
    ["action", "ban"],
    ["p", "target-pubkey"],
    ["reason", "spam"]
  ]
}
```

## Storage Strategy

### Relay Storage (Primary)
- All community data persisted in NIP-29 events
- Invite codes stored as kind:9009 events
- Messages stored as standard Nostr events
- Membership tracked by relay access control
- Expiry and single-use enforced by relay

### Validation Service Storage
- No persistent storage needed
- Admin keypair in environment/config
- Transient location validation only

### Client Storage (IndexedDB)
```
communities              → Joined communities list
messages:{communityId}   → Cached messages for offline
profile                  → User's Nostr profile
```

## Privacy Considerations

### Data Minimization
- Raw GPS coordinates: Discarded after validation
- Photos: Not stored (deferred feature)
- IP addresses: Not logged beyond rate limiting
- Verification: Only pass/fail + coarse bucket stored

### Coarse Location Buckets
```typescript
function getLocationBucket(lat: number, lng: number): string {
  // Round to ~100m grid
  const bucketLat = Math.round(lat * 1000) / 1000;
  const bucketLng = Math.round(lng * 1000) / 1000;
  return `${bucketLat},${bucketLng}`;
}
```

### Right to Deletion
- Members can leave communities
- Verification artifacts can be deleted
- Messages remain (blockchain-like persistence)
- Admin actions are immutable audit trail

## Validation Functions

### Distance Calculation
```typescript
function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  // Haversine formula via geolib
  return geolib.getDistance(
    { latitude: lat1, longitude: lng1 },
    { latitude: lat2, longitude: lng2 }
  );
}
```

### Location Validation
```typescript
function validateLocation(
  proof: LocationProof,
  community: Community
): boolean {
  return (
    proof.accuracy <= 20 &&
    proof.distance <= 25 &&
    Math.abs(proof.timestamp - Date.now() / 1000) <= 30
  );
}
```

### Token Validation
```typescript
function validateToken(token: string): JoinToken | null {
  try {
    const decoded = jwt.verify(token, SERVER_SECRET);
    if (decoded.exp < Date.now() / 1000) return null;
    if (decoded.used) return null;
    return decoded as JoinToken;
  } catch {
    return null;
  }
}
```

---
*Data model defined for Phase 1 requirements*