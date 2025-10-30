import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  MapPin,
  Shield,
  Loader2,
  AlertCircle,
  ScanLine,
  MessageSquare,
  Users,
  Calendar
} from 'lucide-react';
import { getDiceBearDataUrl } from '@/lib/dicebear';

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
  const { t } = useTranslation();
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
            {t('community_preview.error_title')}
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
            {t('community_preview.try_again')}
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
          <CardTitle>{t('community_preview.not_found_title')}</CardTitle>
          <CardDescription>
            {t('community_preview.not_found_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              {t('community_preview.invalid_qr')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full mx-auto bg-transparent border-0 shadow-none rounded-none">
      {/* Hero Image */}
      {previewData.picture && (
        <div className="relative w-full overflow-hidden border-[3px] border-solid border-black" style={{ aspectRatio: '16/9', borderRadius: 0, marginBottom: '1rem' }}>
          <img
            src={previewData.picture}
            alt={previewData.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
        </div>
      )}

      <CardHeader className="p-0">
        {/* Member avatars - only show for join flow */}
        {!isFirstScanner && previewData.members && previewData.members.length > 0 && (
          <div className="flex -space-x-2 mb-4">
            {previewData.members.slice(0, 5).map((memberPubkey, index) => (
              <img
                key={memberPubkey}
                src={getDiceBearDataUrl(memberPubkey, 40)}
                alt="Member avatar"
                className="w-10 h-10 rounded-full border-[3px] border-black bg-white"
                style={{ zIndex: 5 - index }}
              />
            ))}
            {previewData.members.length > 5 && (
              <div className="w-10 h-10 rounded-full border-[3px] border-black bg-black flex items-center justify-center text-white text-xs font-bold" style={{ zIndex: 0 }}>
                +{previewData.members.length - 5}
              </div>
            )}
          </div>
        )}

        {/* Community Description - only show for join flow (not first scanner) */}
        {!isFirstScanner && previewData.description && (
          <div style={{ marginBottom: '1rem' }}>
            <h2 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif", marginBottom: '0.5rem' }}>
              {t('community_preview.community_description')}
            </h2>
            <p className="text-black leading-tight" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
              {previewData.description}
            </p>
          </div>
        )}

        {/* Stats grid - only show for join flow */}
        {!isFirstScanner && (
          <div style={{ marginBottom: '1rem' }}>
            <h2 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif", marginBottom: '0.5rem' }}>
              {t('community_preview.about', { name: previewData.name })}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Members count */}
              <div className="flex items-start gap-3 bg-transparent">
                <Users className="h-5 w-5 text-black mt-1" />
                <div>
                  <div className="text-sm text-black uppercase tracking-wider font-bold">{t('common.labels.members')}</div>
                  <div className="text-lg font-bold text-black">{previewData.member_count}</div>
                </div>
              </div>

              {/* Created date */}
              <div className="flex items-start gap-3 bg-transparent">
                <Calendar className="h-5 w-5 text-black mt-1" />
                <div>
                  <div className="text-sm text-black uppercase tracking-wider font-bold">{t('common.labels.created')}</div>
                  <div className="text-lg font-bold text-black">
                    {new Date(previewData.created_at * 1000).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create description - only show for first scanner */}
        {isFirstScanner && (
          <p className="text-black leading-tight" style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: '1rem' }}>
            {t('join_flow.preview.create_prompt')}
          </p>
        )}

        {/* How will people join - only show for first scanner */}
        {isFirstScanner && (
          <div className="space-y-6" style={{ marginBottom: '1rem' }}>
            <h2 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif" }}>
              {t('join_flow.preview.how_to_join')}
            </h2>

            <div className="flex items-center justify-between gap-2">
              {/* Step 1: Scan QR */}
              <div className="flex flex-col items-center text-center">
                <ScanLine className="mb-4 text-black" strokeWidth={2.5} style={{ width: '2.5rem', height: '2.5rem', transform: 'rotate(-3deg)' }} />
                <h3 className="font-bold text-black mb-1" style={{ fontFamily: "'Integral CF', sans-serif", fontSize: '0.9rem', lineHeight: '1.2' }}>{t('join_flow.preview.step_scan')}</h3>
              </div>

              {/* Arrow 1 */}
              <div className="text-4xl font-bold text-black mb-8">→</div>

              {/* Step 2: Verify Location */}
              <div className="flex flex-col items-center text-center">
                <MapPin className="mb-4 text-black" strokeWidth={2.5} style={{ width: '2.5rem', height: '2.5rem', transform: 'rotate(-3deg)' }} />
                <h3 className="font-bold text-black mb-1" style={{ fontFamily: "'Integral CF', sans-serif", fontSize: '0.9rem', lineHeight: '1.2' }}>{t('join_flow.preview.step_verify')}</h3>
              </div>

              {/* Arrow 2 */}
              <div className="text-4xl font-bold text-black mb-8">→</div>

              {/* Step 3: Join chat */}
              <div className="flex flex-col items-center text-center">
                <MessageSquare className="mb-4 text-black" strokeWidth={2.5} style={{ width: '2.5rem', height: '2.5rem', transform: 'rotate(-3deg)' }} />
                <h3 className="font-bold text-black mb-1" style={{ fontFamily: "'Integral CF', sans-serif", fontSize: '0.9rem', lineHeight: '1.2' }}>{t('join_flow.preview.step_join')}</h3>
              </div>
            </div>
          </div>
        )}

        {/* Admin benefits - only show for first scanner */}
        {isFirstScanner && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-black uppercase" style={{ fontFamily: "'Integral CF', sans-serif" }}>
              {t('join_flow.preview.admin_benefits')}
            </h3>

            <div className="space-y-3">
              {/* Benefit 1 */}
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center flex-shrink-0">
                  <Shield className="text-black" strokeWidth={2.5} style={{ width: '2rem', height: '2rem' }} />
                </div>
                <p className="text-base text-black" style={{ fontWeight: 500 }}>
                  {t('join_flow.preview.admin_perm')}
                </p>
              </div>

              {/* Benefit 2 */}
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center flex-shrink-0">
                  <svg className="text-black" fill="currentColor" viewBox="0 0 20 20" style={{ width: '2rem', height: '2rem' }}>
                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"></path>
                    <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"></path>
                  </svg>
                </div>
                <p className="text-base text-black" style={{ fontWeight: 500 }}>
                  {t('join_flow.preview.admin_culture')}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 px-0" style={{ paddingBottom: '2rem' }}>
        {/* Location info */}
        {previewData.location_name && (
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{previewData.location_name}</span>
          </div>
        )}
      </CardContent>

      <>
        <Button
          onClick={onJoin}
          disabled={isJoining}
          className="w-full text-black rounded-none cta-button"
          size="lg"
          style={{ fontFamily: "'Integral CF', sans-serif", borderRadius: 0, fontSize: '1.35rem', boxShadow: '5px 5px 0 0 black', transform: 'rotate(-3deg) scale(1.15)' }}
        >
          {isJoining ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('join_flow.preview.button_joining')}
            </>
          ) : isFirstScanner ? (
            t('join_flow.preview.button_create')
          ) : (
            t('join_flow.preview.button_join')
          )}
        </Button>
        <style>{`
          @media (min-width: 640px) {
            .cta-button {
              font-size: 1.7rem !important;
            }
          }
        `}</style>
      </>
    </Card>
  );
};