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
  const len = hex.length;
  if (len % 2 !== 0) throw new Error('padded hex string expected');
  const out = new Uint8Array(len / 2);
  for (let i = 0; i < out.length; i++) {
    const j = i * 2;
    const byte = Number.parseInt(hex.slice(j, j + 2), 16);
    if (Number.isNaN(byte)) throw new Error('invalid hex byte');
    out[i] = byte;
  }
  return out;
}