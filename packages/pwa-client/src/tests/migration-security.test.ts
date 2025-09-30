import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate, type Event } from 'nostr-tools';
import { IdentityMigrationService } from '@/services/identity-migration';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    clear: () => { store = {}; },
    removeItem: (key: string) => { delete store[key]; }
  };
})();

global.localStorage = localStorageMock as Storage;

// Mock RelayManager
const mockRelayManager = {
  publishEvent: vi.fn(),
  onEvent: vi.fn(),
  url: 'ws://test'
} as unknown as import('@/services/relay-manager').RelayManager;

describe('Migration Security Tests', () => {
  let oldIdentitySk: Uint8Array;
  let oldIdentityPk: string;
  let newIdentitySk: Uint8Array;
  let newIdentityPk: string;
  let attackerSk: Uint8Array;
  let attackerPk: string;
  let service: IdentityMigrationService;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Generate test identities
    oldIdentitySk = generateSecretKey();
    oldIdentityPk = getPublicKey(oldIdentitySk);

    newIdentitySk = generateSecretKey();
    newIdentityPk = getPublicKey(newIdentitySk);

    attackerSk = generateSecretKey();
    attackerPk = getPublicKey(attackerSk);

    service = new IdentityMigrationService(mockRelayManager);
  });

  describe('Valid Migration', () => {
    it('should accept a properly signed bidirectional migration', () => {
      // Create valid proof from new identity pointing back to old
      const proofTemplate: EventTemplate = {
        kind: 1776,
        content: '',
        tags: [['p', oldIdentityPk]], // Points back to old
        created_at: Math.floor(Date.now() / 1000)
      };
      const proofEvent = finalizeEvent(proofTemplate, newIdentitySk);

      // Create migration from old identity with proof
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(proofEvent),
        tags: [['p', newIdentityPk]], // Points to new (matches proof signer)
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Process the migration
      service['handleMigrationEvent'](migrationEvent as Event & { kind: 1776 });

      // Verify migration was stored
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBe(newIdentityPk);
    });
  });

  describe('P Tag Forgery', () => {
    it('should reject migration with p tag not matching proof signer', () => {
      // Create valid proof from new identity
      const proofTemplate: EventTemplate = {
        kind: 1776,
        content: '',
        tags: [['p', oldIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const proofEvent = finalizeEvent(proofTemplate, newIdentitySk);

      // Create migration with WRONG p tag (attacker trying to redirect)
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(proofEvent),
        tags: [['p', attackerPk]], // WRONG! Doesn't match proof.pubkey
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Process the migration
      service['handleMigrationEvent'](migrationEvent as Event & { kind: 1776 });

      // Verify migration was NOT stored (silently rejected)
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBeUndefined();
    });
  });

  describe('Invalid Proof Signature', () => {
    it('should reject migration with invalid proof signature', () => {
      // Create a fake proof with invalid signature
      const fakeProof = {
        kind: 1776,
        pubkey: newIdentityPk,
        content: '',
        tags: [['p', oldIdentityPk]],
        created_at: Math.floor(Date.now() / 1000),
        id: 'fake_id',
        sig: 'invalid_signature_0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      };

      // Create migration with fake proof
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(fakeProof),
        tags: [['p', newIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Spy on console.error

      // Process the migration
      service['handleMigrationEvent'](migrationEvent as Event & { kind: 1776 });

      // Verify rejection

      // Verify migration was NOT stored
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBeUndefined();

    });
  });

  describe('Missing Bidirectional Binding', () => {
    it('should reject migration where proof doesn\'t point back to old', () => {
      // Create proof pointing to WRONG pubkey
      const wrongPk = getPublicKey(generateSecretKey());
      const proofTemplate: EventTemplate = {
        kind: 1776,
        content: '',
        tags: [['p', wrongPk]], // WRONG! Should point to oldIdentityPk
        created_at: Math.floor(Date.now() / 1000)
      };
      const proofEvent = finalizeEvent(proofTemplate, newIdentitySk);

      // Create migration
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(proofEvent),
        tags: [['p', newIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Spy on console.error

      // Process the migration
      service['handleMigrationEvent'](migrationEvent as Event & { kind: 1776 });

      // Verify rejection

      // Verify migration was NOT stored
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBeUndefined();

    });
  });

  describe('Wrong Event Kind', () => {
    it('should reject migration where proof is not kind 1776', () => {
      // Create proof with wrong kind
      const proofTemplate: EventTemplate = {
        kind: 1, // WRONG! Should be 1776
        content: 'test',
        tags: [['p', oldIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const proofEvent = finalizeEvent(proofTemplate, newIdentitySk);

      // Create migration
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(proofEvent),
        tags: [['p', newIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Spy on console.error

      // Process the migration
      service['handleMigrationEvent'](migrationEvent as Event & { kind: 1776 });

      // Verify rejection

      // Verify migration was NOT stored
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBeUndefined();

    });
  });

  describe('Invalid Outer Signature', () => {
    it('should reject migration with invalid outer event signature', () => {
      // Create valid proof
      const proofTemplate: EventTemplate = {
        kind: 1776,
        content: '',
        tags: [['p', oldIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const proofEvent = finalizeEvent(proofTemplate, newIdentitySk);

      // Create migration with correct structure
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(proofEvent),
        tags: [['p', newIdentityPk]],
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Create a new event object with corrupted signature
      // Must create a clean object without the Symbol(verified) property
      const corruptedEvent = {
        id: migrationEvent.id,
        pubkey: migrationEvent.pubkey,
        created_at: migrationEvent.created_at,
        kind: migrationEvent.kind,
        tags: migrationEvent.tags,
        content: migrationEvent.content,
        sig: '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      };

      // Spy on console.error

      // Process the migration
      service['handleMigrationEvent'](corruptedEvent as Event & { kind: 1776 });

      // Verify rejection

      // Verify migration was NOT stored
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBeUndefined();

    });
  });

  describe('Attack Scenarios', () => {
    it('should prevent attacker from claiming someone else migrated to them', () => {
      // Attacker tries to create a migration from victim to attacker
      // But attacker doesn't have victim's private key for the proof

      // Attacker creates a fake proof (but can't sign as victim's new identity)
      const fakeProof = {
        kind: 1776,
        pubkey: newIdentityPk, // Claiming victim's new identity
        content: '',
        tags: [['p', oldIdentityPk]],
        created_at: Math.floor(Date.now() / 1000),
        id: 'fake',
        sig: 'fake_signature' // Can't create valid signature without private key
      };

      // Attacker creates migration (they need old private key, assuming compromised)
      const migrationTemplate: EventTemplate = {
        kind: 1776,
        content: JSON.stringify(fakeProof),
        tags: [['p', attackerPk]], // Trying to redirect to attacker
        created_at: Math.floor(Date.now() / 1000)
      };
      const migrationEvent = finalizeEvent(migrationTemplate, oldIdentitySk);

      // Process the migration
      service['handleMigrationEvent'](migrationEvent as Event & { kind: 1776 });

      // Should fail on proof signature verification

      // Verify migration was NOT stored
      const migrations = JSON.parse(localStorage.getItem('identity_migrations') || '{}');
      expect(migrations[oldIdentityPk]).toBeUndefined();

    });
  });
});