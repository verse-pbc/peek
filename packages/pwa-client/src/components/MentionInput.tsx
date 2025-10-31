import { useMemo, useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { useRelayManager } from '@/contexts/RelayContext';
import { useBatchProfiles } from '@/contexts/ProfileContext';
import { useIdentityResolution } from '@/hooks/useIdentityResolution';
import { genUserName } from '@/lib/genUserName';
import { ContentEditableMentionInput } from './ContentEditableMentionInput';

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

  // Reduced verbosity
  // console.log('[MentionInput] Members:', members.length, 'Mention data:', mentionData.length);

  return (
    <ContentEditableMentionInput
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      placeholder={placeholder}
      disabled={disabled}
      mentionData={mentionData}
    />
  );
}
