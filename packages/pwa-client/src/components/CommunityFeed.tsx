import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { useRelayManager } from '@/contexts/RelayContext';
import { useIdentityResolution } from '@/hooks/useIdentityResolution';
import { Event, nip19 } from 'nostr-tools';
import { hexToBytes } from '@/lib/hex';
import { UserProfile } from '@/components/UserProfile';
import { MentionInput } from '@/components/MentionInput';
import { useProfile } from '@/contexts/ProfileContext';
import { genUserName } from '@/lib/genUserName';

interface Message {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
}

interface CommunityFeedProps {
  groupId: string;
  communityName?: string;
  isAdmin?: boolean;
  onMemberClick?: (pubkey: string) => void;
}

export function CommunityFeed({
  groupId,
  communityName: _communityName = 'Community',
  isAdmin: _isAdmin = false,
  onMemberClick
}: CommunityFeedProps) {
  const { identity } = useNostrLogin();
  const { relayManager, groupManager: _groupManager, connected: relayConnected } = useRelayManager();
  const { resolveIdentity } = useIdentityResolution(groupId);
  // Note: resolutionVersion from hook automatically triggers re-render when lazy resolutions complete
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledToBottomRef = useRef(false);

  // Subscribe to connection status from context
  useEffect(() => {
    setConnected(relayConnected);
    if (relayConnected) {
      console.log('[CommunityFeed] Connected to relay');
      setLoading(false);
    }
  }, [relayConnected]);

  // Subscribe to chat messages (dedicated subscription handles historical + live)
  useEffect(() => {
    if (!relayManager || !connected) return;

    // Only show loading if we have no messages yet
    // This prevents "Loading messages..." flicker on reconnect - React diffs will handle updates
    if (messages.length === 0) {
      setLoading(true);
    }

    console.log(`[CommunityFeed] Creating dedicated message subscription for group ${groupId}`);

    // Create dedicated subscription for messages (receives historical + live events)
    const unsubscribe = relayManager.subscribeToMessages(groupId, (event: Event) => {
      console.log(`[CommunityFeed] Received message event:`, event.id, event.content.substring(0, 30));

      const message: Message = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at
      };

      setMessages(prev => {
        const exists = prev.find(m => m.id === message.id);
        if (!exists) {
          console.log(`[CommunityFeed] Adding message to UI:`, message.content.substring(0, 30));
          const updated = [...prev, message].sort((a, b) => a.created_at - b.created_at);
          console.log(`[CommunityFeed] Total messages: ${updated.length}`);
          return updated.slice(-100); // Keep last 100 messages
        } else {
          return prev; // Skip duplicates
        }
      });
    });

    // Stop loading after a brief delay to allow EOSE
    setTimeout(() => setLoading(false), 1000);

    return unsubscribe;
  }, [relayManager, groupId, connected]); // messages.length intentionally omitted - only check on connection change

  // Auto-scroll to bottom on new messages (but not on initial load)
  useEffect(() => {
    // Only auto-scroll if we've already done the initial scroll
    if (scrollRef.current && hasScrolledToBottomRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          console.log('[CommunityFeed] Auto-scrolled to:', scrollRef.current.scrollTop, 'height:', scrollRef.current.scrollHeight);
        }
      }, 100);
    }
  }, [messages]);

  // Scroll to bottom on initial load (after messages are loaded)
  useEffect(() => {
    if (!loading && messages.length > 0 && !hasScrolledToBottomRef.current) {
      console.log('[CommunityFeed] Triggering initial scroll to bottom, messages:', messages.length);
      // Use multiple attempts to ensure scroll happens after render
      const scrollToBottom = () => {
        if (scrollRef.current) {
          const element = scrollRef.current;
          const scrollHeight = element.scrollHeight;
          const clientHeight = element.clientHeight;
          const maxScroll = scrollHeight - clientHeight;

          console.log('[CommunityFeed] Scroll debug - scrollHeight:', scrollHeight, 'clientHeight:', clientHeight, 'maxScroll:', maxScroll);

          // Try both methods
          element.scrollTop = maxScroll;
          element.scrollTo({ top: maxScroll, behavior: 'auto' });

          // Also try scrolling to a large number as fallback
          element.scrollTo({ top: 999999, behavior: 'auto' });

          console.log('[CommunityFeed] Initial scroll attempt - scrollTop after set:', element.scrollTop, 'target was:', maxScroll);
        }
      };

      // Try multiple times with increasing delays to catch render
      setTimeout(scrollToBottom, 0);
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 300);
      setTimeout(scrollToBottom, 500);
      setTimeout(scrollToBottom, 800);
      setTimeout(scrollToBottom, 1200);

      // Mark as done after first attempt
      setTimeout(() => {
        hasScrolledToBottomRef.current = true;
      }, 100);
    }
  }, [loading, messages]);

  const sendMessage = async () => {
    if (!relayManager || !identity || !newMessage.trim() || !connected) return;

    setSending(true);
    try {
      // If using NIP-07, pass undefined for secretKey (will use event signer)
      const secretKey = identity.secretKey === 'NIP07_EXTENSION'
        ? undefined
        : hexToBytes(identity.secretKey);

      await relayManager.sendMessage(groupId, newMessage.trim(), secretKey);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const today = new Date();

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString();
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, Message[]>);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Messages ScrollArea */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[88px] min-h-0"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages yet. Be the first to say hello!
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-4">
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {date}
                  </div>
                </div>

                {dateMessages.map((message) => {
                  // Resolve identity to handle migrations - show current identity not old one
                  const resolvedPubkey = resolveIdentity(message.pubkey);
                  if (resolvedPubkey !== message.pubkey) {
                    console.log(`[CommunityFeed] 🔄 Resolved identity: ${message.pubkey.slice(0,8)}... → ${resolvedPubkey.slice(0,8)}...`);
                  }
                  const isOwnMessage = identity?.publicKey === resolvedPubkey;

                  return (
                    <div
                      key={message.id}
                      className={`flex items-start gap-3 mb-4 ${
                        isOwnMessage ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <UserProfile
                        pubkey={resolvedPubkey}
                        size="sm"
                        showName={false}
                        onClick={() => onMemberClick?.(resolvedPubkey)}
                        groupId={groupId}
                      />

                      <div className={`flex-1 min-w-0 ${isOwnMessage ? 'flex flex-col items-end' : ''}`}>
                        <div className={`flex items-baseline gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                          <UserProfile
                            pubkey={resolvedPubkey}
                            size="sm"
                            showName={true}
                            showAvatar={false}
                            className="inline-flex"
                            nameClassName="text-sm font-semibold truncate max-w-[150px]"
                            groupId={groupId}
                          />
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTime(message.created_at)}
                          </span>
                        </div>

                        <div className={`rounded-lg px-3 py-2 max-w-[280px] ${
                          isOwnMessage
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}>
                          <MessageContent content={message.content} groupId={groupId} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Input Container at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-50 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
          <MentionInput
            value={newMessage}
            onChange={setNewMessage}
            onSubmit={sendMessage}
            placeholder="Type a message..."
            disabled={sending || !identity || !connected}
            groupId={groupId}
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !identity || !connected || !newMessage.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {!identity && (
          <p className="text-xs text-muted-foreground mt-2">
            Connect your Nostr account to send messages
          </p>
        )}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ content, groupId }: { content: string; groupId: string }) {
  const { resolveIdentity } = useIdentityResolution(groupId);

  const parts = content.split(/(nostr:npub1[023456789acdefghjklmnpqrstuvwxyz]+)/g);

  return (
    <p className="text-sm break-words">
      {parts.map((part, index) => {
        if (part.startsWith('nostr:npub1')) {
          const npub = part.replace('nostr:', '');
          try {
            const decoded = nip19.decode(npub);
            if (decoded.type === 'npub') {
              const pubkey = decoded.data;
              const resolvedPubkey = resolveIdentity(pubkey);
              return <MentionDisplay key={index} pubkey={resolvedPubkey} />;
            }
          } catch {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

function MentionDisplay({ pubkey }: { pubkey: string }) {
  const { data: profile } = useProfile(pubkey);
  const displayName = profile?.display_name || profile?.name || genUserName(pubkey);

  return (
    <span className="font-medium bg-accent/30 px-1 rounded">
      @{displayName}
    </span>
  );
}