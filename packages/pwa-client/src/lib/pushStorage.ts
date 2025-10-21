/**
 * Push Notification State Management (localStorage)
 *
 * Manages subscription state, expiration tracking, and device registration status.
 */

export interface CommunitySubscriptionState {
  subscribed: boolean
  timestamp: number // Unix timestamp of last kind 3081 event
  filterHash: string // SHA-256 of normalized filter
}

export interface PushNotificationState {
  version: number // Schema version
  deviceRegistered: boolean // Has kind 3079 been published?
  deviceTokenTimestamp: number // Unix timestamp of last device registration
  currentFcmToken: string | null // Current FCM token (to detect changes/rotation)
  servicePubkey: string // Cached nostr_push_service public key
  userDisabledPush: boolean // User explicitly disabled push notifications (via toggle)
  communitySubscriptions: {
    [communityId: string]: CommunitySubscriptionState
  }
}

const STORAGE_KEY = 'peek_push_notifications'
const CURRENT_VERSION = 1

/**
 * Load push notification state from localStorage
 */
export function loadState(): PushNotificationState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return createEmptyState()
    }

    const state = JSON.parse(stored) as PushNotificationState

    // Version migration (if needed in future)
    if (state.version !== CURRENT_VERSION) {
      console.warn('[Storage] Migrating from version', state.version, 'to', CURRENT_VERSION)
      return createEmptyState() // For now, reset on version mismatch
    }

    return state
  } catch (error) {
    console.error('[Storage] Failed to load state, resetting:', error)
    return createEmptyState()
  }
}

/**
 * Save push notification state to localStorage
 */
export function saveState(state: PushNotificationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('[Storage] Failed to save state:', error)
    throw error
  }
}

/**
 * Update device registration state
 */
export function updateDeviceRegistration(registered: boolean, timestamp?: number, fcmToken?: string): void {
  const state = loadState()
  state.deviceRegistered = registered
  if (timestamp) {
    state.deviceTokenTimestamp = timestamp
  }
  if (fcmToken !== undefined) {
    state.currentFcmToken = fcmToken
  }
  saveState(state)
}

/**
 * Clear device registration (for deregistration - kind 3080)
 * Also clears all community subscriptions and sets userDisabledPush flag
 */
export function clearDeviceRegistration(): void {
  const state = loadState()
  state.deviceRegistered = false
  state.deviceTokenTimestamp = 0
  state.currentFcmToken = null
  state.userDisabledPush = true // User explicitly disabled
  state.communitySubscriptions = {}
  saveState(state)
}

/**
 * Get stored FCM token
 */
export function getStoredFcmToken(): string | null {
  const state = loadState()
  return state.currentFcmToken
}

/**
 * Check if user explicitly disabled push notifications
 */
export function hasUserDisabledPush(): boolean {
  const state = loadState()
  return state.userDisabledPush || false
}

/**
 * Reset user disabled flag (for auto-enable scenarios)
 */
export function resetUserDisabledFlag(): void {
  const state = loadState()
  state.userDisabledPush = false
  saveState(state)
}

/**
 * Update community subscription state
 */
export function updateSubscriptionState(
  communityId: string,
  subscribed: boolean,
  timestamp?: number,
  filterHash?: string
): void {
  const state = loadState()

  if (subscribed) {
    state.communitySubscriptions[communityId] = {
      subscribed,
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      filterHash: filterHash || ''
    }
  } else {
    delete state.communitySubscriptions[communityId]
  }

  saveState(state)
}

/**
 * Remove community subscription state
 */
export function removeSubscriptionState(communityId: string): void {
  updateSubscriptionState(communityId, false)
}

/**
 * Check if device registration needs refresh (>25 days old)
 */
export function needsDeviceRefresh(): boolean {
  const state = loadState()

  if (!state.deviceRegistered || !state.deviceTokenTimestamp) {
    return false // Not registered yet, no refresh needed
  }

  const now = Math.floor(Date.now() / 1000)
  const age = now - state.deviceTokenTimestamp
  const REFRESH_THRESHOLD = 25 * 24 * 60 * 60 // 25 days in seconds

  return age > REFRESH_THRESHOLD
}

/**
 * Check if a community subscription needs refresh (>25 days old)
 */
export function needsSubscriptionRefresh(communityId: string): boolean {
  const state = loadState()
  const subscription = state.communitySubscriptions[communityId]

  if (!subscription || !subscription.subscribed) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  const age = now - subscription.timestamp
  const REFRESH_THRESHOLD = 25 * 24 * 60 * 60 // 25 days

  return age > REFRESH_THRESHOLD
}

/**
 * Get all communities that need subscription refresh
 */
export function getCommunitiesNeedingRefresh(): string[] {
  const state = loadState()
  const needsRefresh: string[] = []

  for (const [communityId, sub] of Object.entries(state.communitySubscriptions)) {
    if (sub.subscribed && needsSubscriptionRefresh(communityId)) {
      needsRefresh.push(communityId)
    }
  }

  return needsRefresh
}

/**
 * Get all subscribed community IDs
 */
export function getSubscribedCommunities(): string[] {
  const state = loadState()
  return Object.keys(state.communitySubscriptions).filter(
    (id) => state.communitySubscriptions[id].subscribed
  )
}

/**
 * Clear all push notification state
 */
export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Check if device is registered
 */
export function isDeviceRegistered(): boolean {
  const state = loadState()
  return state.deviceRegistered
}

/**
 * Check if subscribed to a specific community
 */
export function isSubscribedToCommunity(communityId: string): boolean {
  const state = loadState()
  return state.communitySubscriptions[communityId]?.subscribed || false
}

/**
 * Create empty initial state
 */
function createEmptyState(): PushNotificationState {
  return {
    version: CURRENT_VERSION,
    deviceRegistered: false,
    deviceTokenTimestamp: 0,
    currentFcmToken: null,
    servicePubkey: '',
    userDisabledPush: false,
    communitySubscriptions: {}
  }
}
