#!/bin/bash

# Script to run integration tests with local docker services

echo "Starting local test environment..."

# Start docker services
docker-compose up -d

echo "Waiting for services to be healthy..."

# Wait for groups relay to be ready
until docker-compose exec -T groups_relay curl -f http://localhost:8080 > /dev/null 2>&1; do
    echo "Waiting for groups relay..."
    sleep 2
done

# Wait for validation service to be ready
until docker-compose exec -T validation_service curl -f http://localhost:3001/health > /dev/null 2>&1; do
    echo "Waiting for validation service..."
    sleep 2
done

echo "Services are ready!"

# Run integration tests with test environment
echo "Running integration tests..."
NODE_ENV=test VITE_RELAY_URL=ws://localhost:8080 VITE_VALIDATION_SERVICE_PUBKEY=79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798 npx vitest run tests/integration

# Capture test exit code
TEST_EXIT_CODE=$?

# Stop services
echo "Stopping services..."
docker-compose down

exit $TEST_EXIT_CODE