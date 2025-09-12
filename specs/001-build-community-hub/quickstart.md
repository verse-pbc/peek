# Quickstart: Community Hub

**Date**: 2025-09-10  
**Feature**: Community Hub for Location-Based Groups

## Prerequisites

- Node.js 20+ and npm 10+
- Redis server running locally or accessible
- Modern browser with geolocation support
- Physical QR code printed (or displayed on screen for testing)

## Setup Instructions

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/verse-pbc/peek.git
cd peek

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with relay URL: wss://peek.hol.is
```

### 2. Start Services

```bash
# Terminal 1: Start validation service
cd packages/validation-service
cargo run

# Terminal 2: Start PWA client
cd packages/pwa-client
npm run dev

# Note: Relay is at wss://peek.hol.is (no local relay needed)
```

### 3. Generate Test QR Code

```bash
# Generate a QR code for testing
npm run generate-qr -- \
  --name "Test Coffee Shop" \
  --lat 37.7749 \
  --lng -122.4194 \
  --relay "wss://peek.hol.is"

# This creates: ./test-qr-code.png
# Print or display this QR code
```

## User Flow Testing

### Scenario 1: Create Community (First Scanner)

1. **Open PWA**: Navigate to http://localhost:5173
2. **Grant Permissions**: Allow camera and location access
3. **Scan QR**: Point camera at test QR code
4. **Create Community**: 
   - You'll see "Create New Community" screen
   - Enter community name and description
   - Click "Create & Join"
5. **Verify**: You should be the admin of the new community

**Expected Result**: Community created, you're the admin

### Scenario 2: Join Existing Community

1. **Setup**: Have another device/browser scan the same QR
2. **Location Check**: 
   - Browser requests precise location
   - Must be within 25m of QR coordinates
3. **Join Flow**:
   - See community preview (name, members)
   - Click "Join Community"
   - Take photo showing QR code (future feature)
4. **Success**: Join successful, see community feed

**Expected Result**: Joined as regular member

### Scenario 3: Remote Join Failure

1. **Spoof Location**: Use browser dev tools to set location >25m away
2. **Scan QR**: Try to join community
3. **Rejection**: 
   - See error: "You must be at the location to join"
   - Shows distance from required location

**Expected Result**: Join rejected with clear error

### Scenario 4: Admin Moderation

1. **As Admin**: Join community you created
2. **Member List**: Tap members icon
3. **Moderation**:
   - Long-press on member
   - Options: Promote, Mute, Ban
   - Select action and confirm
4. **Verify**: Member status updated

**Expected Result**: Moderation action applied

## API Testing

### Test Location Validation

```bash
# Success case (within 25m)
curl -X POST http://localhost:3000/api/validate-location \
  -H "Content-Type: application/json" \
  -d '{
    "communityId": "550e8400-e29b-41d4-a716-446655440000",
    "coordinates": {
      "latitude": 37.7749,
      "longitude": -122.4194
    },
    "accuracy": 15,
    "timestamp": '$(date +%s)',
    "userPubkey": "d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3d3f3"
  }'

# Should return: {"success": true, "token": "...", "expiresAt": ...}
```

### Test Community Preview

```bash
# Get community info without auth
curl http://localhost:3000/api/community/550e8400-e29b-41d4-a716-446655440000/preview

# Should return: {"name": "...", "memberCount": ..., "description": "..."}
```

## Relay Testing

### Connect to Relay

```javascript
// In browser console
const ws = new WebSocket('wss://peek.hol.is');
ws.onopen = () => {
  // Subscribe to community messages
  ws.send(JSON.stringify([
    "REQ",
    "sub1",
    {"kinds": [9], "tags": {"g": ["community-id"]}}
  ]));
};
ws.onmessage = (e) => console.log('Relay message:', e.data);
```

## Performance Validation

### Load Testing

```bash
# Run load test (requires k6)
k6 run tests/load/validation-service.js

# Expected: <500ms p95 latency at 100 req/s
```

### PWA Performance

```bash
# Run Lighthouse audit
npm run lighthouse

# Expected scores:
# - Performance: >90
# - PWA: >90
# - Accessibility: >90
```

## Troubleshooting

### GPS Accuracy Issues
- **Problem**: "GPS accuracy too low" error
- **Solution**: Move to area with clear sky view, wait for GPS lock

### Redis Connection
- **Problem**: "Cannot connect to Redis" 
- **Solution**: Ensure Redis is running: `redis-cli ping`

### Relay Connection
- **Problem**: "WebSocket connection failed"
- **Solution**: Check relay is running, firewall allows WebSocket

### Token Expired
- **Problem**: "Token expired" during join
- **Solution**: Complete join within 5 minutes of validation

## Development Tips

### Mock GPS Location (Chrome)
1. Open DevTools → Sensors
2. Set custom location
3. Override with test coordinates

### Generate Multiple Test Users
```bash
npm run generate-test-users -- --count 10
# Creates test Nostr keypairs in ./test-users.json
```

### Clear Redis Cache
```bash
redis-cli FLUSHDB
```

### Monitor Relay Events
```bash
npm run relay-monitor -- --group community-id
```

## Next Steps

After validating the basic flows:

1. **Deploy to Staging**: Push to test environment
2. **Real Location Test**: Test with actual GPS at physical location  
3. **Multi-User Test**: Have 3+ people join same community
4. **Stress Test**: Simulate 100 concurrent joins
5. **PWA Install**: Test "Add to Home Screen" on mobile

---
*Quickstart guide for development and testing*