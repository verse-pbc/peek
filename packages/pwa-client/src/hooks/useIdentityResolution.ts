import { useCallback, useEffect, useState } from 'react';
import { useRelayManager } from '@/contexts/RelayContext';

/**
 * Hook for resolving identities through migration chains
 * Provides centralized access to identity resolution with group context
 */
export function useIdentityResolution(groupId?: string) {
  const { migrationService } = useRelayManager();
  const [resolutionsLoaded, setResolutionsLoaded] = useState(false);

  useEffect(() => {
    if (migrationService && groupId) {
      // Fetch group-specific migrations
      migrationService.fetchGroupMigrations(groupId).then(() => {
        setResolutionsLoaded(true);
      });
    } else {
      setResolutionsLoaded(true);
    }
  }, [migrationService, groupId]);

  /**
   * Resolve a pubkey through migration chain
   * Uses group-specific cache if groupId is provided
   */
  const resolveIdentity = useCallback((pubkey: string): string => {
    if (!migrationService) return pubkey;

    if (groupId) {
      // Use group-specific resolution cache
      return migrationService.getGroupResolution(groupId, pubkey);
    } else {
      // Use general resolution
      return migrationService.resolveIdentity(pubkey);
    }
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
    resolutionsLoaded,
  };
}