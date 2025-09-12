// Core domain types shared between PWA and validation service

export interface Community {
  id: string;                    // UUID
  relayUrl: string;              // wss://peek.hol.is
  name: string;
  description: string;
  location: LocationPoint;
  createdAt: Date;
  createdBy: string;            // npub of first scanner (admin)
  memberCount: number;
  lastActivity: Date;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface LocationProof {
  coordinates: LocationPoint;
  accuracy: number;             // meters
  timestamp: Date;
  heading?: number;             // degrees
  speed?: number;               // m/s
}

export interface QRPayload {
  version: number;              // QR format version
  communityId: string;          // UUID
  relayUrl: string;             // wss://peek.hol.is
  location: LocationPoint;      // venue coordinates
  timestamp: Date;              // QR generation time
}

export interface NIP29InviteCode {
  code: string;                 // Short invite code
  relayUrl: string;
  expiresAt: Date;             // 5 minutes from creation
  communityId: string;
  createdAt: Date;
}

// API Request/Response types

export interface ValidateLocationRequest {
  communityId: string;
  location: LocationProof;
  qrData: QRPayload;
  userPubkey: string;          // npub
}

export interface ValidateLocationResponse {
  success: boolean;
  inviteCode?: NIP29InviteCode;
  error?: string;
  requiresPhotoProof?: boolean; // Future enhancement
}

export interface CommunityPreviewRequest {
  communityId: string;
}

export interface CommunityPreviewResponse {
  community: Partial<Community>;
  requiresLocation: boolean;
  distanceFromVenue?: number;   // meters
}

// NIP-29 Event Types (for reference)
export interface NIP29GroupMetadata {
  name: string;
  about?: string;
  picture?: string;
  pinned?: string[];
}

export interface NIP29JoinRequest {
  kind: 9021;
  content: string;
  tags: string[][];
}