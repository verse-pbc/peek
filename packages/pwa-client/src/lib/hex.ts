// Minimal hex utilities to avoid external dependency issues
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!.toString(16).padStart(2, '0');
    hex += byte;
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') throw new Error('hex string expected');

  // Remove any '0x' prefix if present
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
  }

  // Validate that the string only contains hex characters
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`Invalid hex string: contains non-hex characters. Input starts with: ${hex.slice(0, 20)}`);
  }

  // Pad with leading zero if odd length
  if (hex.length % 2 !== 0) {
    console.warn(`hexToBytes: Padding odd-length hex string: ${hex.slice(0, 8)}...`);
    hex = '0' + hex;
  }

  const len = hex.length;
  const out = new Uint8Array(len / 2);
  for (let i = 0; i < out.length; i++) {
    const j = i * 2;
    const byte = Number.parseInt(hex.slice(j, j + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex byte at position ${j}: ${hex.slice(j, j + 2)}`);
    out[i] = byte;
  }
  return out;
}