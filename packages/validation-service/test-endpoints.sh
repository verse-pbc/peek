#!/bin/bash

# Test script for validation service endpoints

BASE_URL="http://localhost:3001"
COMMUNITY_ID="123e4567-e89b-12d3-a456-426614174000"
# Valid test npub (public key)
USER_PUBKEY="npub1xtscya34g58tk0z605fvr788k263gsu6cy9x0mhnm87echrgufzsevkk5s"

echo "Testing Validation Service Endpoints"
echo "===================================="

# Test health endpoint
echo -e "\n1. Testing /health endpoint..."
curl -s "$BASE_URL/health" | jq .

# Note: Community preview is now part of validate-location response
echo -e "\n2. Skipping separate preview test (merged into validate-location)..."

# Test validate-location (first scan - creates community)
echo -e "\n3. Testing /api/validate-location (first scan)..."
curl -s -X POST "$BASE_URL/api/validate-location" \
  -H "Content-Type: application/json" \
  -d '{
    "community_id": "'$COMMUNITY_ID'",
    "location_proof": {
      "coordinates": {
        "latitude": 37.7749,
        "longitude": -122.4194
      },
      "accuracy": 15.0,
      "timestamp": '$(date +%s)'
    },
    "user_pubkey": "'$USER_PUBKEY'"
  }' | jq .

# Note: Preview info is now included in validate-location response
echo -e "\n4. Preview info now included in validate-location response above"

# Test validate-location (subsequent scan - nearby)
echo -e "\n5. Testing /api/validate-location (nearby user)..."
curl -s -X POST "$BASE_URL/api/validate-location" \
  -H "Content-Type: application/json" \
  -d '{
    "community_id": "'$COMMUNITY_ID'",
    "location_proof": {
      "coordinates": {
        "latitude": 37.7750,
        "longitude": -122.4195
      },
      "accuracy": 10.0,
      "timestamp": '$(date +%s)'
    },
    "user_pubkey": "npub1g53mukxnjkcmr94fhryzkqutdz2ukq4ks0gvy5af25rgmwsl4ngq43drvk"
  }' | jq .

# Test validate-location (subsequent scan - too far)
echo -e "\n6. Testing /api/validate-location (too far)..."
curl -s -X POST "$BASE_URL/api/validate-location" \
  -H "Content-Type: application/json" \
  -d '{
    "community_id": "'$COMMUNITY_ID'",
    "location_proof": {
      "coordinates": {
        "latitude": 37.8000,
        "longitude": -122.4000
      },
      "accuracy": 10.0,
      "timestamp": '$(date +%s)'
    },
    "user_pubkey": "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"
  }' | jq .

echo -e "\n===================================="
echo "Test complete!"