import { NCache, NIP05, NSchema as n } from '@nostrify/nostrify';
import { SimplePool, type Event, type Filter } from 'nostr-tools';

export interface ProfileData {
  pubkey: string;
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  banner?: string;
  nip05?: string;
  nip05_verified?: boolean;
  lud06?: string;
  lud16?: string;
  fetchedAt: number;
  lastSeenAt: number;
}

export class ProfileService {
  private static instance: ProfileService;
  private cache: NCache;
  private pool: SimplePool;
  private pendingRequests: Map<string, Promise<ProfileData | null>>;
  private nip05Cache: Map<string, { verified: boolean; timestamp: number }>;

  // Metadata-only relays (separate from Peek relay)
  private readonly METADATA_RELAYS = [
    'wss://purplepag.es',
    'wss://relay.nos.social',
    'wss://relay.damus.io',
    'wss://nos.lol'
  ];

  private constructor() {
    // NCache with 500 profiles max, 1 hour TTL
    this.cache = new NCache({
      max: 500,
      ttl: 1000 * 60 * 60, // 1 hour
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    this.pool = new SimplePool();
    this.pendingRequests = new Map();
    this.nip05Cache = new Map();
  }

  static getInstance(): ProfileService {
    if (!ProfileService.instance) {
      ProfileService.instance = new ProfileService();
    }
    return ProfileService.instance;
  }

  async getProfile(pubkey: string): Promise<ProfileData | null> {
    // 1. Check if request already pending (deduplication)
    if (this.pendingRequests.has(pubkey)) {
      return this.pendingRequests.get(pubkey)!;
    }

    // 2. Check NCache
    const cached = await this.cache.query([
      { kinds: [0], authors: [pubkey], limit: 1 }
    ]);

    if (cached.length > 0) {
      const profile = this.parseProfile(cached[0]);
      profile.lastSeenAt = Date.now();
      return profile;
    }

    // 3. Fetch from relays
    const fetchPromise = this.fetchFromRelays(pubkey);
    this.pendingRequests.set(pubkey, fetchPromise);

    try {
      const profile = await fetchPromise;
      return profile;
    } finally {
      this.pendingRequests.delete(pubkey);
    }
  }

  async getBatchProfiles(pubkeys: string[]): Promise<Map<string, ProfileData | null>> {
    const results = new Map<string, ProfileData | null>();
    const toFetch: string[] = [];

    // 1. Check cache for all
    for (const pubkey of pubkeys) {
      const cached = await this.cache.query([
        { kinds: [0], authors: [pubkey], limit: 1 }
      ]);

      if (cached.length > 0) {
        results.set(pubkey, this.parseProfile(cached[0]));
      } else {
        toFetch.push(pubkey);
      }
    }

    // 2. Batch fetch missing
    if (toFetch.length > 0) {
      const filter: Filter = {
        kinds: [0],
        authors: toFetch,
        limit: toFetch.length
      };

      try {
        const events = await this.pool.querySync(this.METADATA_RELAYS, filter);

        for (const event of events) {
          await this.cache.event(event);
          const profile = this.parseProfile(event);
          results.set(event.pubkey, profile);
        }
      } catch (error) {
        console.error('Failed to batch fetch profiles:', error);
      }

      // Mark not found
      for (const pubkey of toFetch) {
        if (!results.has(pubkey)) {
          results.set(pubkey, null);
        }
      }
    }

    return results;
  }

  private async fetchFromRelays(pubkey: string): Promise<ProfileData | null> {
    try {
      const events = await this.pool.querySync(
        this.METADATA_RELAYS,
        { kinds: [0], authors: [pubkey], limit: 1 }
      );

      if (events.length > 0) {
        const event = events[0];
        await this.cache.event(event); // Cache it
        return this.parseProfile(event);
      }

      return null;
    } catch (error) {
      console.error(`Failed to fetch profile for ${pubkey}:`, error);
      return null;
    }
  }

  private parseProfile(event: Event): ProfileData {
    try {
      const metadata = n.json().pipe(n.metadata()).parse(event.content);
      return {
        pubkey: event.pubkey,
        name: metadata.name,
        display_name: metadata.display_name,
        picture: metadata.picture,
        about: metadata.about,
        banner: metadata.banner,
        nip05: metadata.nip05,
        lud06: metadata.lud06,
        lud16: metadata.lud16,
        fetchedAt: event.created_at * 1000,
        lastSeenAt: Date.now()
      };
    } catch {
      // Fallback for invalid metadata
      return {
        pubkey: event.pubkey,
        fetchedAt: Date.now(),
        lastSeenAt: Date.now()
      };
    }
  }

  async verifyNip05(identifier: string, expectedPubkey: string): Promise<boolean> {
    const cacheKey = `${identifier}:${expectedPubkey}`;
    const cached = this.nip05Cache.get(cacheKey);

    // Cache NIP-05 verifications for 24 hours
    if (cached && Date.now() - cached.timestamp < 86400000) {
      return cached.verified;
    }

    try {
      const result = await NIP05.lookup(identifier);
      const verified = result.pubkey === expectedPubkey;
      this.nip05Cache.set(cacheKey, { verified, timestamp: Date.now() });
      return verified;
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.nip05Cache.clear();
  }

  dispose(): void {
    this.clearCache();
    this.pool = new SimplePool(); // Reset pool
  }
}