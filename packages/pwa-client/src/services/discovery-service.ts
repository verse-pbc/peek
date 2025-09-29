import { SimplePool, Filter, Event } from 'nostr-tools';
import geohash from 'ngeohash';

export interface DiscoveryPoint {
  displayGeohash: string;
  lat: number;
  lng: number;
}

export interface DiscoveryMap {
  points: DiscoveryPoint[];
  updatedAt: number;
}

export class DiscoveryService {
  private pool: SimplePool;
  private relayUrl: string;

  constructor(relayUrl: string) {
    this.pool = new SimplePool();
    this.relayUrl = relayUrl;
  }

  async fetchDiscoveryMap(): Promise<DiscoveryMap> {
    const filter: Filter = {
      kinds: [30078],
      "#d": ["peek.discovery-map"],
      limit: 1
    };

    const events = await this.pool.querySync([this.relayUrl], filter);

    if (events.length === 0) {
      return { points: [], updatedAt: Date.now() };
    }

    const latestEvent = events[0];
    const points = this.parseDiscoveryEvent(latestEvent);

    return {
      points,
      updatedAt: latestEvent.created_at * 1000
    };
  }

  private parseDiscoveryEvent(event: Event): DiscoveryPoint[] {
    try {
      const content = JSON.parse(event.content);

      if (!content.geohashes || !Array.isArray(content.geohashes)) {
        return [];
      }

      return content.geohashes.map((geohashStr: string) => {
        const decoded = geohash.decode(geohashStr);
        return {
          displayGeohash: geohashStr,
          lat: decoded.latitude,
          lng: decoded.longitude
        };
      }).filter(point =>
        point.lat >= -90 && point.lat <= 90 &&
        point.lng >= -180 && point.lng <= 180
      );
    } catch (error) {
      console.error('Failed to parse discovery event:', error);
      return [];
    }
  }

  subscribeToDiscoveryUpdates(callback: (map: DiscoveryMap) => void): () => void {
    const filter: Filter = {
      kinds: [30078],
      "#d": ["peek.discovery-map"],
      since: Math.floor(Date.now() / 1000)
    };

    const sub = this.pool.subscribeMany(
      [this.relayUrl],
      [filter],
      {
        onevent: (event) => {
          const points = this.parseDiscoveryEvent(event);
          callback({
            points,
            updatedAt: event.created_at * 1000
          });
        }
      }
    );

    // Return unsubscribe function
    return () => {
      sub.close();
    };
  }

  async close() {
    await this.pool.close([this.relayUrl]);
  }
}