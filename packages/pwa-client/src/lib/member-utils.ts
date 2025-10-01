// Pure functions for member data transformation
// Data-oriented: separate member transformations from component logic

import { nip19 } from 'nostr-tools';
import type { GroupState } from '@/services/relay-manager';

export interface Member {
  pubkey: string;
  npub: string;
  isAdmin: boolean;
  isMuted: boolean;
  joinedAt?: number;
}

/**
 * Transform GroupState to Member array
 * Pure function: same input → same output
 */
export function transformGroupStateToMembers(groupState: GroupState | null | undefined): Member[] {
  if (!groupState) return [];

  const members: Member[] = [];

  for (const [pubkey] of groupState.members) {
    members.push({
      pubkey,
      npub: nip19.npubEncode(pubkey),
      isAdmin: groupState.admins.has(pubkey), // admins is Map, use has()
      isMuted: false, // TODO: Track mute state from relay
      joinedAt: Date.now() / 1000 // TODO: Get actual join time from events
    });
  }

  return members;
}

/**
 * Sort members: admins first, then by join date
 * Pure function: deterministic sort
 */
export function sortMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    // Admins first
    if (a.isAdmin !== b.isAdmin) {
      return a.isAdmin ? -1 : 1;
    }
    // Then by join date (newest first)
    return (b.joinedAt || 0) - (a.joinedAt || 0);
  });
}

/**
 * Transform and sort in one operation
 */
export function getOrderedMembers(groupState: GroupState | null | undefined): Member[] {
  const members = transformGroupStateToMembers(groupState);
  return sortMembers(members);
}
