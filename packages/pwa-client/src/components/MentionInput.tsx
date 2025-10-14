import { useMemo, useState, useEffect } from 'react';
import { MentionsInput, Mention } from 'react-mentions';
import { nip19 } from 'nostr-tools';
import { useRelayManager } from '@/contexts/RelayContext';
import { useBatchProfiles } from '@/contexts/ProfileContext';
import { useIdentityResolution } from '@/hooks/useIdentityResolution';
import { genUserName } from '@/lib/genUserName';
import { getDiceBearDataUrl } from '@/lib/dicebear';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  groupId: string;
}

export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  groupId,
}: MentionInputProps) {
  const { groupManager, relayManager } = useRelayManager();
  const { resolveIdentity } = useIdentityResolution(groupId);
  const [membersVersion, setMembersVersion] = useState(0);

  useEffect(() => {
    if (!relayManager || !groupId) return;

    const unsubscribe = relayManager.onEvent('kind-39002', (event) => {
      const eventGroupId = event.tags.find(t => t[0] === 'd')?.[1];
      if (eventGroupId === groupId) {
        console.log('[MentionInput] GROUP_MEMBERS event received, refreshing member list');
        setMembersVersion(v => v + 1);
      }
    });

    return unsubscribe;
  }, [relayManager, groupId]);

  const members = useMemo(() => {
    if (!groupManager) {
      console.log('[MentionInput] No groupManager');
      return [];
    }
    const m = groupManager.getResolvedGroupMembers(groupId);
    console.log('[MentionInput] Got members from groupManager:', m.length, 'for group:', groupId);
    return m;
  }, [groupManager, groupId, membersVersion]);

  const memberPubkeys = useMemo(() => members.map(m => m.pubkey), [members]);
  const { data: profilesData, isLoading: profilesLoading } = useBatchProfiles(memberPubkeys);

  const mentionData = useMemo(() => {
    if (!profilesData || profilesLoading) {
      console.log('[MentionInput] Profiles still loading or undefined');
      return [];
    }

    console.log('[MentionInput] Building mention data with loaded profiles, count:', Object.keys(profilesData).length);

    return members.map(member => {
      const resolvedPubkey = resolveIdentity(member.pubkey);
      const npub = nip19.npubEncode(resolvedPubkey);
      const profile = profilesData[resolvedPubkey];
      const hasProfile = !!(profile?.display_name || profile?.name);
      const displayName = profile?.display_name || profile?.name || genUserName(resolvedPubkey);

      console.log('[MentionInput] Member:', resolvedPubkey.slice(0, 8), 'profile:', profile ? 'found' : 'not found', 'name:', displayName);

      return {
        id: npub,
        display: displayName,
        pubkey: resolvedPubkey,
        hasProfile,
      };
    });
  }, [members, profilesData, resolveIdentity, profilesLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  console.log('[MentionInput] Members:', members.length, 'Mention data:', mentionData.length);

  return (
    <div className="flex-1 relative">
      <style>{`
        .mention-suggestions-wrapper {
          background-color: transparent !important;
          border-radius: 8px !important;
        }
        .mention-suggestions-wrapper::before {
          content: '';
          position: absolute;
          inset: 0;
          background: transparent;
          border-radius: 8px;
        }
        div[style*="z-index: 1"] {
          background-color: transparent !important;
          border-radius: 8px !important;
        }
      `}</style>
      <MentionsInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        singleLine
        forceSuggestionsAboveCursor
        a11ySuggestionsListLabel="Suggested mentions"
        customSuggestionsContainer={(children) => (
          <div className="mention-suggestions-wrapper" style={{ borderRadius: '8px', overflow: 'hidden', backgroundColor: 'transparent' }}>
            {children}
          </div>
        )}
        style={{
          control: {
            fontSize: 16,
            fontFamily: 'inherit',
            width: '100%',
          },
          '&singleLine': {
            control: {
              display: 'inline-block',
              width: '100%',
            },
            highlighter: {
              padding: '8px 12px',
              border: '1px solid transparent',
            },
            input: {
              padding: '8px 12px',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'calc(var(--radius) - 2px)',
              backgroundColor: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
              outline: 'none',
              fontSize: 16,
            },
          },
          suggestions: {
            list: {
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: 16,
              maxHeight: 200,
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            },
            item: {
              padding: '8px 12px',
              color: 'hsl(var(--foreground))',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              '&focused': {
                backgroundColor: 'hsl(var(--accent))',
              },
            },
          },
        }}
      >
        <Mention
          trigger="@"
          data={mentionData}
          markup="nostr:__id__"
          displayTransform={(id, _display) => `@${id}`}
          appendSpaceOnAdd
          renderSuggestion={(suggestion, _search, highlightedDisplay) => {
            const pubkey = (suggestion as { pubkey?: string }).pubkey;

            return (
              <div className="flex items-center gap-2">
                <div className="font-medium flex-1">{highlightedDisplay}</div>
                {pubkey && (
                  <img
                    src={getDiceBearDataUrl(pubkey, 32)}
                    alt=""
                    className="w-6 h-6 rounded-full flex-shrink-0"
                  />
                )}
              </div>
            );
          }}
          style={{
            backgroundColor: 'hsl(var(--accent) / 0.2)',
            borderRadius: '4px',
            padding: '0 2px',
          }}
        />
      </MentionsInput>
    </div>
  );
}
