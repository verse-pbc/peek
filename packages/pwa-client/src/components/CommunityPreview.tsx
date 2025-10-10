import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { MemberAvatarStack } from './MemberAvatarStack';
import {
  MapPin,
  Users,
  Calendar,
  Shield,
  Loader2,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface CommunityMetadata {
  name: string;
  description: string;
  member_count: number;
  members?: string[];
  picture?: string;
  created_at: number;
  location_name?: string;
  admin_count?: number;
  is_first_scan?: boolean;
}

interface CommunityPreviewProps {
  communityId: string;
  previewData?: CommunityMetadata;
  onJoin?: () => void;
  isJoining?: boolean;
  error?: string;
  isFirstScanner?: boolean;
}

export const CommunityPreview: React.FC<CommunityPreviewProps> = ({
  communityId: _communityId,
  previewData,
  onJoin,
  isJoining = false,
  error,
  isFirstScanner = false
}) => {
  const [isLoading, setIsLoading] = useState(!previewData);

  useEffect(() => {
    if (previewData) {
      setIsLoading(false);
    }
  }, [previewData]);

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <Skeleton className="h-8 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Error Loading Community
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={onJoin} 
            variant="outline"
            className="w-full"
          >
            Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Community not found or no data
  if (!previewData) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Community Not Found</CardTitle>
          <CardDescription>
            This QR code doesn't correspond to an active community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              The community may have been removed or the QR code may be invalid.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatMemberCount = (count: number) => {
    if (count === 0) return 'Be the first member!';
    if (count === 1) return '1 member';
    return `${count} members`;
  };

  return (
    <Card className="w-full max-w-2xl mx-auto overflow-hidden">
      {/* Hero Image */}
      {previewData.picture && (
        <div className="relative h-48 w-full overflow-hidden">
          <img
            src={previewData.picture}
            alt={previewData.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
        </div>
      )}

      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-2xl">
              {previewData.name}
            </CardTitle>
            <CardDescription className="mt-2">
              {previewData.description}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isFirstScanner && (
              <Badge variant="default" className="ml-4">
                <Shield className="h-3 w-3 mr-1" />
                You'll be admin
              </Badge>
            )}
            {previewData.members && previewData.members.length > 0 && (
              <MemberAvatarStack
                members={previewData.members}
                totalCount={previewData.member_count}
              />
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Location info */}
        {previewData.location_name && (
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{previewData.location_name}</span>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Members</span>
            </div>
            <p className="text-2xl font-bold">
              {previewData.member_count}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatMemberCount(previewData.member_count)}
            </p>
          </div>

          <div className="border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-xs font-medium uppercase">Created</span>
            </div>
            <p className="text-base font-semibold">
              {formatDate(previewData.created_at)}
            </p>
            {previewData.admin_count && (
              <p className="text-xs text-muted-foreground mt-1">
                {previewData.admin_count} admin{previewData.admin_count !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* First scanner notice */}
        {isFirstScanner && (
          <Alert className="border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20">
            <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <AlertDescription className="text-purple-900 dark:text-purple-100">
              <strong>You're the first person to scan this QR code!</strong><br />
              You'll automatically become the community admin and can manage members,
              settings, and moderation.
            </AlertDescription>
          </Alert>
        )}

        {/* Regular member notice */}
        {!isFirstScanner && previewData.member_count > 0 && (
          <Alert>
            <AlertDescription>
              By joining, you'll be able to participate in discussions with other
              members who are physically at this location.
            </AlertDescription>
          </Alert>
        )}

        {/* Value Props */}
        <div className="bg-muted rounded-xl p-4">
          <h3 className="font-rubik font-semibold mb-3">What's special about Peek?</h3>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 text-mint flex-shrink-0" />
              <span><strong>Physical trust</strong> - Everyone here has visited this place</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 text-mint flex-shrink-0" />
              <span><strong>Keep access forever</strong> - No need to return to stay connected</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 text-mint flex-shrink-0" />
              <span><strong>Private & secure</strong> - Location verified once, never tracked</span>
            </li>
          </ul>
        </div>
      </CardContent>

      <CardFooter>
        <Button 
          onClick={onJoin}
          disabled={isJoining}
          className="w-full"
          size="lg"
        >
          {isJoining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining Community...
            </>
          ) : isFirstScanner ? (
            <>
              <Shield className="mr-2 h-4 w-4" />
              Create & Join as Admin
            </>
          ) : (
            <>
              <Users className="mr-2 h-4 w-4" />
              Join Community
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};