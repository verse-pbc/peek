import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils.js';

export interface TestIdentity {
  secretKey: Uint8Array;
  secretKeyHex: string;
  publicKey: string;
  nsec: string;
  npub: string;
}

export function generateTestIdentity(): TestIdentity {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  return {
    secretKey: sk,
    secretKeyHex: bytesToHex(sk),
    publicKey: pk,
    nsec: nip19.nsecEncode(sk),
    npub: nip19.npubEncode(pk),
  };
}
