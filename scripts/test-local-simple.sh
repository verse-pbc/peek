#!/bin/bash

# Script to run integration tests with local services (relay in docker, validation service locally)

echo "Starting local test environment..."

# Start docker relay only
docker-compose up -d groups_relay

echo "Waiting for relay to be ready..."

# Wait for groups relay to be ready (check websocket endpoint)
until curl -f -s http://localhost:8090 > /dev/null 2>&1; do
    echo "Waiting for groups relay..."
    sleep 2
done

echo "Relay is ready!"

# Start validation service locally in background
echo "Starting validation service..."
cd packages/validation-service
RELAY_URL=ws://localhost:8090 \
RELAY_SECRET_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
SERVICE_NSEC=nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsmhltgl \
PORT=3001 \
MAX_DISTANCE_METERS=25 \
MAX_ACCURACY_METERS=20 \
MAX_TIMESTAMP_AGE_SECONDS=300 \
INVITE_EXPIRY_SECONDS=300 \
cargo run &

VALIDATION_PID=$!
cd ../..

# Wait for validation service to be ready
echo "Waiting for validation service..."
sleep 5

# Check if validation service started
if ! kill -0 $VALIDATION_PID 2>/dev/null; then
    echo "Validation service failed to start"
    docker-compose down
    exit 1
fi

echo "Services are ready!"

# Run integration tests with test environment
echo "Running integration tests..."
NODE_ENV=test \
VITE_RELAY_URL=ws://localhost:8090 \
VITE_VALIDATION_SERVICE_PUBKEY=79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798 \
npx vitest run tests/integration

# Capture test exit code
TEST_EXIT_CODE=$?

# Stop services
echo "Stopping services..."
kill $VALIDATION_PID 2>/dev/null
docker-compose down

exit $TEST_EXIT_CODE