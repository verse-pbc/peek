import { createAvatar } from '@dicebear/core';
import { shapes } from '@dicebear/collection';

/**
 * Generate a deterministic DiceBear avatar SVG from a Nostr pubkey
 * Uses the shapes style for a clean, abstract look
 */
export function generateDiceBearAvatar(pubkey: string, size: number = 64): string {
  const svg = createAvatar(shapes, {
    seed: pubkey,
    size,
    backgroundColor: ['transparent'],
    radius: 50, // Makes it circular
  }).toString();

  return svg;
}

/**
 * Get a data URL for the DiceBear avatar (for use in img src)
 */
export function getDiceBearDataUrl(pubkey: string, size: number = 64): string {
  const svg = generateDiceBearAvatar(pubkey, size);
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml,${encoded}`;
}
