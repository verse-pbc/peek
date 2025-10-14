import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { UserProfile } from './UserProfile';
import { Crown } from 'lucide-react';
import { useRelayManager } from '@/contexts/RelayContext';
import { cn } from '@/lib/utils';

interface MembersListModalProps {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMemberClick: (pubkey: string) => void;
}

export function MembersListModal({ groupId, open, onOpenChange, onMemberClick }: MembersListModalProps) {
  const { groupManager } = useRelayManager();

  if (!groupManager) return null;

  const members = groupManager.getResolvedGroupMembers(groupId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Members ({members.length})</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {members.map((member) => {
            const isAdmin = groupManager.isGroupAdmin(groupId, member.pubkey);

            return (
              <div
                key={member.pubkey}
                className="relative group cursor-pointer"
                onClick={() => {
                  onMemberClick(member.pubkey);
                  onOpenChange(false);
                }}
              >
                <div className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="relative">
                    <UserProfile
                      pubkey={member.pubkey}
                      size="lg"
                      showName={false}
                      groupId={groupId}
                    />
                    {isAdmin && (
                      <div className="absolute -top-1 -right-1 bg-mint rounded-full p-1">
                        <Crown className="h-3 w-3 text-white" fill="white" />
                      </div>
                    )}
                  </div>
                  <UserProfile
                    pubkey={member.pubkey}
                    size="sm"
                    showAvatar={false}
                    showName={true}
                    className="text-center"
                    nameClassName={cn(
                      "text-xs truncate max-w-full block",
                      isAdmin && "font-semibold"
                    )}
                    groupId={groupId}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
