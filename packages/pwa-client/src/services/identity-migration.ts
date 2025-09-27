import {
  Event,
  EventTemplate,
  finalizeEvent,
  getPublicKey,
  verifyEvent
} from 'nostr-tools';
import { RelayManager } from './relay-manager';

const MIGRATION_KIND = 1776;
const MAX_MIGRATION_DEPTH = 10;
const MIGRATION_CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface MigrationEvent extends Event {
  kind: 1776;
}

interface MigrationCache {
  [pubkey: string]: {
    resolvedTo: string;
    timestamp: number;
  };
}

export class IdentityMigrationService {
  private relayManager: RelayManager;
  private resolutionCache: MigrationCache = {};
  private migrationEvents: Map<string, MigrationEvent> = new Map();

  constructor(relayManager: RelayManager) {
    this.relayManager = relayManager;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Listen for migration events
    this.relayManager.onEvent(`kind:${MIGRATION_KIND}`, (event: Event) => {
      if (event.kind === MIGRATION_KIND) {
        this.handleMigrationEvent(event as MigrationEvent);
      }
    });
  }

  private handleMigrationEvent(event: MigrationEvent) {
    // Verify outer event signature
    try {
      if (!verifyEvent(event)) {
        console.error('Invalid migration event signature');
        return;
      }
    } catch {
      console.error('Invalid migration event signature');
      return;
    }

    const oldPubkey = event.pubkey;

    // Parse proof event
    let proofEvent: Event;
    try {
      proofEvent = JSON.parse(event.content);
    } catch (e) {
      console.error('Invalid proof JSON:', e);
      return;
    }

    // Verify proof signature
    try {
      if (!verifyEvent(proofEvent)) {
        console.error('Invalid proof signature');
        return;
      }
    } catch {
      console.error('Invalid proof signature');
      return;
    }

    // Verify proof is kind 1776
    if (proofEvent.kind !== MIGRATION_KIND) {
      console.error('Proof is not a migration event');
      return;
    }

    // Extract new pubkey from proof's ACTUAL signer (verified by signature)
    const newPubkey = proofEvent.pubkey;

    // Verify bidirectional binding: proof points back to old
    const proofPointsToOld = proofEvent.tags
      .some(t => t[0] === 'p' && t[1] === oldPubkey);

    if (!proofPointsToOld) {
      console.error('Proof doesn\'t point back to old pubkey');
      return;
    }

    // Verify consistency: outer p tag matches proof signer
    const claimedNewPubkey = event.tags.find(t => t[0] === 'p')?.[1];
    if (claimedNewPubkey !== newPubkey) {
      console.error(`P tag mismatch: claims ${claimedNewPubkey} but proof signed by ${newPubkey}`);
      return;
    }

    // Valid migration - update state
    const existing = this.migrationEvents.get(oldPubkey);
    if (!existing || event.created_at > existing.created_at ||
        (event.created_at === existing.created_at && event.id < existing.id)) {
      this.migrationEvents.set(oldPubkey, event);

      // Invalidate cache for this pubkey
      delete this.resolutionCache[oldPubkey];

      // Update localStorage migrations
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      migrations[oldPubkey] = newPubkey;
      localStorage.setItem('identity_migrations', JSON.stringify(migrations));

      console.log(`✅ Valid migration stored: ${oldPubkey} -> ${newPubkey}`);
    }
  }

  /**
   * Create a migration event (kind 1776) signed by both old and new identities
   */
  async createMigrationEvent(
    oldSecretKey: Uint8Array,
    newSecretKey: Uint8Array
  ): Promise<Event> {
    const newPubkey = getPublicKey(newSecretKey);
    const oldPubkey = getPublicKey(oldSecretKey);

    // Create proof event signed by new identity
    const proofTemplate: EventTemplate = {
      kind: MIGRATION_KIND,
      content: '',
      tags: [['p', oldPubkey]],
      created_at: Math.floor(Date.now() / 1000)
    };
    const proofEvent = finalizeEvent(proofTemplate, newSecretKey);

    // Create migration event signed by old identity
    const migrationTemplate: EventTemplate = {
      kind: MIGRATION_KIND,
      content: JSON.stringify(proofEvent),
      tags: [['p', newPubkey]],
      created_at: Math.floor(Date.now() / 1000)
    };

    return finalizeEvent(migrationTemplate, oldSecretKey);
  }

