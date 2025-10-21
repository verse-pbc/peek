// Peek Notification Configuration
// Customize push notification appearance without modifying core code
// This file is loaded by the service worker for background notifications

// Generate deterministic display name from pubkey (matches genUserName in src/)
function genUserName(seed) {
  const adjectives = [
    'Swift', 'Bright', 'Calm', 'Bold', 'Wise', 'Kind', 'Quick', 'Brave',
    'Cool', 'Sharp', 'Clear', 'Strong', 'Smart', 'Fast', 'Keen', 'Pure',
    'Noble', 'Gentle', 'Fierce', 'Steady', 'Clever', 'Proud', 'Silent', 'Wild'
  ];

  const nouns = [
    'Fox', 'Eagle', 'Wolf', 'Bear', 'Lion', 'Tiger', 'Hawk', 'Owl',
    'Deer', 'Raven', 'Falcon', 'Lynx', 'Otter', 'Whale', 'Shark', 'Dolphin',
    'Phoenix', 'Dragon', 'Panther', 'Jaguar', 'Cheetah', 'Leopard', 'Puma', 'Cobra'
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const adjIndex = Math.abs(hash) % adjectives.length;
  const nounIndex = Math.abs(hash >> 8) % nouns.length;

  return adjectives[adjIndex] + ' ' + nouns[nounIndex];
}

// Peek notification configuration
const notificationConfig = {
  // App branding
  icon: '/pwa-192x192.png',
  badge: '/pwa-192x192.png',

  // Title formatter - receives FCM data payload
  formatTitle: function(data) {
    // Server provides communityName (from kind 39000 metadata)
    // Fallback to 'Peek' if not provided
    return data.communityName || 'Peek';
  },

  // Body formatter - receives FCM data payload
  formatBody: function(data) {
    // Server provides formatted body: "SenderName: message"
    // where SenderName comes from kind 0 profile (display_name || name || short npub)
    // Just return as-is
    return data.body || '';
  },

  // Click action URL builder
  getClickUrl: function(data) {
    // Server provides communityId (UUID from i-tag in kind 39000)
    // Use this for navigation instead of groupId (h-tag)
    return data.communityId ? `/c/${data.communityId}` : '/';
  },

  // Notification options (passed to showNotification)
  options: {
    requireInteraction: false,  // Auto-dismiss after a few seconds
    silent: false,               // Allow sound/vibration
    vibrate: [200, 100, 200],   // Vibration pattern
    renotify: true,              // Replace previous notifications with same tag
    actions: []                  // No action buttons (MVP)
  }
};
