import React from 'react';
import { NostrContext, useNostrLogin, NPool } from '@/lib/nostr-identity';

interface NostrUser { pubkey: string }

interface NostrContextType {
  nostr: NPool | null;
}

export function useNostrContext(): { ndk: NPool | null; user: NostrUser | null } {
  const ctx = React.useContext(NostrContext) as NostrContextType;
  const { pubkey } = useNostrLogin();
  const user = pubkey ? { pubkey } : null;
  return { ndk: ctx?.nostr ?? null, user };
}