import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GroupManager } from './group-manager';
import { RelayManager } from './relay-manager';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

vi.mock('./relay-manager');

describe('GroupManager', () => {
  let manager: GroupManager;
  let mockRelayManager: RelayManager;
  let secretKey: Uint8Array;
  let pubkey: string;

  beforeEach(() => {
    mockRelayManager = {
      onEvent: vi.fn(),
      getUserPubkey: vi.fn(),
      sendCreateGroup: vi.fn(),
      sendJoinRequest: vi.fn(),
      sendLeaveRequest: vi.fn(),
      publishEvent: vi.fn(),
      subscribeToGroup: vi.fn(),
      unsubscribeFromGroup: vi.fn(),
      getRecentEventIds: vi.fn().mockReturnValue([])
    } as unknown as RelayManager;

    (RelayManager as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockRelayManager);
    manager = new GroupManager(mockRelayManager);

    secretKey = generateSecretKey();
    pubkey = getPublicKey(secretKey);
    (mockRelayManager.getUserPubkey as ReturnType<typeof vi.fn>).mockReturnValue(pubkey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Group Creation', () => {
    it('should create a new group', async () => {
      const mockEvent = {
        id: 'event-id',
        created_at: Math.floor(Date.now() / 1000),
        kind: 9007
      };

      (mockRelayManager.sendCreateGroup as ReturnType<typeof vi.fn>).mockResolvedValue(mockEvent);

      const result = await manager.createGroup(secretKey, {
        id: 'test-group',
        name: 'Test Group',
        about: 'A test group',
        isPublic: true,
        isOpen: false
      });

      expect(mockRelayManager.sendCreateGroup).toHaveBeenCalledWith(
        'test-group',
        secretKey
      );
      expect(mockRelayManager.subscribeToGroup).toHaveBeenCalledWith('test-group');
      expect(result).toBe(mockEvent);

      const metadata = manager.getGroupMetadata('test-group');
      expect(metadata).toEqual({
        id: 'test-group',
        name: 'Test Group',
        about: 'A test group',
        picture: undefined,
        isPublic: true,
        isOpen: false
      });

      expect(manager.isGroupAdmin('test-group')).toBe(true);
    });
  });

  describe('Group Membership', () => {
    it('should join a group', async () => {
      const mockEvent = {
        id: 'join-event',
        kind: 9021
      };

      (mockRelayManager.sendJoinRequest as ReturnType<typeof vi.fn>).mockResolvedValue(mockEvent);

      const result = await manager.joinGroup('test-group', secretKey, {
        reason: 'I want to join',
        inviteCode: 'abc123'
      });

      expect(mockRelayManager.sendJoinRequest).toHaveBeenCalledWith(
        'test-group',
        secretKey,
        'I want to join',
        'abc123'
      );
      expect(mockRelayManager.subscribeToGroup).toHaveBeenCalledWith('test-group');
      expect(result).toBe(mockEvent);
    });

    it('should leave a group', async () => {
      const mockEvent = {
        id: 'leave-event',
        kind: 9022
      };

      (mockRelayManager.sendLeaveRequest as ReturnType<typeof vi.fn>).mockResolvedValue(mockEvent);

      const result = await manager.leaveGroup(
        'test-group',
        secretKey,
        'Goodbye'
      );

      expect(mockRelayManager.sendLeaveRequest).toHaveBeenCalledWith(
        'test-group',
        secretKey,
        'Goodbye'
      );
      expect(mockRelayManager.unsubscribeFromGroup).toHaveBeenCalledWith('test-group');
      expect(result).toBe(mockEvent);
    });

    it('should check membership status', () => {
      expect(manager.isGroupMember('test-group', pubkey)).toBe(false);
      expect(manager.isGroupAdmin('test-group', pubkey)).toBe(false);
      expect(manager.getMyMembership('test-group')).toBe('none');
    });
  });

  describe('Event Handling', () => {
    let handlers: Record<string, (event: unknown) => void>;

    beforeEach(() => {
      handlers = {};
      (mockRelayManager.onEvent as ReturnType<typeof vi.fn>).mockImplementation((pattern: string, handler: (event: unknown) => void) => {
        handlers[pattern] = handler;
        return () => {};
      });

      manager = new GroupManager(mockRelayManager);
    });

    it('should handle metadata events', () => {
      const metadataEvent = {
        kind: 39000,
        tags: [
          ['d', 'test-group'],
          ['name', 'Test Group'],
          ['about', 'A test group'],
          ['picture', 'https://example.com/pic.jpg'],
          ['public'],
          ['open']
        ]
      };

      handlers['kind:39000'](metadataEvent);

      const metadata = manager.getGroupMetadata('test-group');
      expect(metadata).toEqual({
        id: 'test-group',
        name: 'Test Group',
        about: 'A test group',
        picture: 'https://example.com/pic.jpg',
        isPublic: true,
        isOpen: true
      });
    });

    it('should handle admin events', () => {
      const adminEvent = {
        kind: 39001,
        tags: [
          ['d', 'test-group'],
          ['p', 'admin1', 'ceo'],
          ['p', 'admin2', 'moderator', 'treasurer']
        ]
      };

      handlers['kind:39001'](adminEvent);

      const admins = manager.getGroupAdmins('test-group');
      expect(admins).toHaveLength(2);
      expect(admins).toContainEqual({
        pubkey: 'admin1',
        roles: ['ceo']
      });
      expect(admins).toContainEqual({
        pubkey: 'admin2',
        roles: ['moderator', 'treasurer']
      });
    });

    it('should handle member events', () => {
      const memberEvent = {
        kind: 39002,
        tags: [
          ['d', 'test-group'],
          ['p', 'member1'],
          ['p', 'member2'],
          ['p', 'member3']
        ]
      };

      handlers['kind:39002'](memberEvent);

      const members = manager.getGroupMembers('test-group');
      expect(members).toHaveLength(3);
      expect(members.map(m => m.pubkey)).toContain('member1');
      expect(members.map(m => m.pubkey)).toContain('member2');
      expect(members.map(m => m.pubkey)).toContain('member3');
    });

    it('should handle role events', () => {
      const roleEvent = {
        kind: 39003,
        tags: [
          ['d', 'test-group'],
          ['role', 'admin', 'Full administrator access'],
          ['role', 'moderator', 'Can delete messages']
        ]
      };

      handlers['kind:39003'](roleEvent);

      const roles = manager.getGroupRoles('test-group');
      expect(roles).toHaveLength(2);
      expect(roles).toContainEqual({
        name: 'admin',
        description: 'Full administrator access'
      });
      expect(roles).toContainEqual({
        name: 'moderator',
        description: 'Can delete messages'
      });
    });

    it('should handle user added events', () => {
      const addEvent = {
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['h', 'test-group'],
          ['p', 'newuser', 'member']
        ]
      };

      handlers['kind:9000'](addEvent);

      const members = manager.getGroupMembers('test-group');
      const newMember = members.find(m => m.pubkey === 'newuser');
      expect(newMember).toBeDefined();
      expect(newMember?.roles).toEqual(['member']);
      expect(newMember?.joinedAt).toBe(addEvent.created_at);
    });

    it('should handle user removed events', () => {
      handlers['kind:9000']({
        kind: 9000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['h', 'test-group'],
          ['p', 'testuser']
        ]
      });

      expect(manager.isGroupMember('test-group', 'testuser')).toBe(true);

      handlers['kind:9001']({
        kind: 9001,
        tags: [
          ['h', 'test-group'],
          ['p', 'testuser']
        ]
      });

      expect(manager.isGroupMember('test-group', 'testuser')).toBe(false);
    });
  });

  describe('Moderation Actions', () => {
    it('should add a user with roles', async () => {
      (mockRelayManager.publishEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await manager.addUser(
        'test-group',
        'newuser',
        secretKey,
        ['moderator']
      );

      expect(mockRelayManager.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 9000,
          tags: expect.arrayContaining([
            ['h', 'test-group'],
            ['p', 'newuser', 'moderator']
          ])
        })
      );
    });

    it('should remove a user', async () => {
      (mockRelayManager.publishEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await manager.removeUser(
        'test-group',
        'baduser',
        secretKey,
        'Spam'
      );

      expect(mockRelayManager.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 9001,
          content: 'Spam',
          tags: expect.arrayContaining([
            ['h', 'test-group'],
            ['p', 'baduser']
          ])
        })
      );
    });

    it('should update group metadata', async () => {
      (mockRelayManager.publishEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await manager.updateMetadata(
        'test-group',
        secretKey,
        {
          name: 'New Name',
          about: 'New description',
          isPublic: false
        }
      );

      expect(mockRelayManager.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 9002,
          tags: expect.arrayContaining([
            ['h', 'test-group'],
            ['name', 'New Name'],
            ['about', 'New description'],
            ['private']
          ])
        })
      );
    });

    it('should delete an event', async () => {
      (mockRelayManager.publishEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await manager.deleteEvent(
        'test-group',
        'bad-event-id',
        secretKey,
        'Inappropriate content'
      );

      expect(mockRelayManager.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 9005,
          content: 'Inappropriate content',
          tags: expect.arrayContaining([
            ['h', 'test-group'],
            ['e', 'bad-event-id']
          ])
        })
      );
    });

    it('should create an invite', async () => {
      (mockRelayManager.publishEvent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await manager.createInvite('test-group', secretKey);

      expect(mockRelayManager.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 9009,
          tags: expect.arrayContaining([
            ['h', 'test-group']
          ])
        })
      );
      expect(result.code).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('Cache Management', () => {
    it('should get all groups', () => {
      const metadataEvent = {
        kind: 39000,
        tags: [
          ['d', 'group1'],
          ['name', 'Group 1'],
          ['public']
        ]
      };

      const handlers: Record<string, (event: unknown) => void> = {};
      (mockRelayManager.onEvent as ReturnType<typeof vi.fn>).mockImplementation((pattern: string, handler: (event: unknown) => void) => {
        handlers[pattern] = handler;
        return () => {};
      });

      manager = new GroupManager(mockRelayManager);
      handlers['kind:39000'](metadataEvent);

      handlers['kind:39000']({
        kind: 39000,
        tags: [
          ['d', 'group2'],
          ['name', 'Group 2'],
          ['private']
        ]
      });

      const allGroups = manager.getAllGroups();
      expect(allGroups.size).toBe(2);
      expect(allGroups.has('group1')).toBe(true);
      expect(allGroups.has('group2')).toBe(true);
    });

    it('should clear cache', () => {
      const handlers: Record<string, (event: unknown) => void> = {};
      (mockRelayManager.onEvent as ReturnType<typeof vi.fn>).mockImplementation((pattern: string, handler: (event: unknown) => void) => {
        handlers[pattern] = handler;
        return () => {};
      });

      manager = new GroupManager(mockRelayManager);

      handlers['kind:39000']({
        kind: 39000,
        tags: [
          ['d', 'test-group'],
          ['name', 'Test Group']
        ]
      });

      expect(manager.getGroupMetadata('test-group')).toBeDefined();

      manager.clearCache('test-group');
      expect(manager.getGroupMetadata('test-group')).toBeUndefined();
    });

    it('should refresh a group', () => {
      manager.refreshGroup('test-group');
      expect(mockRelayManager.subscribeToGroup).toHaveBeenCalledWith('test-group');
    });
  });
});