import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Crown } from 'lucide-react';
import { useProfile, useNip05Verification } from '@/contexts/ProfileContext';
import { useIdentityResolution } from '@/hooks/useIdentityResolution';
import { useRelayManager } from '@/contexts/RelayContext';
import { cn } from '@/lib/utils';
import { genUserName } from '@/lib/genUserName';
import { getDiceBearDataUrl } from '@/lib/dicebear';

interface UserProfileProps {
  pubkey: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  showAvatar?: boolean;
  showNip05?: boolean;
  showAbout?: boolean;
  onClick?: () => void;
  className?: string;
  nameClassName?: string;
  compact?: boolean;
  groupId?: string; // Optional group context for resolution
}

const sizeMap = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12'
};

const textSizeMap = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg'
};

export function UserProfile({
  pubkey,
  size = 'md',
  showName = true,
  showAvatar = true,
  showNip05 = false,
  showAbout = false,
  onClick,
  className,
  nameClassName,
  compact = false,
  groupId
}: UserProfileProps) {
  // Use centralized identity resolution
  const { resolveIdentity } = useIdentityResolution(groupId);
  const resolvedPubkey = resolveIdentity(pubkey);
  const { groupManager } = useRelayManager();

  const { data: profile, isLoading } = useProfile(resolvedPubkey);
  const { data: nip05Verified } = useNip05Verification(profile?.nip05, resolvedPubkey);

  // Check if user is admin in this group
  const isAdmin = groupId && groupManager ? groupManager.isGroupAdmin(groupId, resolvedPubkey) : false;

  // Compute display values
  const displayName = profile?.display_name || profile?.name || genUserName(resolvedPubkey);
  const initials = (profile?.display_name || profile?.name || genUserName(resolvedPubkey))[0].toUpperCase();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {showAvatar && <Skeleton className={cn("rounded-full", sizeMap[size])} />}
        {showName && <Skeleton className="h-4 w-24" />}
      </div>
    );
  }

  const hasNostrProfile = !!profile?.picture || !!profile?.display_name || !!profile?.name;
  const dicebearUrl = !hasNostrProfile ? getDiceBearDataUrl(resolvedPubkey, 128) : null;

  const avatarContent = (
    <div className="relative inline-flex">
      <Avatar
        className={cn(sizeMap[size], onClick && "cursor-pointer hover:opacity-80 transition-opacity")}
        onClick={onClick}
        style={{ overflow: 'visible' }}
      >
        {profile?.picture ? (
          <AvatarImage
            src={profile.picture}
            alt={displayName}
            loading="lazy"
          />
        ) : dicebearUrl ? (
          <AvatarImage
            src={dicebearUrl}
            alt={displayName}
          />
        ) : (
          <AvatarFallback>{initials}</AvatarFallback>
        )}
      </Avatar>
      {isAdmin && showAvatar && (
        <div className="absolute -top-0.5 -right-0.5 bg-[#FF6B35] rounded-full p-0.5">
          <Crown className="lucide-crown h-2.5 w-2.5 text-white" />
        </div>
      )}
    </div>
  );

  if (!showName && !showNip05 && !showAbout && showAvatar) {
    return avatarContent;
  }

  // If we're only showing name/nip05/about without avatar
  if (!showAvatar && (showName || showNip05 || showAbout)) {
    return (
      <div className={cn("min-w-0", className)}>
        {showName && (
          <span className={cn(
            "font-medium truncate",
            textSizeMap[size],
            nameClassName
          )}>
            {displayName}
          </span>
        )}

        {showNip05 && profile?.nip05 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground truncate">
              {profile.nip05}
            </span>
            {nip05Verified && (
              <CheckCircle2 className="h-3 w-3 text-blue-500 flex-shrink-0" />
            )}
          </div>
        )}

        {showAbout && profile?.about && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {profile.about}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center",
      compact ? "gap-1" : "gap-2",
      className
    )}>
      {showAvatar && avatarContent}

      {(showName || showNip05 || showAbout) && (
        <div className="flex flex-col min-w-0">
          {showName && (
            <span className={cn(
              "font-medium truncate",
              textSizeMap[size],
              nameClassName
            )}>
              {displayName}
            </span>
          )}

          {showNip05 && profile?.nip05 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground truncate">
                {profile.nip05}
              </span>
              {nip05Verified && (
                <CheckCircle2 className="h-3 w-3 text-blue-500 flex-shrink-0" />
              )}
            </div>
          )}

          {showAbout && profile?.about && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {profile.about}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Optimized avatar-only component
export function UserAvatar({
  pubkey,
  size = 'md',
  className,
  onClick
}: {
  pubkey: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}) {
  return (
    <UserProfile
      pubkey={pubkey}
      size={size}
      showName={false}
      className={className}
      onClick={onClick}
    />
  );
}