#!/bin/bash
# Test duplicate member handling

# Create a temporary test script that will test duplicate member addition
cat > /tmp/test_dup.sh << 'SCRIPT'
#!/bin/bash
set -e

GROUP_ID="peek-test-$(uuidgen | tr '[:upper:]' '[:lower:]')"
TEST_USER="aaaa000000000000000000000000000000000000000000000000000000000001"

echo "Testing duplicate member handling for group: $GROUP_ID"
echo "Test user pubkey: $TEST_USER"
echo ""

# Create the group first
echo "1. Creating group..."
nak event -k 9007 -c "" -t "h=$GROUP_ID" --sec=$COMMUNITIES2 communities2.nos.social 2>&1 | grep -E "(success|error)" || echo "Group creation sent"

# Add member first time
echo ""
echo "2. Adding member first time..."
nak event -k 9000 -c "" -t "h=$GROUP_ID" -t "p=$TEST_USER,member" --sec=$COMMUNITIES2 communities2.nos.social 2>&1 | grep -E "(success|error)" || echo "First addition sent"

# Try to add same member again
echo ""
echo "3. Adding same member again (should succeed per NIP-29)..."
nak event -k 9000 -c "" -t "h=$GROUP_ID" -t "p=$TEST_USER,member" --sec=$COMMUNITIES2 communities2.nos.social 2>&1 | grep -E "(success|error)" || echo "Second addition sent"

echo ""
echo "Test complete. Both operations should show 'success' per NIP-29 spec."
SCRIPT

chmod +x /tmp/test_dup.sh
echo "Running duplicate member test..."
echo "================================"
/tmp/test_dup.sh