/**
 * User Repository
 *
 * Purpose: Encapsulate all database operations for User model
 * Pattern: Repository pattern - separates data access logic from business logic
 *
 * Usage:
 *   import { UserRepository } from './db/repositories/user.repository';
 *   const user = await UserRepository.findByPhoneNumber('+1234567890');
 */

import { prisma } from '../client';
import type { User } from '@prisma/client';
import { AuditLogger } from '../../services/auditLogger';

/**
 * Valid user roles (app-level validation for SQLite string field)
 * Role Hierarchy: OWNER (4) > ADMIN (3) > OPERATOR (2) > USER (1)
 */
export const UserRole = {
  OWNER: 'OWNER',    // Level 4: Full system access, can manage all roles
  ADMIN: 'ADMIN',    // Level 3: Team lead, can manage operators and users
  OPERATOR: 'OPERATOR', // Level 2: Customer service agent, limited access
  USER: 'USER',      // Level 1: Customer, chat only
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

/**
 * Role level mapping for hierarchy checks
 */
export const RoleLevel: Record<UserRoleType, number> = {
  [UserRole.OWNER]: 4,
  [UserRole.ADMIN]: 3,
  [UserRole.OPERATOR]: 2,
  [UserRole.USER]: 1,
};

/**
 * User creation data (omit auto-generated fields)
 */
export interface CreateUserData {
  phoneNumber: string;
  role?: UserRoleType;
  isWhitelisted?: boolean;
}

/**
 * User update data (all fields optional)
 */
export interface UpdateUserData {
  role?: UserRoleType;
  isWhitelisted?: boolean;
}

/**
 * User Repository
 * Provides CRUD operations and business logic for User model
 */
export class UserRepository {
  /**
   * Create a new user
   *
   * @param data - User creation data
   * @returns Created user
   * @throws Error if phone number already exists
   */
  static async create(data: CreateUserData): Promise<User> {
    // Validate role if provided
    if (data.role && !Object.values(UserRole).includes(data.role)) {
      throw new Error(
        `Invalid role: ${data.role}. Must be one of: ${Object.values(UserRole).join(', ')}.`
      );
    }

    return prisma.user.create({
      data: {
        phoneNumber: data.phoneNumber,
        role: data.role || UserRole.USER,
        isWhitelisted: data.isWhitelisted ?? false,
      },
    });
  }

  /**
   * Find user by ID
   *
   * @param id - User ID (cuid)
   * @returns User or null if not found
   */
  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find user by phone number
   *
   * @param phoneNumber - Phone number (E.164 format recommended)
   * @returns User or null if not found
   */
  static async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  /**
   * Find or create user by phone number
   * Useful for first-time users
   *
   * @param phoneNumber - Phone number
   * @param defaults - Default values if user is created
   * @returns User (existing or newly created)
   */
  static async findOrCreate(
    phoneNumber: string,
    defaults?: Omit<CreateUserData, 'phoneNumber'>
  ): Promise<User> {
    const existing = await this.findByPhoneNumber(phoneNumber);
    if (existing) {
      return existing;
    }

    return this.create({
      phoneNumber,
      ...defaults,
    });
  }

  /**
   * Update user by ID
   *
   * @param id - User ID
   * @param data - Update data
   * @returns Updated user
   * @throws Error if user not found or invalid role
   */
  static async update(id: string, data: UpdateUserData): Promise<User> {
    // Validate role if provided
    if (data.role && !Object.values(UserRole).includes(data.role)) {
      throw new Error(
        `Invalid role: ${data.role}. Must be one of: ${Object.values(UserRole).join(', ')}.`
      );
    }

    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete user by ID
   * Cascades to conversations and usage metrics
   *
   * @param id - User ID
   * @returns Deleted user
   */
  static async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Get all users (paginated)
   *
   * @param options - Pagination options
   * @returns Array of users
   */
  static async findAll(options?: {
    skip?: number;
    take?: number;
  }): Promise<User[]> {
    return prisma.user.findMany({
      skip: options?.skip,
      take: options?.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Count total users
   *
   * @returns Total user count
   */
  static async count(): Promise<number> {
    return prisma.user.count();
  }

  // ============================================== #
  //          Role-Based Access Helpers             #
  // ============================================== #

  /**
   * Check if user is admin (accepts User object or user ID)
   *
   * @param userOrId - User object or User ID string
   * @returns True if admin or owner
   */
  static isAdmin(userOrId: User | string | null | undefined): boolean | Promise<boolean> {
    // Handle User object directly (synchronous check)
    if (typeof userOrId === 'object' && userOrId !== null) {
      return userOrId.role === UserRole.ADMIN || userOrId.role === UserRole.OWNER;
    }

    // Handle user ID (async check)
    if (typeof userOrId === 'string') {
      return this.findById(userOrId).then(user =>
        user?.role === UserRole.ADMIN || user?.role === UserRole.OWNER || false
      );
    }

    return false;
  }

  /**
   * Check if user is admin by phone number
   *
   * @param phoneNumber - Phone number
   * @returns True if admin
   */
  static async isAdminByPhone(phoneNumber: string): Promise<boolean> {
    const user = await this.findByPhoneNumber(phoneNumber);
    return user?.role === UserRole.ADMIN;
  }

  /**
   * Get all admin users
   *
   * @returns Array of admin users
   */
  static async findAllAdmins(): Promise<User[]> {
    return prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Promote user to admin
   *
   * @param userId - User ID
   * @param performedBy - User performing the action (for audit logging)
   * @returns Updated user
   */
  static async promoteToAdmin(userId: string, performedBy?: User): Promise<User> {
    const targetUser = await this.findById(userId);
    if (!targetUser) {
      throw new Error(`User not found: ${userId}`);
    }

    const oldRole = targetUser.role;
    const updatedUser = await this.update(userId, { role: UserRole.ADMIN });

    // Audit logging
    if (performedBy) {
      await AuditLogger.logRoleChange({
        performedBy,
        targetUser: updatedUser,
        oldRole,
        newRole: UserRole.ADMIN,
      });
    }

    return updatedUser;
  }

  /**
   * Demote admin to regular user
   *
   * @param userId - User ID
   * @param performedBy - User performing the action (for audit logging)
   * @returns Updated user
   */
  static async demoteToUser(userId: string, performedBy?: User): Promise<User> {
    const targetUser = await this.findById(userId);
    if (!targetUser) {
      throw new Error(`User not found: ${userId}`);
    }

    const oldRole = targetUser.role;
    const updatedUser = await this.update(userId, { role: UserRole.USER });

    // Audit logging
    if (performedBy) {
      await AuditLogger.logRoleChange({
        performedBy,
        targetUser: updatedUser,
        oldRole,
        newRole: UserRole.USER,
      });
    }

    return updatedUser;
  }

  /**
   * Check if user is owner (accepts User object or user ID)
   *
   * @param userOrId - User object or User ID string
   * @returns True if owner
   */
  static isOwner(userOrId: User | string | null | undefined): boolean | Promise<boolean> {
    // Handle User object directly (synchronous check)
    if (typeof userOrId === 'object' && userOrId !== null) {
      return userOrId.role === UserRole.OWNER;
    }

    // Handle user ID (async check)
    if (typeof userOrId === 'string') {
      return this.findById(userOrId).then(user => user?.role === UserRole.OWNER || false);
    }

    return false;
  }

  /**
   * Check if user is owner by phone number
   *
   * @param phoneNumber - Phone number
   * @returns True if owner
   */
  static async isOwnerByPhone(phoneNumber: string): Promise<boolean> {
    const user = await this.findByPhoneNumber(phoneNumber);
    return user?.role === UserRole.OWNER;
  }

  /**
   * Check if user is operator
   *
   * @param userId - User ID
   * @returns True if operator
   */
  static async isOperator(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    return user?.role === UserRole.OPERATOR;
  }

  /**
   * Check if user is operator by phone number
   *
   * @param phoneNumber - Phone number
   * @returns True if operator
   */
  static async isOperatorByPhone(phoneNumber: string): Promise<boolean> {
    const user = await this.findByPhoneNumber(phoneNumber);
    return user?.role === UserRole.OPERATOR;
  }

  /**
   * Get all owner users
   *
   * @returns Array of owner users
   */
  static async findAllOwners(): Promise<User[]> {
    return prisma.user.findMany({
      where: { role: UserRole.OWNER },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get all operator users
   *
   * @returns Array of operator users
   */
  static async findAllOperators(): Promise<User[]> {
    return prisma.user.findMany({
      where: { role: UserRole.OPERATOR },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Promote user to owner
   *
   * @param userId - User ID
   * @param performedBy - User performing the action (for audit logging)
   * @returns Updated user
   */
  static async promoteToOwner(userId: string, performedBy?: User): Promise<User> {
    const targetUser = await this.findById(userId);
    if (!targetUser) {
      throw new Error(`User not found: ${userId}`);
    }

    const oldRole = targetUser.role;
    const updatedUser = await this.update(userId, { role: UserRole.OWNER });

    // Audit logging
    if (performedBy) {
      await AuditLogger.logRoleChange({
        performedBy,
        targetUser: updatedUser,
        oldRole,
        newRole: UserRole.OWNER,
      });
    }

    return updatedUser;
  }

  /**
   * Promote user to operator
   *
   * @param userId - User ID
   * @param performedBy - User performing the action (for audit logging)
   * @returns Updated user
   */
  static async promoteToOperator(userId: string, performedBy?: User): Promise<User> {
    const targetUser = await this.findById(userId);
    if (!targetUser) {
      throw new Error(`User not found: ${userId}`);
    }

    const oldRole = targetUser.role;
    const updatedUser = await this.update(userId, { role: UserRole.OPERATOR });

    // Audit logging
    if (performedBy) {
      await AuditLogger.logRoleChange({
        performedBy,
        targetUser: updatedUser,
        oldRole,
        newRole: UserRole.OPERATOR,
      });
    }

    return updatedUser;
  }

  /**
   * Get role level for comparison
   *
   * @param role - User role
   * @returns Role level (1-4)
   */
  static getRoleLevel(role: UserRoleType): number {
    return RoleLevel[role];
  }

  /**
   * Check if one role has higher level than another
   *
   * @param role1 - First role
   * @param role2 - Second role
   * @returns True if role1 > role2
   */
  static isRoleHigher(role1: UserRoleType, role2: UserRoleType): boolean {
    return this.getRoleLevel(role1) > this.getRoleLevel(role2);
  }

  /**
   * Check if user can manage another user based on role hierarchy
   * Rule: You can only manage users with lower role level than yours
   *
   * @param managerRole - Manager's role
   * @param targetRole - Target user's role
   * @returns True if manager can manage target
   */
  static canManageRole(managerRole: UserRoleType, targetRole: UserRoleType): boolean {
    return this.isRoleHigher(managerRole, targetRole);
  }

  // ============================================== #
  //          Whitelist Management                  #
  // ============================================== #

  /**
   * Check if user is whitelisted
   *
   * @param userId - User ID
   * @returns True if whitelisted
   */
  static async isWhitelisted(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    return user?.isWhitelisted ?? false;
  }

  /**
   * Check if phone number is whitelisted
   *
   * @param phoneNumber - Phone number
   * @returns True if whitelisted
   */
  static async isWhitelistedByPhone(phoneNumber: string): Promise<boolean> {
    const user = await this.findByPhoneNumber(phoneNumber);
    return user?.isWhitelisted ?? false;
  }

  /**
   * Add user to whitelist
   *
   * @param userId - User ID
   * @param performedBy - User performing the action (for audit logging)
   * @returns Updated user
   */
  static async addToWhitelist(userId: string, performedBy?: User): Promise<User> {
    const updatedUser = await this.update(userId, { isWhitelisted: true });

    // Audit logging
    if (performedBy) {
      await AuditLogger.logWhitelistChange({
        performedBy,
        targetPhoneNumber: updatedUser.phoneNumber,
        action: 'ADD',
      });
    }

    return updatedUser;
  }

  /**
   * Remove user from whitelist
   *
   * @param userId - User ID
   * @param performedBy - User performing the action (for audit logging)
   * @returns Updated user
   */
  static async removeFromWhitelist(userId: string, performedBy?: User): Promise<User> {
    const updatedUser = await this.update(userId, { isWhitelisted: false });

    // Audit logging
    if (performedBy) {
      await AuditLogger.logWhitelistChange({
        performedBy,
        targetPhoneNumber: updatedUser.phoneNumber,
        action: 'REMOVE',
      });
    }

    return updatedUser;
  }

  /**
   * Get all whitelisted users
   *
   * @returns Array of whitelisted users
   */
  static async findAllWhitelisted(): Promise<User[]> {
    return prisma.user.findMany({
      where: { isWhitelisted: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Bulk whitelist phone numbers
   * Creates users if they don't exist
   *
   * @param phoneNumbers - Array of phone numbers
   * @returns Array of whitelisted users
   */
  static async bulkWhitelist(phoneNumbers: string[]): Promise<User[]> {
    const users: User[] = [];

    for (const phoneNumber of phoneNumbers) {
      const user = await this.findOrCreate(phoneNumber, {
        isWhitelisted: true,
      });

      // Update if already exists but not whitelisted
      if (!user.isWhitelisted) {
        users.push(await this.addToWhitelist(user.id));
      } else {
        users.push(user);
      }
    }

    return users;
  }

  // ============================================== #
  //          User Statistics & Analytics           #
  // ============================================== #

  /**
   * Get user with conversation count
   *
   * @param userId - User ID
   * @returns User with conversation count
   */
  static async getUserWithStats(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            conversations: true,
            usageMetrics: true,
          },
        },
      },
    });
  }

  /**
   * Check if user exists by phone number
   * More efficient than findByPhoneNumber for existence checks
   *
   * @param phoneNumber - Phone number
   * @returns True if user exists
   */
  static async exists(phoneNumber: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { phoneNumber },
    });
    return count > 0;
  }
}
