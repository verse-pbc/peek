#!/bin/bash
# Migration script to add NIP-73 k-tags to existing peek groups
# Usage: ./migrate_add_k_tags.sh <hex_secret_key> [relay_url] [--dry-run]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SECRET_KEY="${1}"
RELAY_URL="${2:-wss://communities2.nos.social}"
DRY_RUN="${3}"

# Validate arguments
if [ -z "$SECRET_KEY" ]; then
    echo -e "${RED}Error: Secret key required${NC}"
    echo "Usage: $0 <hex_secret_key> [relay_url] [--dry-run]"
    exit 1
fi

# Check dependencies
if ! command -v nak &> /dev/null; then
    echo -e "${RED}Error: nak is not installed. Install with: cargo install nak${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    exit 1
fi

echo -e "${BLUE}=== Peek Group k-tag Migration ===${NC}\n"
echo "Relay: $RELAY_URL"
if [ "$DRY_RUN" = "--dry-run" ]; then
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
fi
echo ""

# Fetch all kind 39000 events
echo -e "${YELLOW}Fetching all GROUP_METADATA (kind 39000) events...${NC}"
METADATA_JSON=$(nak req -k 39000 --fpa --sec "$SECRET_KEY" "$RELAY_URL" 2>/dev/null)

if [ -z "$METADATA_JSON" ]; then
    echo -e "${RED}No metadata events found${NC}"
    exit 0
fi

echo -e "${GREEN}Fetched metadata events${NC}\n"

# Parse events and find those needing k-tags
echo -e "${YELLOW}Analyzing events for missing k-tags...${NC}\n"

EVENTS_TO_MIGRATE=$(echo "$METADATA_JSON" | jq -c '
  select(
    (.tags | any(.[0] == "i" and (.[1] | startswith("peek:uuid:")))) and
    (.tags | any(.[0] == "k" and .[1] == "peek:uuid") | not)
  )
')

if [ -z "$EVENTS_TO_MIGRATE" ]; then
    echo -e "${GREEN}✅ All peek groups already have k-tags!${NC}"
    exit 0
fi

# Count events to migrate
MIGRATE_COUNT=$(echo "$EVENTS_TO_MIGRATE" | wc -l | tr -d ' ')
echo -e "${BLUE}Found ${MIGRATE_COUNT} groups needing k-tag migration${NC}\n"

# Process each event
SUCCESS_COUNT=0
FAIL_COUNT=0

while IFS= read -r event; do
    # Extract group ID from d-tag
    GROUP_ID=$(echo "$event" | jq -r '.tags[] | select(.[0] == "d") | .[1]')

    # Extract UUID from i-tag
    UUID=$(echo "$event" | jq -r '.tags[] | select(.[0] == "i" and (.[1] | startswith("peek:uuid:"))) | .[1]' | sed 's/peek:uuid://')

    if [ -z "$GROUP_ID" ] || [ -z "$UUID" ]; then
        echo -e "${RED}⚠️ Skipping event: missing group ID or UUID${NC}"
        ((FAIL_COUNT++))
        continue
    fi

    echo -e "${BLUE}Migrating group: ${GROUP_ID} (UUID: ${UUID})${NC}"

    # Build nak command with all existing tags + k-tag
    NAK_CMD="nak event -k 9002"

    # Add h-tag (required for SET_METADATA)
    NAK_CMD="$NAK_CMD -t h='${GROUP_ID}'"

    # Extract and add each tag from the event
    while IFS= read -r tag; do
        TAG_KEY=$(echo "$tag" | jq -r '.[0]')
        TAG_VALUE=$(echo "$tag" | jq -r '.[1] // ""')

        # Skip d-tag (not needed in SET_METADATA)
        if [ "$TAG_KEY" = "d" ]; then
            continue
        fi

        # Add tag based on type
        if [ -z "$TAG_VALUE" ]; then
            # Flag tag (no value)
            NAK_CMD="$NAK_CMD -t ${TAG_KEY}"
        else
            # Value tag
            NAK_CMD="$NAK_CMD -t ${TAG_KEY}='${TAG_VALUE}'"
        fi
    done < <(echo "$event" | jq -c '.tags[]')

    # Add the new k-tag
    NAK_CMD="$NAK_CMD -t k='peek:uuid'"

    # Add secret key and relay
    NAK_CMD="$NAK_CMD --sec='${SECRET_KEY}' '${RELAY_URL}'"

    echo -e "${YELLOW}Command:${NC} ${NAK_CMD}"

    if [ "$DRY_RUN" = "--dry-run" ]; then
        echo -e "${YELLOW}[DRY RUN] Would execute above command${NC}"
        ((SUCCESS_COUNT++))
    else
        # Execute the command
        if eval "$NAK_CMD" 2>&1; then
            echo -e "${GREEN}✅ Migrated ${GROUP_ID}${NC}"
            ((SUCCESS_COUNT++))
            sleep 0.5  # Rate limiting
        else
            echo -e "${RED}❌ Failed to migrate ${GROUP_ID}${NC}"
            ((FAIL_COUNT++))
        fi
    fi

    echo ""
done <<< "$EVENTS_TO_MIGRATE"

# Summary
echo -e "\n${BLUE}=== Migration Summary ===${NC}"
echo -e "Total groups: ${MIGRATE_COUNT}"
echo -e "${GREEN}Successful: ${SUCCESS_COUNT}${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}Failed: ${FAIL_COUNT}${NC}"
fi

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo -e "\n${YELLOW}This was a dry run. Run without --dry-run to apply changes.${NC}"
fi