  /**
   * Create migration event with NIP-07 extension for new identity
   */
  async createMigrationEventWithExtension(
    oldSecretKey: Uint8Array,
    newPubkey: string
  ): Promise<Event> {
    if (!window.nostr) {
      throw new Error('NIP-07 extension not available');
    }

    const oldPubkey = getPublicKey(oldSecretKey);

    // Create proof event to be signed by extension
    const proofTemplate = {
      kind: MIGRATION_KIND,
      content: '',
      tags: [['p', oldPubkey]],
      created_at: Math.floor(Date.now() / 1000)
    };

    // Sign with extension
    const proofEvent = await window.nostr.signEvent(proofTemplate);

    // Create migration event signed by old identity
    const migrationTemplate: EventTemplate = {
      kind: MIGRATION_KIND,
      content: JSON.stringify(proofEvent),
      tags: [['p', newPubkey]],
      created_at: Math.floor(Date.now() / 1000)
    };

    return finalizeEvent(migrationTemplate, oldSecretKey);
  }

  /**
   * Publish a migration event to the relay
   */
  async publishMigrationEvent(event: Event): Promise<void> {
    await this.relayManager.publishEvent(event);

    // Store locally immediately
    this.handleMigrationEvent(event as MigrationEvent);
  }

  /**
   * Resolve a pubkey through its migration chain
   */
  resolveIdentity(pubkey: string): string {
    // Check cache first
    const cached = this.resolutionCache[pubkey];
    if (cached && Date.now() - cached.timestamp < MIGRATION_CACHE_TTL) {
      return cached.resolvedTo;
    }

    // Resolve through migration chain
    const visited = new Set<string>();
    let current = pubkey;
    let depth = 0;

    while (depth < MAX_MIGRATION_DEPTH) {
      // Check for circular reference
      if (visited.has(current)) {
        // Circular reference detected - return the one with latest migration
        const candidates = Array.from(visited);
        const latestMigration = candidates.reduce((latest, candidate) => {
          const migration = this.migrationEvents.get(candidate);
          const latestMig = this.migrationEvents.get(latest);

          if (!migration) return latest;
          if (!latestMig) return candidate;

          if (migration.created_at > latestMig.created_at) return candidate;
          if (migration.created_at === latestMig.created_at && migration.id < latestMig.id) {
            return candidate;
          }
          return latest;
        }, candidates[0]);

        current = this.migrationEvents.get(latestMigration)?.tags.find(t => t[0] === 'p')?.[1] || latestMigration;
        break;
      }

      visited.add(current);

      // Check for migration from localStorage (includes relay-received migrations)
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      const nextPubkey = migrations[current];

      if (!nextPubkey) {
        break; // No more migrations
      }

      current = nextPubkey;
      depth++;
    }

    // Cache the result
    this.resolutionCache[pubkey] = {
      resolvedTo: current,
      timestamp: Date.now()
    };

    return current;
  }

  /**
   * Get the full migration history for a pubkey
   */
  getMigrationHistory(pubkey: string): string[] {
    const history: string[] = [pubkey];
    const visited = new Set<string>();
    let current = pubkey;

    const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');

    while (migrations[current] && !visited.has(current) && history.length < MAX_MIGRATION_DEPTH) {
      visited.add(current);
      current = migrations[current];
      history.push(current);
    }

    return history;
  }

  /**
   * Check if a pubkey has migrated to another identity
   */
  hasMigrated(pubkey: string): boolean {
    const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
    return !!migrations[pubkey];
  }

  /**
   * Subscribe to migration events from the relay
   */
  async subscribeMigrations(): Promise<void> {
    // Migration events are subscribed automatically when GroupManager listens to kind:1776
    // No need to explicitly subscribe here since setupEventHandlers() handles it
  }
}