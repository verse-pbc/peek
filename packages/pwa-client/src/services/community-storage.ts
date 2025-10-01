// Pure functions for community localStorage operations
// Data-oriented: separate data access from business logic

const JOINED_GROUPS_KEY = 'joinedGroups';
const ACCESSED_COMMUNITIES_KEY = 'accessedCommunities';

export interface JoinedGroup {
  communityId: string;
  groupId?: string;
  name?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  isAdmin?: boolean;
  joinedAt?: number;
}

/**
 * Get all joined groups from localStorage
 * Returns empty array if not found or invalid
 */
export function getJoinedGroups(): JoinedGroup[] {
  try {
    const stored = localStorage.getItem(JOINED_GROUPS_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Find a specific joined group by community ID
 */
export function findJoinedGroup(communityId: string): JoinedGroup | null {
  const groups = getJoinedGroups();
  return groups.find(g => g.communityId === communityId) || null;
}

/**
 * Check if user is member of a community
 */
export function isCommunityMember(communityId: string): boolean {
  return findJoinedGroup(communityId) !== null;
}

/**
 * Add or update a joined group
 * Pure regarding the operation - same input produces same localStorage state
 */
export function upsertJoinedGroup(group: JoinedGroup): void {
  const groups = getJoinedGroups();
  const existingIndex = groups.findIndex(g => g.communityId === group.communityId);

  if (existingIndex >= 0) {
    // Update existing
    groups[existingIndex] = {
      ...groups[existingIndex],
      ...group,
      joinedAt: groups[existingIndex].joinedAt || group.joinedAt
    };
  } else {
    // Add new
    groups.push({
      ...group,
      joinedAt: group.joinedAt || Date.now()
    });
  }

  localStorage.setItem(JOINED_GROUPS_KEY, JSON.stringify(groups));
}

/**
 * Remove a joined group
 */
export function removeJoinedGroup(communityId: string): void {
  const groups = getJoinedGroups();
  const filtered = groups.filter(g => g.communityId !== communityId);
  localStorage.setItem(JOINED_GROUPS_KEY, JSON.stringify(filtered));
}

/**
 * Get accessed communities list (for tracking first-time access)
 */
export function getAccessedCommunities(): string[] {
  try {
    const stored = localStorage.getItem(ACCESSED_COMMUNITIES_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Check if community has been accessed before
 */
export function hasAccessedCommunity(communityId: string): boolean {
  const accessed = getAccessedCommunities();
  return accessed.includes(communityId);
}

/**
 * Mark a community as accessed
 */
export function markCommunityAccessed(communityId: string): void {
  const accessed = getAccessedCommunities();
  if (!accessed.includes(communityId)) {
    accessed.push(communityId);
    localStorage.setItem(ACCESSED_COMMUNITIES_KEY, JSON.stringify(accessed));
  }
}
