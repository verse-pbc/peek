import React from 'react';
import { nip19 } from 'nostr-tools';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import { useProfile, useNip05Verification } from '@/contexts/ProfileContext';
import { cn } from '@/lib/utils';

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
  compact = false
}: UserProfileProps) {
  const { data: profile, isLoading } = useProfile(pubkey);
  const { data: nip05Verified } = useNip05Verification(profile?.nip05, pubkey);

  // Compute display values
  const displayName = profile?.display_name || profile?.name || `${nip19.npubEncode(pubkey).slice(0, 8)}...`;
  const initials = (profile?.display_name || profile?.name || 'U')[0].toUpperCase();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {showAvatar && <Skeleton className={cn("rounded-full", sizeMap[size])} />}
        {showName && <Skeleton className="h-4 w-24" />}
      </div>
    );
  }

  const avatarContent = (
    <Avatar
      className={cn(sizeMap[size], onClick && "cursor-pointer hover:opacity-80 transition-opacity")}
      onClick={onClick}
    >
      {profile?.picture && (
        <AvatarImage
          src={profile.picture}
          alt={displayName}
          loading="lazy"
        />
      )}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
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
      "flex items-center gap-2",
      compact ? "space-x-1" : "space-x-2",
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