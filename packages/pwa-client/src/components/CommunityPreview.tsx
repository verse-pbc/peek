import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  MapPin,
  Shield,
  Loader2,
  AlertCircle
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

  return (
    <Card className="w-full max-w-2xl mx-auto overflow-hidden bg-transparent border-0 shadow-none rounded-none">
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

      <CardHeader className="p-0">
        {/* Description */}
        <p className="text-black leading-tight mb-6" style={{ fontSize: '1.4rem', fontWeight: 500 }}>
          Create a chat community that only those who scan this QR code can join!
        </p>

        {/* Admin benefits - only show for first scanner */}
        {isFirstScanner && (
          <div style={{ marginBottom: '2rem' }}>
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif" }}>
                As the admin, you will:
              </h3>

              <div className="space-y-3">
                {/* Benefit 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-black" />
                  </div>
                  <p className="text-base font-bold text-black pt-2">
                    Own this spot with permanent admin rights
                  </p>
                </div>

                {/* Benefit 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
                      <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
                    </svg>
                  </div>
                  <p className="text-base font-bold text-black pt-2">
                    Shape the culture and vibe of your community
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-6 px-0">
        {/* Location info */}
        {previewData.location_name && (
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{previewData.location_name}</span>
          </div>
        )}

        {/* How will people join */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif" }}>
            How will people join?
          </h2>

          <div className="flex items-center justify-center gap-2">
            {/* Step 1: Scan QR */}
            <div className="flex flex-col items-center text-center">
              <img src="/icon_scan-qr.svg" alt="Scan QR" className="w-24 h-24 mb-4" />
              <h3 className="font-bold text-black mb-1">Scan this QR</h3>
            </div>

            {/* Arrow 1 */}
            <div className="text-4xl font-bold text-black mb-8">→</div>

            {/* Step 2: Verify Location */}
            <div className="flex flex-col items-center text-center">
              <img src="/icon_share-location.svg" alt="Verify Location" className="w-24 h-24 mb-4" />
              <h3 className="font-bold text-black mb-1">Verify location</h3>
            </div>

            {/* Arrow 2 */}
            <div className="text-4xl font-bold text-black mb-8">→</div>

            {/* Step 3: They're in */}
            <div className="flex flex-col items-center text-center">
              <img src="/icon_social-dance.svg" alt="They're in" className="w-24 h-24 mb-4" />
              <h3 className="font-bold text-black mb-1">They're in!</h3>
            </div>
          </div>
        </div>

        {/* How Peek Communities Work */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif" }}>
            How does this work?
          </h2>

          <div className="space-y-6">
            {/* Physical presence required */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-black" />
                </div>
                <h3 className="text-lg font-bold text-black pt-2">Physical presence required</h3>
              </div>
              <p className="text-base text-black pl-13">
                Only those who actually visit here can join
              </p>
            </div>

            {/* Lasts forever */}
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-coral flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v.878A2.25 2.25 0 0110.75 16h-1.5A2.25 2.25 0 017 13.878V13a2 2 0 00-2-2v-.861z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-black pt-2">Lasts forever</h3>
              </div>
              <p className="text-base text-black pl-13">
                Once they join, members stay in the community
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      <Button
        onClick={onJoin}
        disabled={isJoining}
        className="w-full text-black rounded-none"
        size="lg"
        style={{ fontFamily: "'Integral CF', sans-serif", borderRadius: 0, fontSize: '1.2rem' }}
      >
        {isJoining ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Joining Community...
          </>
        ) : isFirstScanner ? (
          'Create & Join as Admin'
        ) : (
          'Join Community'
        )}
      </Button>
    </Card>
  );
};