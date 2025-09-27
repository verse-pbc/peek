NIP-XX
======

Identity Continuity
-------------------

`draft` `optional`

This NIP defines a mechanism for users to migrate from one keypair to another, allowing identity continuity across key changes.

**Important**: This does NOT protect against key compromise. An attacker with access to a private key can also publish migration events. This mechanism only provides a verifiable way to claim "same person, new key" for legitimate key rotation scenarios.

## Event Structure

A migration event uses kind `1776` (regular event) and contains a proof signed by the new identity:

```json
{
  "kind": 1776,
  "pubkey": "<old_pubkey>",
  "content": "<stringified_proof_event>",
  "tags": [["p", "<new_pubkey>"]],
  "created_at": 1234567890,
  "id": "<event_id>",
  "sig": "<signature_by_old_key>"
}
```

The `content` field contains a stringified Nostr event (the proof) signed by the NEW identity:

```json
{
  "kind": 1776,
  "pubkey": "<new_pubkey>",
  "content": "",
  "tags": [["p", "<old_pubkey>"]],
  "created_at": 1234567890,
  "id": "<proof_event_id>",
  "sig": "<signature_by_new_key>"
}
```

## Resolution Algorithm

To find the current identity for any pubkey:

1. Query for migration events: `{"kinds": [1776], "authors": ["<pubkey>"]}`
2. Take only the LATEST event (highest `created_at`)
3. Extract `new_pubkey` from the "p" tag
4. Repeat step 1 with `new_pubkey` until no migrations found
5. The final pubkey is the current identity

## Example

Alice migrates to Bob, then Bob migrates to Charlie:

```
Alice publishes:
{
  "kind": 1776,
  "pubkey": "alice_pub",
  "content": "{\"kind\":1776,\"pubkey\":\"bob_pub\",\"content\":\"\",\"tags\":[[\"p\",\"alice_pub\"]],\"sig\":\"bob_sig\",...}",
  "tags": [["p", "bob_pub"]],
  "created_at": 1000
}

Bob publishes:
{
  "kind": 1776,
  "pubkey": "bob_pub",
  "content": "{\"kind\":1776,\"pubkey\":\"charlie_pub\",\"content\":\"\",\"tags\":[[\"p\",\"bob_pub\"]],\"sig\":\"charlie_sig\",...}",
  "tags": [["p", "charlie_pub"]],
  "created_at": 2000
}
```

Resolution:
- Query Alice → finds migration to Bob
- Query Bob → finds migration to Charlie
- Query Charlie → no migrations
- Result: Alice, Bob, and Charlie all resolve to Charlie

## Limitations

- **No protection against compromise**: If an attacker has your private key, they can publish migrations just like you can
- **Migration wars**: In case of key compromise, both attacker and legitimate owner can publish competing migrations indefinitely
- **Social verification recommended**: For high-value identities, out-of-band verification of migrations is advisable
- Circular references should be detected and treated as invalid

## Use Cases

- **Planned key rotation**: Periodic key changes for security hygiene
- **Hardware wallet migration**: Moving from software to hardware key storage
- **Key management upgrades**: Transitioning to better security practices
- **Device changes**: Moving identity to a new device/client

## Client Behavior

Clients SHOULD:
- Cache resolved identity chains for performance
- Display migrated identities with the current identity's profile data
- Show migration indicators in UI when displaying migrated accounts

## Relay Behavior

Relays SHOULD:
- Store all migration events (not replaceable)
- Allow querying by both old and new pubkeys
- Not attempt to verify migration chains (client responsibility)