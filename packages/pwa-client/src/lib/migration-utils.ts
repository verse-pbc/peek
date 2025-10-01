// Pure data transformation functions for identity migration
// Data-oriented: separate data from behavior, use plain objects

export interface MigrationState {
  from: string;
  to: string;
  groups: string[];
  timestamp: number;
}

/**
 * Parse migration state from localStorage JSON string
 * Returns null if invalid or not found
 */
export function parseMigrationState(json: string | null): MigrationState | null {
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);

    // Validate required fields
    if (!parsed.from || !parsed.to || !Array.isArray(parsed.groups)) {
      return null;
    }

    return {
      from: parsed.from,
      to: parsed.to,
      groups: parsed.groups,
      timestamp: parsed.timestamp || Date.now()
    };
  } catch {
    return null;
  }
}

/**
 * Check if a group is part of an ongoing migration
 */
export function isGroupMigrating(state: MigrationState | null, groupId: string): boolean {
  if (!state || !state.groups) return false;
  return state.groups.includes(groupId);
}

/**
 * Check if migration has timed out (older than 60 seconds)
 */
export function isMigrationExpired(state: MigrationState | null): boolean {
  if (!state) return false;
  const age = Date.now() - state.timestamp;
  return age > 60000; // 60 seconds
}

/**
 * Get all groups that are currently migrating
 */
export function getMigratingGroups(state: MigrationState | null): string[] {
  return state?.groups || [];
}
