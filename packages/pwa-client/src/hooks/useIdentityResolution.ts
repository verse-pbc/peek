import { useCallback, useState, useRef } from 'react';
import { useRelayManager } from '@/contexts/RelayContext';

/**
 * Hook for resolving identities through migration chains
 * Provides centralized access to identity resolution with group context
 */
export function useIdentityResolution(groupId?: string) {
  const { migrationService } = useRelayManager();
  const [resolutionVersion, setResolutionVersion] = useState(0);
  const attemptedResolutions = useRef<Set<string>>(new Set());

  // Removed eager fetchGroupMigrations() - now using lazy resolution
  // Migrations are fetched on-demand when resolveIdentity() encounters unknown pubkey

  /**
   * Resolve a pubkey through migration chain (lazy loading)
   * Checks cache first, triggers background fetch if needed
   * Tracks attempted resolutions to avoid infinite loops for pubkeys with no migrations
   */
  const resolveIdentity = useCallback((pubkey: string): string => {
    if (!migrationService) return pubkey;

    // Try to resolve from cache
    const resolved = migrationService.resolveIdentity(pubkey);

    // If not resolved AND haven't attempted this pubkey before, trigger lazy fetch
    if (resolved === pubkey && groupId && !attemptedResolutions.current.has(pubkey)) {
      // Mark as attempted to avoid repeated queries
      attemptedResolutions.current.add(pubkey);

      migrationService.resolveLazy(pubkey, groupId).then((finalPubkey) => {
        if (finalPubkey !== pubkey) {
          // Resolution found! Trigger re-render by incrementing version
          setResolutionVersion(v => v + 1);
        }
      }).catch(err => {
        console.error('[useIdentityResolution] Lazy resolution failed:', err);
      });
    }

    return resolved;
  }, [migrationService, groupId]);

  /**
   * Check if a pubkey has migrated
   */
  const hasMigrated = useCallback((pubkey: string): boolean => {
    if (!migrationService) return false;
    return migrationService.hasMigrated(pubkey);
  }, [migrationService]);

  /**
   * Get full migration history for a pubkey
   */
  const getMigrationHistory = useCallback((pubkey: string): string[] => {
    if (!migrationService) return [pubkey];
    return migrationService.getMigrationHistory(pubkey);
  }, [migrationService]);

  return {
    resolveIdentity,
    hasMigrated,
    getMigrationHistory,
    resolutionVersion, // For triggering re-renders when lazy resolutions complete
  };
}