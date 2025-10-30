import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { UserProfile } from './UserProfile';

interface MemberAvatarStackProps {
  members: string[];
  totalCount: number;
  maxVisible?: number;
}

export const MemberAvatarStack: React.FC<MemberAvatarStackProps> = ({
  members,
  totalCount,
  maxVisible = 5
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const visibleMembers = members.slice(0, maxVisible);
  const remainingCount = totalCount - maxVisible;

  if (members.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center -space-x-2 hover:opacity-80 transition-opacity cursor-pointer">
          {visibleMembers.map((pubkey, index) => (
            <div
              key={pubkey}
              className="h-8 w-8 border-2 border-card rounded-full overflow-hidden"
              style={{ zIndex: visibleMembers.length - index }}
            >
              <UserProfile
                pubkey={pubkey}
                size="sm"
                showName={false}
              />
            </div>
          ))}
          {remainingCount > 0 && (
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted border-2 border-card text-xs font-medium">
              +{remainingCount}
            </div>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('common.labels.members')} ({totalCount})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {members.map((pubkey) => (
            <div key={pubkey} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
              <UserProfile
                pubkey={pubkey}
                size="md"
                showName={true}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
