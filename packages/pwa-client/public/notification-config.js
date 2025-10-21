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
    // data: { senderPubkey, receiverPubkey, groupId, title (from server), body, ... }

    // Extract community name from groupId if available
    // groupId format: "peek-{id}" or full community name
    let communityName = 'Peek';

    if (data.groupId) {
      // Try to make groupId more readable
      const id = data.groupId.replace('peek-', '');
      // For now, just show "Peek" - server could send community name in future
      communityName = 'Peek';
    }

    return communityName;
  },

  // Body formatter - receives FCM data payload
  formatBody: function(data) {
    // Include sender name as prefix for context
    const senderName = data.senderPubkey
      ? genUserName(data.senderPubkey)
      : 'Someone';

    const message = data.body || '';

    // Format: "Sender: message"
    return `${senderName}: ${message}`;
  },

  // Click action URL builder
  getClickUrl: function(data) {
    // Navigate to community if groupId present
    return data.groupId ? `/c/${data.groupId}` : '/';
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
