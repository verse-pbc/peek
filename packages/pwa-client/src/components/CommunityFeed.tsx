import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, Users } from 'lucide-react';
import { useNostrContext } from '@nostr-dev-kit/ndk-react';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

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
  const { ndk, user } = useNostrContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to NIP-29 group messages (kind 9)
  useEffect(() => {
    if (!ndk) return;

    const fetchGroupMessages = async () => {
      setLoading(true);

      // Subscribe to kind 9 messages with h-tag for this group
      const filter = {
        kinds: [9 as NDKKind],
        '#h': [groupId],
        limit: 50
      };

      const subscription = ndk.subscribe(filter, { closeOnEose: false });

      subscription.on('event', async (event: NDKEvent) => {
        // Extract message data
        const message: Message = {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          created_at: event.created_at || Date.now() / 1000
        };

        // Try to fetch author metadata
        try {
          const authorEvent = await ndk.fetchEvent({
            kinds: [0 as NDKKind],
            authors: [event.pubkey]
          });

          if (authorEvent) {
            const metadata = JSON.parse(authorEvent.content);
            message.author = {
              name: metadata.name || metadata.display_name,
              picture: metadata.picture,
              npub: nip19.npubEncode(event.pubkey)
            };
          }
        } catch (error) {
          console.error('Error fetching author metadata:', error);
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

      setLoading(false);

      // Fetch group members (kind 9000 events)
      const memberFilter = {
        kinds: [9000 as NDKKind],
        '#h': [groupId],
        limit: 100
      };

      const memberSub = ndk.subscribe(memberFilter, { closeOnEose: true });

      memberSub.on('event', (event: NDKEvent) => {
        // Extract p-tag for member pubkey
        const pTag = event.tags.find(tag => tag[0] === 'p');
        if (pTag && pTag[1]) {
          setMembers(prev => new Set([...prev, pTag[1]]));
        }
      });

      return () => {
        subscription.stop();
        memberSub.stop();
      };
    };

    fetchGroupMessages();
  }, [ndk, groupId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!ndk || !user || !newMessage.trim()) return;

    setSending(true);
    try {
      // Create NIP-29 group message (kind 9)
      const event = new NDKEvent(ndk);
      event.kind = 9 as NDKKind;
      event.content = newMessage.trim();
      event.tags = [
        ['h', groupId]
      ];

      await event.publish();
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
                    const isOwnMessage = user?.pubkey === message.pubkey;

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
                          <div className="flex items-baseline gap-2 mb-1">
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
              disabled={sending || !user}
              className="flex-1"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !user || !newMessage.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>

          {!user && (
            <p className="text-xs text-muted-foreground mt-2">
              Connect your Nostr account to send messages
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}