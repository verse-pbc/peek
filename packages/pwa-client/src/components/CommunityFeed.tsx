import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Users } from 'lucide-react';
import { NIP29_KINDS } from '@/services/relay-manager';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { useRelayManager } from '@/contexts/RelayContext';
import { Event } from 'nostr-tools';
import { hexToBytes } from '@/lib/hex';
import { UserProfile } from '@/components/UserProfile';

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

// Helper function to resolve identity through migration chain
function resolveIdentity(pubkey: string): string {
  const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
  let current = pubkey;
  const visited = new Set<string>();
  const maxDepth = 10;

  for (let i = 0; i < maxDepth; i++) {
    if (visited.has(current)) {
      // Circular reference detected
      break;
    }
    visited.add(current);

    const next = migrations[current];
    if (!next) {
      break;
    }
    current = next;
  }

  return current;
}

export function CommunityFeed({
  groupId,
  communityName = 'Community',
  isAdmin = false,
  onMemberClick
}: CommunityFeedProps) {
  const { identity } = useNostrLogin();
  const { relayManager, connected: relayConnected } = useRelayManager();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to connection status from context
  useEffect(() => {
    setConnected(relayConnected);
    if (relayConnected) {
      console.log('[CommunityFeed] Connected to relay');
      setLoading(false);
    }
  }, [relayConnected]);

  // Subscribe to group messages
  useEffect(() => {
    if (!relayManager) return;

    // Try to subscribe even if auth fails - we might still get public messages
    setLoading(true);

    // Subscribe to this group (Community page already subscribes, but this is safe as RelayManager should handle duplicates)
    relayManager.subscribeToGroup(groupId);

    // Initialize members with current user's pubkey (we know they're a member if they're viewing this)
    const userPubkey = relayManager.getUserPubkey() || identity?.publicKey;
    if (userPubkey) {
      setMembers(new Set([userPubkey]));
    } else {
      // Fallback: at least count 1 member since someone must be viewing this
      setMembers(new Set(['placeholder']));
    }

    // Listen for chat messages
    console.log(`[CommunityFeed] Registering for events: kind-${NIP29_KINDS.CHAT_MESSAGE} (kind-9)`);
    const unsubscribeMessages = relayManager.onEvent(`kind-${NIP29_KINDS.CHAT_MESSAGE}`, async (event: Event) => {
      console.log(`[CommunityFeed] Received chat message event:`, event.id, event.content);
      // Check if message is for this group
      const hTag = event.tags.find(t => t[0] === 'h');
      if (hTag?.[1] !== groupId) {
        console.log(`[CommunityFeed] Message not for this group: ${hTag?.[1]} vs ${groupId}`);
        return;
      }

      const message: Message = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at
      };

      setMessages(prev => {
        const exists = prev.find(m => m.id === message.id);
        if (!exists) {
          console.log(`[CommunityFeed] Adding new message to UI:`, message.content);
          const updated = [...prev, message].sort((a, b) => a.created_at - b.created_at);
          console.log(`[CommunityFeed] Total messages now:`, updated.length);
          return updated.slice(-100); // Keep last 100 messages
        } else {
          console.log(`[CommunityFeed] Duplicate message, skipping:`, message.id);
          return prev;
        }
      });

      // Track members
      setMembers(prev => new Set([...prev, event.pubkey]));
    });

    // Listen for group members updates
    const unsubscribeMembers = relayManager.onEvent(`group-metadata-${groupId}`, (event: Event) => {
      if (event.kind === NIP29_KINDS.GROUP_MEMBERS) {
        const memberPubkeys = event.tags
          .filter(t => t[0] === 'p')
          .map(t => t[1]);
        setMembers(new Set(memberPubkeys));
      }
    });

    setLoading(false);

    return () => {
      unsubscribeMessages();
      unsubscribeMembers();
      relayManager.unsubscribeFromGroup(groupId);
    };
  }, [relayManager, groupId]); // Removed 'identity' dependency to prevent infinite loops

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
    <Card className="flex flex-col h-[600px] overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{communityName}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {members.size} members
            </Badge>
            {isAdmin && <Badge>Admin</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 flex flex-col min-h-0">
        <ScrollArea ref={scrollRef} className="flex-1 px-4 overflow-x-hidden">
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
                    // Check if message is from us (including migrated identities)
                    const resolvedPubkey = resolveIdentity(message.pubkey);
                    const isOwnMessage = identity?.publicKey === resolvedPubkey;

                    return (
                      <div
                        key={message.id}
                        className={`flex items-start gap-3 mb-4 overflow-hidden ${
                          isOwnMessage ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <UserProfile
                          pubkey={message.pubkey}
                          size="sm"
                          showName={false}
                          onClick={() => onMemberClick?.(message.pubkey)}
                        />

                        <div className={`flex-1 min-w-0 ${isOwnMessage ? 'flex flex-col items-end' : ''}`}>
                          <div className={`flex items-baseline gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                            <UserProfile
                              pubkey={message.pubkey}
                              size="sm"
                              showName={true}
                              showAvatar={false}
                              className="inline-flex"
                              nameClassName="text-sm font-medium truncate max-w-[150px]"
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
                            <p className="text-sm break-words">{message.content}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              disabled={sending || !identity || !connected}
              className="flex-1"
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
          {identity && !connected && (
            <p className="text-xs text-muted-foreground mt-2">
              Connecting to relay...
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}