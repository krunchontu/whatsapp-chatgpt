/**
 * User Repository Tests
 *
 * Purpose: Test all CRUD operations, role management, and whitelist functionality
 * Run: pnpm test src/db/repositories/__tests__/user.repository.test.ts
 */

import { UserRepository, UserRole } from '../user.repository';
import { prisma } from '../../client';
import type { User } from '@prisma/client';

describe('UserRepository', () => {
  /**
   * Clean up database before each test
   */
  beforeEach(async () => {
    // Delete all users (cascades to conversations and usage metrics)
    await prisma.user.deleteMany();
  });

  /**
   * Cleanup after all tests
   */
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================== #
  //              CRUD Operations                   #
  // ============================================== #

  describe('CRUD Operations', () => {
    describe('create()', () => {
      it('should create a new user with default role USER', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
        expect(user.phoneNumber).toBe('+1234567890');
        expect(user.role).toBe(UserRole.USER);
        expect(user.isWhitelisted).toBe(false);
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
      });

      it('should create admin user when role is specified', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
          role: UserRole.ADMIN,
        });

        expect(user.role).toBe(UserRole.ADMIN);
      });

      it('should create whitelisted user when specified', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
          isWhitelisted: true,
        });

        expect(user.isWhitelisted).toBe(true);
      });

      it('should throw error for invalid role', async () => {
        await expect(
          UserRepository.create({
            phoneNumber: '+1234567890',
            role: 'INVALID_ROLE' as any,
          })
        ).rejects.toThrow('Invalid role');
      });

      it('should throw error for duplicate phone number', async () => {
        await UserRepository.create({ phoneNumber: '+1234567890' });

        await expect(
          UserRepository.create({ phoneNumber: '+1234567890' })
        ).rejects.toThrow();
      });
    });

    describe('findById()', () => {
      it('should find user by ID', async () => {
        const created = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        const found = await UserRepository.findById(created.id);

        expect(found).toBeDefined();
        expect(found?.id).toBe(created.id);
        expect(found?.phoneNumber).toBe('+1234567890');
      });

      it('should return null for non-existent ID', async () => {
        const found = await UserRepository.findById('non-existent-id');
        expect(found).toBeNull();
      });
    });

    describe('findByPhoneNumber()', () => {
      it('should find user by phone number', async () => {
        await UserRepository.create({ phoneNumber: '+1234567890' });

        const found = await UserRepository.findByPhoneNumber('+1234567890');

        expect(found).toBeDefined();
        expect(found?.phoneNumber).toBe('+1234567890');
      });

      it('should return null for non-existent phone number', async () => {
        const found = await UserRepository.findByPhoneNumber('+9999999999');
        expect(found).toBeNull();
      });
    });

    describe('findOrCreate()', () => {
      it('should return existing user if found', async () => {
        const existing = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        const found = await UserRepository.findOrCreate('+1234567890');

        expect(found.id).toBe(existing.id);
      });

      it('should create new user if not found', async () => {
        const user = await UserRepository.findOrCreate('+1234567890');

        expect(user).toBeDefined();
        expect(user.phoneNumber).toBe('+1234567890');
        expect(user.role).toBe(UserRole.USER);
      });

      it('should create user with custom defaults', async () => {
        const user = await UserRepository.findOrCreate('+1234567890', {
          role: UserRole.ADMIN,
          isWhitelisted: true,
        });

        expect(user.role).toBe(UserRole.ADMIN);
        expect(user.isWhitelisted).toBe(true);
      });
    });

    describe('update()', () => {
      it('should update user role', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        const updated = await UserRepository.update(user.id, {
          role: UserRole.ADMIN,
        });

        expect(updated.role).toBe(UserRole.ADMIN);
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          user.updatedAt.getTime()
        );
      });

      it('should update whitelist status', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        const updated = await UserRepository.update(user.id, {
          isWhitelisted: true,
        });

        expect(updated.isWhitelisted).toBe(true);
      });

      it('should throw error for invalid role', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        await expect(
          UserRepository.update(user.id, {
            role: 'INVALID' as any,
          })
        ).rejects.toThrow('Invalid role');
      });

      it('should throw error for non-existent user', async () => {
        await expect(
          UserRepository.update('non-existent-id', { role: UserRole.ADMIN })
        ).rejects.toThrow();
      });
    });

    describe('delete()', () => {
      it('should delete user', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1234567890',
        });

        const deleted = await UserRepository.delete(user.id);
        expect(deleted.id).toBe(user.id);

        const found = await UserRepository.findById(user.id);
        expect(found).toBeNull();
      });

      it('should throw error for non-existent user', async () => {
        await expect(UserRepository.delete('non-existent-id')).rejects.toThrow();
      });
    });

    describe('findAll()', () => {
      it('should return all users', async () => {
        await UserRepository.create({ phoneNumber: '+1111111111' });
        await UserRepository.create({ phoneNumber: '+2222222222' });
        await UserRepository.create({ phoneNumber: '+3333333333' });

        const users = await UserRepository.findAll();

        expect(users).toHaveLength(3);
      });

      it('should support pagination', async () => {
        await UserRepository.create({ phoneNumber: '+1111111111' });
        await UserRepository.create({ phoneNumber: '+2222222222' });
        await UserRepository.create({ phoneNumber: '+3333333333' });

        const page1 = await UserRepository.findAll({ take: 2 });
        expect(page1).toHaveLength(2);

        const page2 = await UserRepository.findAll({ skip: 2, take: 2 });
        expect(page2).toHaveLength(1);
      });

      it('should order by createdAt desc', async () => {
        const user1 = await UserRepository.create({ phoneNumber: '+1111111111' });
        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
        const user2 = await UserRepository.create({ phoneNumber: '+2222222222' });

        const users = await UserRepository.findAll();

        expect(users[0].id).toBe(user2.id); // Newest first
        expect(users[1].id).toBe(user1.id);
      });
    });

    describe('count()', () => {
      it('should return total user count', async () => {
        expect(await UserRepository.count()).toBe(0);

        await UserRepository.create({ phoneNumber: '+1111111111' });
        expect(await UserRepository.count()).toBe(1);

        await UserRepository.create({ phoneNumber: '+2222222222' });
        expect(await UserRepository.count()).toBe(2);
      });
    });

    describe('exists()', () => {
      it('should return true for existing phone number', async () => {
        await UserRepository.create({ phoneNumber: '+1234567890' });

        const exists = await UserRepository.exists('+1234567890');
        expect(exists).toBe(true);
      });

      it('should return false for non-existent phone number', async () => {
        const exists = await UserRepository.exists('+9999999999');
        expect(exists).toBe(false);
      });
    });
  });

  // ============================================== #
  //          Role-Based Access Helpers             #
  // ============================================== #

  describe('Role-Based Access', () => {
    describe('isAdmin()', () => {
      it('should return true for admin user', async () => {
        const admin = await UserRepository.create({
          phoneNumber: '+1111111111',
          role: UserRole.ADMIN,
        });

        const result = await UserRepository.isAdmin(admin.id);
        expect(result).toBe(true);
      });

      it('should return false for regular user', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const result = await UserRepository.isAdmin(user.id);
        expect(result).toBe(false);
      });

      it('should return false for non-existent user', async () => {
        const result = await UserRepository.isAdmin('non-existent-id');
        expect(result).toBe(false);
      });
    });

    describe('isAdminByPhone()', () => {
      it('should return true for admin phone number', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
          role: UserRole.ADMIN,
        });

        const result = await UserRepository.isAdminByPhone('+1111111111');
        expect(result).toBe(true);
      });

      it('should return false for regular user phone', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const result = await UserRepository.isAdminByPhone('+1111111111');
        expect(result).toBe(false);
      });
    });

    describe('findAllAdmins()', () => {
      it('should return only admin users', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
          role: UserRole.ADMIN,
        });
        await UserRepository.create({
          phoneNumber: '+2222222222',
        });
        await UserRepository.create({
          phoneNumber: '+3333333333',
          role: UserRole.ADMIN,
        });

        const admins = await UserRepository.findAllAdmins();

        expect(admins).toHaveLength(2);
        expect(admins.every((u) => u.role === UserRole.ADMIN)).toBe(true);
      });
    });

    describe('promoteToAdmin()', () => {
      it('should promote user to admin', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const promoted = await UserRepository.promoteToAdmin(user.id);

        expect(promoted.role).toBe(UserRole.ADMIN);
      });
    });

    describe('demoteToUser()', () => {
      it('should demote admin to user', async () => {
        const admin = await UserRepository.create({
          phoneNumber: '+1111111111',
          role: UserRole.ADMIN,
        });

        const demoted = await UserRepository.demoteToUser(admin.id);

        expect(demoted.role).toBe(UserRole.USER);
      });
    });
  });

  // ============================================== #
  //          Whitelist Management                  #
  // ============================================== #

  describe('Whitelist Management', () => {
    describe('isWhitelisted()', () => {
      it('should return true for whitelisted user', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
          isWhitelisted: true,
        });

        const result = await UserRepository.isWhitelisted(user.id);
        expect(result).toBe(true);
      });

      it('should return false for non-whitelisted user', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const result = await UserRepository.isWhitelisted(user.id);
        expect(result).toBe(false);
      });

      it('should return false for non-existent user', async () => {
        const result = await UserRepository.isWhitelisted('non-existent-id');
        expect(result).toBe(false);
      });
    });

    describe('isWhitelistedByPhone()', () => {
      it('should return true for whitelisted phone', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
          isWhitelisted: true,
        });

        const result = await UserRepository.isWhitelistedByPhone('+1111111111');
        expect(result).toBe(true);
      });

      it('should return false for non-whitelisted phone', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const result = await UserRepository.isWhitelistedByPhone('+1111111111');
        expect(result).toBe(false);
      });
    });

    describe('addToWhitelist()', () => {
      it('should add user to whitelist', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const updated = await UserRepository.addToWhitelist(user.id);

        expect(updated.isWhitelisted).toBe(true);
      });
    });

    describe('removeFromWhitelist()', () => {
      it('should remove user from whitelist', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
          isWhitelisted: true,
        });

        const updated = await UserRepository.removeFromWhitelist(user.id);

        expect(updated.isWhitelisted).toBe(false);
      });
    });

    describe('findAllWhitelisted()', () => {
      it('should return only whitelisted users', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
          isWhitelisted: true,
        });
        await UserRepository.create({
          phoneNumber: '+2222222222',
        });
        await UserRepository.create({
          phoneNumber: '+3333333333',
          isWhitelisted: true,
        });

        const whitelisted = await UserRepository.findAllWhitelisted();

        expect(whitelisted).toHaveLength(2);
        expect(whitelisted.every((u) => u.isWhitelisted)).toBe(true);
      });
    });

    describe('bulkWhitelist()', () => {
      it('should create and whitelist new users', async () => {
        const users = await UserRepository.bulkWhitelist([
          '+1111111111',
          '+2222222222',
          '+3333333333',
        ]);

        expect(users).toHaveLength(3);
        expect(users.every((u) => u.isWhitelisted)).toBe(true);
      });

      it('should whitelist existing non-whitelisted users', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
          isWhitelisted: false,
        });

        const users = await UserRepository.bulkWhitelist(['+1111111111']);

        expect(users).toHaveLength(1);
        expect(users[0].isWhitelisted).toBe(true);
      });

      it('should handle mix of existing and new users', async () => {
        await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const users = await UserRepository.bulkWhitelist([
          '+1111111111',
          '+2222222222',
        ]);

        expect(users).toHaveLength(2);
        expect(users.every((u) => u.isWhitelisted)).toBe(true);
      });
    });
  });

  // ============================================== #
  //          User Statistics                       #
  // ============================================== #

  describe('User Statistics', () => {
    describe('getUserWithStats()', () => {
      it('should return user with conversation and usage counts', async () => {
        const user = await UserRepository.create({
          phoneNumber: '+1111111111',
        });

        const stats = await UserRepository.getUserWithStats(user.id);

        expect(stats).toBeDefined();
        expect(stats?._count).toBeDefined();
        expect(stats?._count.conversations).toBe(0);
        expect(stats?._count.usageMetrics).toBe(0);
      });

      it('should return null for non-existent user', async () => {
        const stats = await UserRepository.getUserWithStats('non-existent-id');
        expect(stats).toBeNull();
      });
    });
  });
});
