import React, { useState } from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

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
  const [open, setOpen] = useState(false);
  const visibleMembers = members.slice(0, maxVisible);
  const remainingCount = totalCount - maxVisible;

  const getMemberInitials = (pubkey: string) => {
    return pubkey.slice(0, 2).toUpperCase();
  };

  const getMemberColor = (pubkey: string) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-teal-500'
    ];
    const index = parseInt(pubkey.slice(0, 8), 16) % colors.length;
    return colors[index];
  };

  if (members.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center -space-x-2 hover:opacity-80 transition-opacity cursor-pointer">
          {visibleMembers.map((pubkey, index) => (
            <Avatar
              key={pubkey}
              className="h-8 w-8 border-2 border-card"
              style={{ zIndex: visibleMembers.length - index }}
            >
              <AvatarFallback className={`text-xs text-white ${getMemberColor(pubkey)}`}>
                {getMemberInitials(pubkey)}
              </AvatarFallback>
            </Avatar>
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
            Members ({totalCount})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {members.map((pubkey) => (
            <div key={pubkey} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarFallback className={`text-sm text-white ${getMemberColor(pubkey)}`}>
                  {getMemberInitials(pubkey)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono truncate">
                  {pubkey.slice(0, 16)}...{pubkey.slice(-8)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
