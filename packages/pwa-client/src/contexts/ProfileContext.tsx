import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { ProfileService, type ProfileData } from '@/services/profile-service';

interface ProfileContextValue {
  service: ProfileService;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const service = useMemo(() => ProfileService.getInstance(), []);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      service.dispose();
    };
  }, [service]);

  return (
    <ProfileContext.Provider value={{ service }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfileService() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfileService must be used within ProfileProvider');
  }
  return context.service;
}

// Single profile hook
export function useProfile(pubkey: string | undefined): UseQueryResult<ProfileData | null> {
  const service = useProfileService();

  return useQuery({
    queryKey: ['profile', pubkey],
    queryFn: () => service.getProfile(pubkey!),
    enabled: !!pubkey,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

// Batch profiles hook
export function useBatchProfiles(pubkeys: string[]) {
  const service = useProfileService();

  return useQuery({
    queryKey: ['profiles', pubkeys.sort().join(',')],
    queryFn: () => service.getBatchProfiles(pubkeys),
    enabled: pubkeys.length > 0,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });
}

// NIP-05 verification hook
export function useNip05Verification(nip05: string | undefined, pubkey: string | undefined) {
  const service = useProfileService();

  return useQuery({
    queryKey: ['nip05', nip05, pubkey],
    queryFn: () => service.verifyNip05(nip05!, pubkey!),
    enabled: !!nip05 && !!pubkey,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}