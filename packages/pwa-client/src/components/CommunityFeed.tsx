import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, Users } from 'lucide-react';
import { RelayManager, NIP29_KINDS } from '@/services/relay-manager';
import { useNostrLogin } from '@/lib/nostrify-shim';
import { nip19, Event, SimplePool, Filter, finalizeEvent } from 'nostr-tools';
import { hexToBytes } from '@/lib/hex';

interface Message {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  author?: {
    name?: string;
    picture?: string;
    npub: string;
  };
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
  const [relayManager, setRelayManager] = useState<RelayManager | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const metadataPoolRef = useRef<SimplePool | null>(null);

  // Initialize relay manager
  useEffect(() => {
    const relayUrl = import.meta.env.VITE_RELAY_URL || 'ws://localhost:8090';
    const manager = new RelayManager({
      url: relayUrl,
      autoConnect: true
    });

    if (identity?.publicKey) {
      manager.setUserPubkey(identity.publicKey);

      // Set up NIP-42 authentication handler
      const secretKey = hexToBytes(identity.secretKey);
      manager.setAuthHandler(async (challenge) => {
        return finalizeEvent(challenge, secretKey);
      });
    }

    setRelayManager(manager);

    // Initialize metadata pool for fetching profiles
    metadataPoolRef.current = new SimplePool();

    return () => {
      manager.dispose();
      metadataPoolRef.current = null;
    };
  }, [identity]);

  // Subscribe to connection status
  useEffect(() => {
    if (!relayManager) return;

    const unsubscribe = relayManager.onConnectionChange(isConnected => {
      setConnected(isConnected);
      if (isConnected) {
        console.log('[CommunityFeed] Connected to relay');
      }
    });

    return unsubscribe;
  }, [relayManager]);

  // Subscribe to group messages
  useEffect(() => {
    if (!relayManager || !connected) return;

    setLoading(true);
    const authorMetadataCache = new Map<string, { name?: string; picture?: string; npub: string }>();

    // Subscribe to this group
    relayManager.subscribeToGroup(groupId);

    // Listen for chat messages
    const unsubscribeMessages = relayManager.onEvent(`kind-${NIP29_KINDS.CHAT_MESSAGE}`, async (event: Event) => {
      // Check if message is for this group
      const hTag = event.tags.find(t => t[0] === 'h');
      if (hTag?.[1] !== groupId) return;

      const message: Message = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at
      };

      // Fetch author metadata if not cached
      if (!authorMetadataCache.has(event.pubkey) && metadataPoolRef.current) {
        try {
          const metadataRelays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];
          const metadataFilter: Filter = {
            kinds: [0],
            authors: [event.pubkey],
            limit: 1
          };

          const metadataEvents = await metadataPoolRef.current.querySync(metadataRelays, metadataFilter);
          const metadataEvent = metadataEvents[0];

          if (metadataEvent) {
            const metadata = JSON.parse(metadataEvent.content);
            const author = {
              name: metadata.name || metadata.display_name,
              picture: metadata.picture,
              npub: nip19.npubEncode(event.pubkey)
            };
            authorMetadataCache.set(event.pubkey, author);
            message.author = author;
          }
        } catch (error) {
          console.error('Error fetching author metadata:', error);
        }
      } else if (authorMetadataCache.has(event.pubkey)) {
        message.author = authorMetadataCache.get(event.pubkey);
      }

      setMessages(prev => {
        const exists = prev.find(m => m.id === message.id);
        if (!exists) {
          const updated = [...prev, message].sort((a, b) => a.created_at - b.created_at);
          return updated.slice(-100); // Keep last 100 messages
        }
        return prev;
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
  }, [relayManager, connected, groupId]);

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
      const secretKey = hexToBytes(identity.secretKey);
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
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3">
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

      <CardContent className="flex-1 p-0 flex flex-col">
        <ScrollArea ref={scrollRef} className="flex-1 px-4">
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
                    const isOwnMessage = identity?.publicKey === message.pubkey;

                    return (
                      <div
                        key={message.id}
                        className={`flex items-start gap-3 mb-4 ${
                          isOwnMessage ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <Avatar
                          className="h-8 w-8 cursor-pointer"
                          onClick={() => onMemberClick?.(message.pubkey)}
                        >
                          {message.author?.picture && (
                            <AvatarImage src={message.author.picture} />
                          )}
                          <AvatarFallback>
                            {message.author?.name?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>

                        <div className={`flex-1 ${isOwnMessage ? 'text-right' : ''}`}>
                          <div className={`flex items-baseline gap-2 mb-1 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                            <span className="text-sm font-medium">
                              {message.author?.name || message.author?.npub?.slice(0, 8) || 'Anonymous'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(message.created_at)}
                            </span>
                          </div>

                          <div className={`inline-block rounded-lg px-3 py-2 ${
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

        <div className="p-4 border-t">
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