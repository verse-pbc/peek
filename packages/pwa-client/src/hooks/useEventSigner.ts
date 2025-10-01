import { useCallback } from 'react';
import { EventTemplate, finalizeEvent, type VerifiedEvent } from 'nostr-tools';
import { resolveSecretKey, isNip07Identity } from '@/lib/secret-key-utils';

/**
 * Hook to get event signing function based on identity type
 * Data-oriented: returns a function that transforms EventTemplate → VerifiedEvent
 */
export function useEventSigner(identity: { secretKey: string } | null | undefined) {
  const signEvent = useCallback(async (eventTemplate: EventTemplate): Promise<VerifiedEvent> => {
    if (isNip07Identity(identity)) {
      // Use NIP-07 extension for signing
      if (!window.nostr) {
        throw new Error('Browser extension not available');
      }
      return await window.nostr.signEvent(eventTemplate) as VerifiedEvent;
    }

    // Use local secret key
    const secretKey = resolveSecretKey(identity);
    if (!secretKey) {
      throw new Error('No secret key available for signing');
    }

    return finalizeEvent(eventTemplate, secretKey) as VerifiedEvent;
  }, [identity]);

  return signEvent;
}
