import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send } from 'lucide-react';
import { NIP29_KINDS } from '@/services/relay-manager';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { useRelayManager } from '@/contexts/RelayContext';
import { useIdentityResolution } from '@/hooks/useIdentityResolution';
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

export function CommunityFeed({
  groupId,
  communityName = 'Community',
  isAdmin = false,
  onMemberClick
}: CommunityFeedProps) {
  const { identity } = useNostrLogin();
  const { relayManager, connected: relayConnected } = useRelayManager();
  const { resolveIdentity } = useIdentityResolution(groupId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
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

  // Subscribe to group and register handlers (single atomic operation)
  useEffect(() => {
    if (!relayManager) return;

    setLoading(true);

    // Subscribe to group events
    relayManager.subscribeToGroup(groupId);

    // Register message handler
    console.log(`[CommunityFeed] Registering for events: kind-${NIP29_KINDS.CHAT_MESSAGE}`);
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

      // Note: Member tracking removed - kind 39002 is authoritative source
      // Adding members from messages caused double-counting after migrations
    });

    // Listen for group members updates (kind 39002) - for future use
    const unsubscribeMembers = relayManager.onEvent(`group-metadata-${groupId}`, (_event: Event) => {
      // Member count now shown only in Community.tsx header
      // Could track member list here for @mentions or other features
    });

    setLoading(false);

    return () => {
      unsubscribeMessages();
      unsubscribeMembers();
    };
  }, [relayManager, groupId]); // Minimal deps - migration fetching handled by useIdentityResolution

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
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Badge>Admin</Badge>
            </div>
          )}
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
                    // Resolve identity to handle migrations - show current identity not old one
                    const resolvedPubkey = resolveIdentity(message.pubkey);
                    if (resolvedPubkey !== message.pubkey) {
                      console.log(`[CommunityFeed] 🔄 Resolved identity: ${message.pubkey.slice(0,8)}... → ${resolvedPubkey.slice(0,8)}...`);
                    }
                    const isOwnMessage = identity?.publicKey === resolvedPubkey;

                    return (
                      <div
                        key={message.id}
                        className={`flex items-start gap-3 mb-4 overflow-hidden ${
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
                              nameClassName="text-sm font-medium truncate max-w-[150px]"
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