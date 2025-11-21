/**
 * Role Command Tests
 *
 * Purpose: Test !config role commands for managing user roles and permissions
 * Run: pnpm test src/commands/__tests__/role.test.ts
 *
 * Commands tested:
 * - !config role list (4 tests)
 * - !config role info <phoneNumber> (5 tests)
 * - !config role promote <phoneNumber> <role> (6 tests)
 * - !config role demote <phoneNumber> <role> (5 tests)
 * Total: 20 tests
 */

// Mock dependencies BEFORE importing modules
jest.mock('../../db/repositories/user.repository');
jest.mock('../../services/auditLogger');
jest.mock('../../lib/logger', () => ({
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { RoleModule } from '../role';
import { UserRepository, UserRole } from '../../db/repositories/user.repository';
import { AuditLogger } from '../../services/auditLogger';
import type { User } from '@prisma/client';
import type { Message } from 'whatsapp-web.js';

describe('Role Commands', () => {
  // Test fixtures
  let mockOwner: User;
  let mockAdmin: User;
  let mockOperator: User;
  let mockUser: User;

  // Mock message factory
  function createMockMessage(from: string): Message {
    return {
      from,
      reply: jest.fn().mockResolvedValue(undefined),
    } as any;
  }

  // Mock user factory
  function createMockUser(override?: Partial<User>): User {
    return {
      id: 'user-123',
      phoneNumber: '+1234567890',
      role: UserRole.USER,
      isWhitelisted: true,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
      ...override,
    } as User;
  }

  beforeAll(() => {
    // Create test user fixtures
    mockOwner = {
      id: 'owner-1',
      phoneNumber: '+1111111111',
      role: UserRole.OWNER,
      isWhitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockAdmin = {
      id: 'admin-1',
      phoneNumber: '+2222222222',
      role: UserRole.ADMIN,
      isWhitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockOperator = {
      id: 'operator-1',
      phoneNumber: '+3333333333',
      role: UserRole.OPERATOR,
      isWhitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockUser = {
      id: 'user-1',
      phoneNumber: '+4444444444',
      role: UserRole.USER,
      isWhitelisted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup UserRepository helper methods
    (UserRepository.isAdmin as jest.Mock).mockImplementation((user: User) => {
      return user.role === UserRole.ADMIN || user.role === UserRole.OWNER;
    });

    (UserRepository.isOwner as jest.Mock).mockImplementation((user: User) => {
      return user.role === UserRole.OWNER;
    });
  });

  // ============================================== #
  //      1. !config role list (4 tests)          #
  // ============================================== #

  describe('!config role list', () => {
    const commands = RoleModule.register();
    const listCommand = commands.list;

    it('should list all users grouped by role (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      const mockOwners = [
        createMockUser({ id: 'owner-1', phoneNumber: '+1111111111', role: UserRole.OWNER }),
        createMockUser({ id: 'owner-2', phoneNumber: '+1111111112', role: UserRole.OWNER }),
      ];
      const mockAdmins = [
        createMockUser({ id: 'admin-1', phoneNumber: '+2222222221', role: UserRole.ADMIN }),
        createMockUser({ id: 'admin-2', phoneNumber: '+2222222222', role: UserRole.ADMIN }),
        createMockUser({ id: 'admin-3', phoneNumber: '+2222222223', role: UserRole.ADMIN }),
      ];
      const mockOperators = [
        createMockUser({ id: 'op-1', phoneNumber: '+3333333331', role: UserRole.OPERATOR }),
        createMockUser({ id: 'op-2', phoneNumber: '+3333333332', role: UserRole.OPERATOR }),
      ];
      const mockUsers = Array(15).fill(null).map((_, i) =>
        createMockUser({ id: `user-${i}`, phoneNumber: `+444444444${i}`, role: UserRole.USER })
      );
      const allUsers = [...mockOwners, ...mockAdmins, ...mockOperators, ...mockUsers];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);
      (UserRepository.findAllOwners as jest.Mock).mockResolvedValue(mockOwners);
      (UserRepository.findAllAdmins as jest.Mock).mockResolvedValue(mockAdmins);
      (UserRepository.findAllOperators as jest.Mock).mockResolvedValue(mockOperators);
      (UserRepository.findAll as jest.Mock).mockResolvedValue(allUsers);

      await listCommand.execute(message);

      // Verify permission check
      expect(UserRepository.findByPhoneNumber).toHaveBeenCalledWith(mockAdmin.phoneNumber);
      expect(UserRepository.isAdmin).toHaveBeenCalledWith(mockAdmin);

      // Verify all repository calls made
      expect(UserRepository.findAllOwners).toHaveBeenCalled();
      expect(UserRepository.findAllAdmins).toHaveBeenCalled();
      expect(UserRepository.findAllOperators).toHaveBeenCalled();
      expect(UserRepository.findAll).toHaveBeenCalled();

      // Verify response format
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('👥 *User Roles Summary*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*OWNERS (2):*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*ADMINS (3):*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*OPERATORS (2):*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*USERS (15):*')
      );
      // Should show "...and 5 more" since we only show first 10 users
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('...and 5 more')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*Total Users:* 22')
      );
    });

    it('should list users as OWNER', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);

      const mockOwners = [mockOwner];
      const mockAdmins = [mockAdmin];
      const mockOperators = [mockOperator];
      const mockUsers = [mockUser];
      const allUsers = [mockOwner, mockAdmin, mockOperator, mockUser];

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOwner);
      (UserRepository.findAllOwners as jest.Mock).mockResolvedValue(mockOwners);
      (UserRepository.findAllAdmins as jest.Mock).mockResolvedValue(mockAdmins);
      (UserRepository.findAllOperators as jest.Mock).mockResolvedValue(mockOperators);
      (UserRepository.findAll as jest.Mock).mockResolvedValue(allUsers);

      await listCommand.execute(message);

      // Verify permission check passes for OWNER
      expect(UserRepository.isAdmin).toHaveBeenCalledWith(mockOwner);

      // Verify response
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('👥 *User Roles Summary*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*Total Users:* 4')
      );
    });

    it('should deny permission for OPERATOR', async () => {
      const message = createMockMessage(mockOperator.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOperator);

      await listCommand.execute(message);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockOperator.phoneNumber,
        userRole: mockOperator.role,
        action: 'LIST_USERS',
        reason: 'Requires ADMIN role or higher'
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission to list users")
      );

      // Verify no queries executed
      expect(UserRepository.findAllOwners).not.toHaveBeenCalled();
      expect(UserRepository.findAllAdmins).not.toHaveBeenCalled();
    });

    it('should deny permission for USER', async () => {
      const message = createMockMessage(mockUser.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockUser);

      await listCommand.execute(message);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalled();
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission")
      );
      expect(UserRepository.findAllOwners).not.toHaveBeenCalled();
    });
  });

  // ============================================== #
  //   2. !config role info <phone> (5 tests)     #
  // ============================================== #

  describe('!config role info', () => {
    const commands = RoleModule.register();
    const infoCommand = commands.info;

    it('should show OWNER role information (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetUser = mockOwner;

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)  // First call: requesting user
        .mockResolvedValueOnce(targetUser); // Second call: target user

      await infoCommand.execute(message, targetUser.phoneNumber);

      // Verify queries
      expect(UserRepository.findByPhoneNumber).toHaveBeenCalledWith(mockAdmin.phoneNumber);
      expect(UserRepository.findByPhoneNumber).toHaveBeenCalledWith(targetUser.phoneNumber);

      // Verify response format
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('👤 *User Information*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining(`📞 Phone: ${targetUser.phoneNumber}`)
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎭 Role: OWNER')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Whitelisted: Yes')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('*Permissions:*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Full system access')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Manage all roles')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• View and export audit logs')
      );
    });

    it('should show ADMIN role information (OWNER)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const targetUser = mockAdmin;

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockOwner)
        .mockResolvedValueOnce(targetUser);

      await infoCommand.execute(message, targetUser.phoneNumber);

      // Verify response shows ADMIN permissions
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎭 Role: ADMIN')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Manage OPERATOR and USER roles')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• View audit logs (read-only)')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Configure all bot settings')
      );
    });

    it('should show OPERATOR role information (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetUser = mockOperator;

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(targetUser);

      await infoCommand.execute(message, targetUser.phoneNumber);

      // Verify response shows OPERATOR permissions
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎭 Role: OPERATOR')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• View personal usage statistics')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Limited config access')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('• Handle customer inquiries')
      );
    });

    it('should deny permission for non-ADMIN', async () => {
      const message = createMockMessage(mockOperator.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockOperator);

      await infoCommand.execute(message, '+1234567890');

      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockOperator.phoneNumber,
        userRole: mockOperator.role,
        action: 'VIEW_USER_INFO',
        reason: 'Requires ADMIN role or higher'
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ You don't have permission to view user info")
      );

      // Should not query for target user
      expect(UserRepository.findByPhoneNumber).toHaveBeenCalledTimes(1);
    });

    it('should handle missing phone number parameter', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      // Test with empty string
      await infoCommand.execute(message, '');
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a phone number')
      );

      jest.clearAllMocks();
      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      // Test with undefined
      await infoCommand.execute(message, undefined);
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a phone number')
      );
    });
  });

  // ============================================== #
  //  3. !config role promote <phone> <role>      #
  //     (6 tests)                                 #
  // ============================================== #

  describe('!config role promote', () => {
    const commands = RoleModule.register();
    const promoteCommand = commands.promote;

    it('should promote USER to OPERATOR (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetUser = mockUser;
      const promotedUser = { ...targetUser, role: UserRole.OPERATOR };

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(targetUser);
      (UserRepository.promoteToOperator as jest.Mock).mockResolvedValue(promotedUser);

      await promoteCommand.execute(message, `${targetUser.phoneNumber} OPERATOR`);

      // Verify permission check
      expect(UserRepository.isAdmin).toHaveBeenCalledWith(mockAdmin);

      // Verify promotion
      expect(UserRepository.promoteToOperator).toHaveBeenCalledWith(
        targetUser.id,
        mockAdmin
      );

      // Verify response
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ *Role Change Successful*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining(`👤 User: ${targetUser.phoneNumber}`)
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('📊 USER → OPERATOR')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining(`✏️ Changed by: ${mockAdmin.phoneNumber}`)
      );
    });

    it('should promote USER to ADMIN (OWNER only)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const targetUser = mockUser;
      const promotedUser = { ...targetUser, role: UserRole.ADMIN };

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockOwner)
        .mockResolvedValueOnce(targetUser);
      (UserRepository.promoteToAdmin as jest.Mock).mockResolvedValue(promotedUser);

      await promoteCommand.execute(message, `${targetUser.phoneNumber} ADMIN`);

      // Verify promotion to ADMIN
      expect(UserRepository.promoteToAdmin).toHaveBeenCalledWith(
        targetUser.id,
        mockOwner
      );

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('USER → ADMIN')
      );
    });

    it('should deny ADMIN promoting to ADMIN', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetUser = mockUser;

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(targetUser);

      await promoteCommand.execute(message, `${targetUser.phoneNumber} ADMIN`);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockAdmin.phoneNumber,
        userRole: mockAdmin.role,
        action: 'PROMOTE_TO_ADMIN',
        reason: 'Only OWNER can promote to ADMIN role'
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Only OWNER can promote users to ADMIN role')
      );

      // Verify no promotion executed
      expect(UserRepository.promoteToAdmin).not.toHaveBeenCalled();
    });

    it('should deny ADMIN promoting to OWNER', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetUser = mockUser;

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(targetUser);

      await promoteCommand.execute(message, `${targetUser.phoneNumber} OWNER`);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockAdmin.phoneNumber,
        userRole: mockAdmin.role,
        action: 'PROMOTE_TO_OWNER',
        reason: 'Only OWNER can promote to OWNER role'
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Only OWNER can promote users to OWNER role')
      );

      expect(UserRepository.promoteToOwner).not.toHaveBeenCalled();
    });

    it('should create user if doesn\'t exist', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const newPhone = '+9999999999';
      const createdUser = createMockUser({ id: 'new-user', phoneNumber: newPhone, role: UserRole.USER });
      const promotedUser = { ...createdUser, role: UserRole.OPERATOR };

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(null); // User doesn't exist
      (UserRepository.create as jest.Mock).mockResolvedValue(createdUser);
      (UserRepository.promoteToOperator as jest.Mock).mockResolvedValue(promotedUser);

      await promoteCommand.execute(message, `${newPhone} OPERATOR`);

      // Verify user creation
      expect(UserRepository.create).toHaveBeenCalledWith({
        phoneNumber: newPhone,
        role: UserRole.USER,
        isWhitelisted: true
      });

      // Verify promotion after creation
      expect(UserRepository.promoteToOperator).toHaveBeenCalledWith(
        createdUser.id,
        mockAdmin
      );

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ *Role Change Successful*')
      );
    });

    it('should handle invalid role', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock).mockResolvedValue(mockAdmin);

      await promoteCommand.execute(message, '+1234567890 INVALID_ROLE');

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('Invalid role')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('OWNER, ADMIN, OPERATOR, USER')
      );

      // No promotion attempted
      expect(UserRepository.promoteToOperator).not.toHaveBeenCalled();
      expect(UserRepository.promoteToAdmin).not.toHaveBeenCalled();
    });
  });

  // ============================================== #
  //  4. !config role demote <phone> <role>       #
  //     (5 tests)                                 #
  // ============================================== #

  describe('!config role demote', () => {
    const commands = RoleModule.register();
    const demoteCommand = commands.demote;

    it('should demote OPERATOR to USER (ADMIN)', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetUser = mockOperator;
      const demotedUser = { ...targetUser, role: UserRole.USER };

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(targetUser);
      (UserRepository.demoteToUser as jest.Mock).mockResolvedValue(demotedUser);

      await demoteCommand.execute(message, `${targetUser.phoneNumber} USER`);

      // Verify permission check
      expect(UserRepository.isAdmin).toHaveBeenCalledWith(mockAdmin);

      // Verify demotion
      expect(UserRepository.demoteToUser).toHaveBeenCalledWith(
        targetUser.id,
        mockAdmin
      );

      // Verify response
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ *Role Change Successful*')
      );
      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('📊 OPERATOR → USER')
      );
    });

    it('should demote ADMIN to OPERATOR (OWNER only)', async () => {
      const message = createMockMessage(mockOwner.phoneNumber);
      const targetUser = mockAdmin;
      const demotedUser = { ...targetUser, role: UserRole.OPERATOR };

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockOwner)
        .mockResolvedValueOnce(targetUser);
      (UserRepository.promoteToOperator as jest.Mock).mockResolvedValue(demotedUser);

      await demoteCommand.execute(message, `${targetUser.phoneNumber} OPERATOR`);

      // Verify OWNER can demote ADMIN
      expect(UserRepository.isOwner).toHaveBeenCalledWith(mockOwner);
      expect(UserRepository.promoteToOperator).toHaveBeenCalledWith(
        targetUser.id,
        mockOwner
      );

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('ADMIN → OPERATOR')
      );
    });

    it('should deny ADMIN demoting ADMIN', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const targetAdmin = createMockUser({ id: 'admin-2', phoneNumber: '+2222222223', role: UserRole.ADMIN });

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(targetAdmin);

      await demoteCommand.execute(message, `${targetAdmin.phoneNumber} USER`);

      // Verify permission denied
      expect(AuditLogger.logPermissionDenied).toHaveBeenCalledWith({
        phoneNumber: mockAdmin.phoneNumber,
        userRole: mockAdmin.role,
        action: 'DEMOTE_ADMIN',
        reason: 'Only OWNER can demote ADMIN role'
      });

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ Only OWNER can demote ADMINs')
      );

      // No demotion executed
      expect(UserRepository.demoteToUser).not.toHaveBeenCalled();
    });

    it('should prevent self-demotion', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockAdmin); // Same user

      await demoteCommand.execute(message, `${mockAdmin.phoneNumber} USER`);

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ You cannot demote yourself')
      );

      // No demotion executed
      expect(UserRepository.demoteToUser).not.toHaveBeenCalled();
    });

    it('should handle user not found', async () => {
      const message = createMockMessage(mockAdmin.phoneNumber);
      const unknownPhone = '+9999999999';

      (UserRepository.findByPhoneNumber as jest.Mock)
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(null); // User not found

      await demoteCommand.execute(message, `${unknownPhone} USER`);

      expect(message.reply).toHaveBeenCalledWith(
        expect.stringContaining(`User not found: ${unknownPhone}`)
      );

      // No demotion attempted
      expect(UserRepository.demoteToUser).not.toHaveBeenCalled();
    });
  });
});
