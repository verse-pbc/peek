import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelayManager, NIP29_KINDS } from './relay-manager';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

describe('RelayManager', () => {
  let manager: RelayManager;

  beforeEach(() => {
    // Create manager without auto-connect for testing
    manager = new RelayManager({
      url: 'wss://peek.hol.is',
      autoConnect: false
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('Connection Management', () => {
    it('should initialize with disconnected state', () => {
      expect(manager.isConnected()).toBe(false);
    });

    it('should notify connection handlers on status change', () => {
      const handler = vi.fn();
      const unsubscribe = manager.onConnectionChange(handler);

      // Should be called immediately with current status
      expect(handler).toHaveBeenCalledWith(false);

      unsubscribe();
    });

    it('should handle user pubkey setting', () => {
      const pubkey = getPublicKey(generateSecretKey());
      manager.setUserPubkey(pubkey);
      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  describe('Group Management', () => {
    it('should track group states', () => {
      const groups = manager.getAllGroups();
      expect(groups).toBeInstanceOf(Map);
      expect(groups.size).toBe(0);
    });

    it('should check membership status', () => {
      const groupId = 'test-group';
      expect(manager.isMemberOf(groupId)).toBe(false);
    });

    it('should check admin status', () => {
      const groupId = 'test-group';
      expect(manager.isAdminOf(groupId)).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should register and unregister event handlers', () => {
      const handler = vi.fn();
      const unsubscribe = manager.onEvent('test-pattern', handler);

      // Handler should be registered
      unsubscribe();
      // No error should be thrown
      expect(true).toBe(true);
    });

    it('should handle multiple handlers for same pattern', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsub1 = manager.onEvent('test-pattern', handler1);
      const unsub2 = manager.onEvent('test-pattern', handler2);

      unsub1();
      unsub2();
      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  describe('Message Construction', () => {
    it('should validate join request parameters', async () => {
      const groupId = 'test-group';
      const secretKey = generateSecretKey();

      // Should throw when not connected
      await expect(
        manager.sendJoinRequest(groupId, secretKey)
      ).rejects.toThrow('Not connected to relay');
    });

    it('should validate leave request parameters', async () => {
      const groupId = 'test-group';
      const secretKey = generateSecretKey();

      // Should throw when not connected
      await expect(
        manager.sendLeaveRequest(groupId, secretKey)
      ).rejects.toThrow('Not connected to relay');
    });

    it('should validate message parameters', async () => {
      const groupId = 'test-group';
      const secretKey = generateSecretKey();
      const content = 'Hello, group!';

      // Should throw when not connected
      await expect(
        manager.sendMessage(groupId, content, secretKey)
      ).rejects.toThrow('Not connected to relay');
    });
  });

  describe('NIP-29 Constants', () => {
    it('should export correct event kinds', () => {
      expect(NIP29_KINDS.JOIN_REQUEST).toBe(9021);
      expect(NIP29_KINDS.LEAVE_REQUEST).toBe(9022);
      expect(NIP29_KINDS.PUT_USER).toBe(9000);
      expect(NIP29_KINDS.REMOVE_USER).toBe(9001);
      expect(NIP29_KINDS.GROUP_METADATA).toBe(39000);
      expect(NIP29_KINDS.GROUP_ADMINS).toBe(39001);
      expect(NIP29_KINDS.GROUP_MEMBERS).toBe(39002);
    });
  });

  describe('Subscription Management', () => {
    it('should handle group subscription when disconnected', () => {
      const groupId = 'test-group';

      // Should not throw but log warning
      const consoleSpy = vi.spyOn(console, 'warn');
      manager.subscribeToGroup(groupId);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[RelayManager] Cannot subscribe: not connected'
      );

      consoleSpy.mockRestore();
    });

    it('should handle group unsubscription', () => {
      const groupId = 'test-group';

      // Should not throw even when no subscription exists
      manager.unsubscribeFromGroup(groupId);
      expect(true).toBe(true);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on dispose', () => {
      const handler = vi.fn();
      manager.onConnectionChange(handler);
      manager.onEvent('test', vi.fn());

      manager.dispose();

      // Should clear all handlers and states
      const groups = manager.getAllGroups();
      expect(groups.size).toBe(0);
    });
  });
});