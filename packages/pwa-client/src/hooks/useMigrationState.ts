import { useState, useEffect, useCallback } from 'react';
import { parseMigrationState, isGroupMigrating, type MigrationState } from '@/lib/migration-utils';

const MIGRATION_KEY = 'identity_migrating';

/**
 * Hook to manage identity migration state
 * Data-oriented: encapsulates localStorage access, returns plain data
 */
export function useMigrationState(groupId: string | null) {
  const [migrationState, setMigrationState] = useState<MigrationState | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // Load migration state on mount and when groupId changes
  useEffect(() => {
    const json = localStorage.getItem(MIGRATION_KEY);
    const state = parseMigrationState(json);
    setMigrationState(state);

    if (groupId && state) {
      const migrating = isGroupMigrating(state, groupId);
      setIsMigrating(migrating);
      if (migrating) {
        console.log('[useMigrationState] Migration in progress for group:', groupId);
      }
    } else {
      setIsMigrating(false);
    }
  }, [groupId]);

  // Clear migration state
  const clearMigration = useCallback(() => {
    localStorage.removeItem(MIGRATION_KEY);
    setMigrationState(null);
    setIsMigrating(false);
    console.log('[useMigrationState] Migration state cleared');
  }, []);

  return {
    migrationState,
    isMigrating,
    migratingGroups: migrationState?.groups || [],
    clearMigration
  };
}
