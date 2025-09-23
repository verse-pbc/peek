import { getPublicKey, generateSecretKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

console.log('=== Nostr-Tools Public Key Format Investigation ===\n');

// Test with a known private key to get consistent public key
const testPrivateKey = new Uint8Array([
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
]);

// Generate public key
const pubkeyHex = getPublicKey(testPrivateKey);
console.log('Generated pubkey from test private key:');
console.log('  Hex format:', pubkeyHex);
console.log('  Hex length:', pubkeyHex.length);
console.log('  Type:', typeof pubkeyHex);

// Convert to npub
const npub = nip19.npubEncode(pubkeyHex);
console.log('  Npub format:', npub);

// Test decoding different formats
console.log('\n=== Testing different input formats ===\n');

const testCases = [
    ['Valid hex lowercase', '5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f'],
    ['Valid hex uppercase', '5504598D51F267A0A0A859EFC9D424AEEB0FCC5EC78263536FFF141123B8E95F'],
    ['Hex with 0x prefix', '0x5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f'],
    ['Valid npub', 'npub125z9nr237fn6pg9gt8hun4py4m4slnz7c7pxx5m0lu2pzgaca90sppxj73']
];

testCases.forEach(([name, input]) => {
    console.log(`Testing ${name}:`);
    console.log(`  Input: ${input}`);

    // Try npub decode
    try {
        const decoded = nip19.decode(input);
        console.log(`  ✓ npub decode succeeded: type=${decoded.type}, data=${decoded.data}`);
    } catch (e) {
        console.log(`  ✗ npub decode failed: ${e.message}`);
    }

    // Check if it's valid hex (for gift wrap recipient)
    const isValidHex = /^[0-9a-fA-F]{64}$/.test(input);
    console.log(`  Is valid 64-char hex: ${isValidHex}`);

    // If hex with 0x prefix, strip it
    const cleaned = input.startsWith('0x') ? input.slice(2) : input;
    const isCleanedValidHex = /^[0-9a-fA-F]{64}$/.test(cleaned);
    console.log(`  After cleanup, is valid hex: ${isCleanedValidHex}`);

    console.log();
});

// Test the actual pubkey from our logs
console.log('=== Testing actual pubkey from logs ===');
const actualPubkey = '5504598d51f267a0a0a859efc9d424aeeb0fcc5ec78263536fff141123b8e95f';
console.log('Pubkey:', actualPubkey);
console.log('Length:', actualPubkey.length);
console.log('Is valid hex:', /^[0-9a-fA-F]{64}$/.test(actualPubkey));
console.log('Type:', typeof actualPubkey);

// Show what nostr-tools expects
console.log('\n=== What nostr-tools expects for gift wrap ===');
console.log('For createWrap/createSeal recipientPublicKey parameter:');
console.log('  - Type: string');
console.log('  - Format: 64-character lowercase hex string');
console.log('  - Example:', pubkeyHex);
console.log('  - NOT npub format');
console.log('  - NOT with 0x prefix');