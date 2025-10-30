import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { UserProfile } from './UserProfile';
import { useRelayManager } from '@/contexts/RelayContext';

interface MembersListModalProps {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMemberClick: (pubkey: string) => void;
}

export function MembersListModal({ groupId, open, onOpenChange, onMemberClick }: MembersListModalProps) {
  const { t } = useTranslation();
  const { groupManager } = useRelayManager();

  if (!groupManager) return null;

  const members = groupManager.getResolvedGroupMembers(groupId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('common.labels.members')} ({members.length})</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {members.map((member) => (
            <div
              key={member.pubkey}
              className="relative group cursor-pointer"
              onClick={() => {
                onMemberClick(member.pubkey);
                onOpenChange(false);
              }}
            >
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                <UserProfile
                  pubkey={member.pubkey}
                  size="lg"
                  showName={false}
                  groupId={groupId}
                />
                <UserProfile
                  pubkey={member.pubkey}
                  size="sm"
                  showAvatar={false}
                  showName={true}
                  className="text-center"
                  nameClassName="text-xs truncate max-w-full block"
                  groupId={groupId}
                />
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
