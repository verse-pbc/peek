export interface Community {
    id: string;
    relayUrl: string;
    name: string;
    description: string;
    location: LocationPoint;
    createdAt: Date;
    createdBy: string;
    memberCount: number;
    lastActivity: Date;
}
export interface LocationPoint {
    latitude: number;
    longitude: number;
}
export interface LocationProof {
    coordinates: LocationPoint;
    accuracy: number;
    timestamp: Date;
    heading?: number;
    speed?: number;
}
export interface QRPayload {
    version: number;
    communityId: string;
    relayUrl: string;
    location: LocationPoint;
    timestamp: Date;
}
export interface NIP29InviteCode {
    code: string;
    relayUrl: string;
    expiresAt: Date;
    communityId: string;
    createdAt: Date;
}
export interface ValidateLocationRequest {
    communityId: string;
    location: LocationProof;
    qrData: QRPayload;
    userPubkey: string;
}
export interface ValidateLocationResponse {
    success: boolean;
    inviteCode?: NIP29InviteCode;
    error?: string;
    requiresPhotoProof?: boolean;
}
export interface CommunityPreviewRequest {
    communityId: string;
}
export interface CommunityPreviewResponse {
    community: Partial<Community>;
    requiresLocation: boolean;
    distanceFromVenue?: number;
}
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
//# sourceMappingURL=index.d.ts.map