import React from 'react';
import { NostrContext, useNostrLogin } from '@/lib/nostrify-shim';

interface NostrUser { pubkey: string }

export function useNostrContext(): { ndk: any | null; user: NostrUser | null } {
  const ctx = React.useContext(NostrContext) as any;
  const { pubkey } = useNostrLogin();
  const user = pubkey ? { pubkey } : null;
  return { ndk: ctx?.nostr ?? null, user };
}