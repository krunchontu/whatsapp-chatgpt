/**
 * Permission System for RBAC
 *
 * Purpose: Define permissions and map them to roles
 * Pattern: Permission-based access control with role hierarchy
 *
 * Usage:
 *   import { hasPermission, Permission } from './lib/permissions';
 *   if (hasPermission(user.role, Permission.VIEW_GLOBAL_USAGE)) {
 *     // Allow access
 *   }
 */

import { UserRole, UserRoleType, RoleLevel } from '../db/repositories/user.repository';

/**
 * System-wide permissions
 * Each permission represents a specific action or capability
 */
export enum Permission {
  // ============================================== #
  //          Basic Permissions (All Roles)         #
  // ============================================== #

  /**
   * Chat with the AI bot
   * Available to: ALL roles
   */
  CHAT = 'CHAT',

  /**
   * Reset own conversation history
   * Available to: ALL roles
   */
  RESET_CONVERSATION = 'RESET_CONVERSATION',

  // ============================================== #
  //          Usage Tracking (OPERATOR+)            #
  // ============================================== #

  /**
   * View own usage statistics
   * Available to: OPERATOR, ADMIN, OWNER
   */
  VIEW_OWN_USAGE = 'VIEW_OWN_USAGE',

  /**
   * View global usage statistics (all users)
   * Available to: ADMIN, OWNER
   */
  VIEW_GLOBAL_USAGE = 'VIEW_GLOBAL_USAGE',

  /**
   * View cost alerts and thresholds
   * Available to: ADMIN, OWNER
   */
  VIEW_COST_ALERTS = 'VIEW_COST_ALERTS',

  // ============================================== #
  //          Configuration (OPERATOR+ Limited)     #
  // ============================================== #

  /**
   * Update bot configuration (limited: language, model)
   * Available to: OPERATOR, ADMIN, OWNER
   */
  UPDATE_CONFIG_LIMITED = 'UPDATE_CONFIG_LIMITED',

  /**
   * Update bot configuration (full access)
   * Available to: ADMIN, OWNER
   */
  UPDATE_CONFIG = 'UPDATE_CONFIG',

  // ============================================== #
  //          Role Management (ADMIN+)              #
  // ============================================== #

  /**
   * Manage USER roles (promote, demote, view)
   * Available to: ADMIN, OWNER
   */
  MANAGE_USERS = 'MANAGE_USERS',

  /**
   * Manage OPERATOR roles (promote, demote, view)
   * Available to: ADMIN, OWNER
   */
  MANAGE_OPERATORS = 'MANAGE_OPERATORS',

  /**
   * Manage ADMIN roles (promote, demote, view)
   * Available to: OWNER only
   */
  MANAGE_ADMINS = 'MANAGE_ADMINS',

  /**
   * Manage OWNER roles (promote, demote, view)
   * Available to: OWNER only
   */
  MANAGE_OWNERS = 'MANAGE_OWNERS',

  // ============================================== #
  //          Whitelist Management (ADMIN+)         #
  // ============================================== #

  /**
   * Add/remove users from whitelist
   * Available to: ADMIN, OWNER
   */
  MANAGE_WHITELIST = 'MANAGE_WHITELIST',

  // ============================================== #
  //          Audit Logs (ADMIN+)                   #
  // ============================================== #

  /**
   * View audit logs (read-only)
   * Available to: ADMIN, OWNER
   */
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',

  /**
   * Export audit logs to JSON/CSV
   * Available to: OWNER only
   */
  EXPORT_AUDIT_LOGS = 'EXPORT_AUDIT_LOGS',
}

/**
 * Role-to-Permissions mapping
 * Defines what each role can do
 */
export const RolePermissions: Record<UserRoleType, Permission[]> = {
  // OWNER: Full system access
  [UserRole.OWNER]: [
    // Basic
    Permission.CHAT,
    Permission.RESET_CONVERSATION,
    // Usage tracking
    Permission.VIEW_OWN_USAGE,
    Permission.VIEW_GLOBAL_USAGE,
    Permission.VIEW_COST_ALERTS,
    // Configuration
    Permission.UPDATE_CONFIG_LIMITED,
    Permission.UPDATE_CONFIG,
    // Role management
    Permission.MANAGE_USERS,
    Permission.MANAGE_OPERATORS,
    Permission.MANAGE_ADMINS,
    Permission.MANAGE_OWNERS,
    // Whitelist
    Permission.MANAGE_WHITELIST,
    // Audit logs
    Permission.VIEW_AUDIT_LOGS,
    Permission.EXPORT_AUDIT_LOGS,
  ],

  // ADMIN: Team lead, can manage operators and users
  [UserRole.ADMIN]: [
    // Basic
    Permission.CHAT,
    Permission.RESET_CONVERSATION,
    // Usage tracking
    Permission.VIEW_OWN_USAGE,
    Permission.VIEW_GLOBAL_USAGE,
    Permission.VIEW_COST_ALERTS,
    // Configuration
    Permission.UPDATE_CONFIG_LIMITED,
    Permission.UPDATE_CONFIG,
    // Role management (cannot manage admins or owners)
    Permission.MANAGE_USERS,
    Permission.MANAGE_OPERATORS,
    // Whitelist
    Permission.MANAGE_WHITELIST,
    // Audit logs (read-only)
    Permission.VIEW_AUDIT_LOGS,
  ],

  // OPERATOR: Customer service agent, limited access
  [UserRole.OPERATOR]: [
    // Basic
    Permission.CHAT,
    Permission.RESET_CONVERSATION,
    // Usage tracking
    Permission.VIEW_OWN_USAGE,
    // Configuration (limited: language, model only)
    Permission.UPDATE_CONFIG_LIMITED,
  ],

  // USER: Customer, chat only
  [UserRole.USER]: [
    // Basic
    Permission.CHAT,
    Permission.RESET_CONVERSATION,
  ],
};

/**
 * Check if a role has a specific permission
 *
 * @param role - User role
 * @param permission - Permission to check
 * @returns True if role has permission
 *
 * @example
 * if (hasPermission(UserRole.ADMIN, Permission.VIEW_GLOBAL_USAGE)) {
 *   // Allow access
 * }
 */
export function hasPermission(role: UserRoleType, permission: Permission): boolean {
  const permissions = RolePermissions[role];
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @returns True if role has at least one permission
 *
 * @example
 * if (hasAnyPermission(user.role, [Permission.VIEW_GLOBAL_USAGE, Permission.VIEW_OWN_USAGE])) {
 *   // Show usage stats
 * }
 */
export function hasAnyPermission(role: UserRoleType, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 *
 * @param role - User role
 * @param permissions - Array of permissions to check
 * @returns True if role has all permissions
 *
 * @example
 * if (hasAllPermissions(user.role, [Permission.MANAGE_USERS, Permission.VIEW_AUDIT_LOGS])) {
 *   // Advanced admin action
 * }
 */
export function hasAllPermissions(role: UserRoleType, permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 *
 * @param role - User role
 * @returns Array of permissions
 *
 * @example
 * const permissions = getPermissionsForRole(UserRole.OPERATOR);
 * console.log(permissions); // [Permission.CHAT, Permission.RESET_CONVERSATION, ...]
 */
export function getPermissionsForRole(role: UserRoleType): Permission[] {
  return RolePermissions[role] || [];
}

/**
 * Check if one role has higher level than another
 * Uses role hierarchy: OWNER (4) > ADMIN (3) > OPERATOR (2) > USER (1)
 *
 * @param role1 - First role
 * @param role2 - Second role
 * @returns True if role1 > role2
 *
 * @example
 * if (isRoleHigher(UserRole.ADMIN, UserRole.OPERATOR)) {
 *   // ADMIN can manage OPERATOR
 * }
 */
export function isRoleHigher(role1: UserRoleType, role2: UserRoleType): boolean {
  return RoleLevel[role1] > RoleLevel[role2];
}

/**
 * Check if one role has equal or higher level than another
 *
 * @param role1 - First role
 * @param role2 - Second role
 * @returns True if role1 >= role2
 */
export function isRoleEqualOrHigher(role1: UserRoleType, role2: UserRoleType): boolean {
  return RoleLevel[role1] >= RoleLevel[role2];
}

/**
 * Check if a role can manage another role
 * Rule: You can only manage users with lower role level than yours
 *
 * @param managerRole - Manager's role
 * @param targetRole - Target user's role
 * @returns True if manager can manage target
 *
 * @example
 * if (canManageRole(UserRole.ADMIN, UserRole.OPERATOR)) {
 *   // ADMIN can promote/demote OPERATOR
 * }
 */
export function canManageRole(managerRole: UserRoleType, targetRole: UserRoleType): boolean {
  return isRoleHigher(managerRole, targetRole);
}

/**
 * Get minimum role required for a permission
 *
 * @param permission - Permission to check
 * @returns Minimum role level required, or null if permission doesn't exist
 *
 * @example
 * const minRole = getMinimumRoleForPermission(Permission.VIEW_GLOBAL_USAGE);
 * console.log(minRole); // UserRole.ADMIN
 */
export function getMinimumRoleForPermission(permission: Permission): UserRoleType | null {
  // Check each role from lowest to highest
  const roles = [UserRole.USER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.OWNER];

  for (const role of roles) {
    if (hasPermission(role, permission)) {
      return role;
    }
  }

  return null;
}

/**
 * Get user-friendly description of a permission
 *
 * @param permission - Permission to describe
 * @returns Human-readable description
 */
export function getPermissionDescription(permission: Permission): string {
  const descriptions: Record<Permission, string> = {
    [Permission.CHAT]: 'Chat with the AI bot',
    [Permission.RESET_CONVERSATION]: 'Reset conversation history',
    [Permission.VIEW_OWN_USAGE]: 'View own usage statistics',
    [Permission.VIEW_GLOBAL_USAGE]: 'View global usage statistics',
    [Permission.VIEW_COST_ALERTS]: 'View cost alerts and thresholds',
    [Permission.UPDATE_CONFIG_LIMITED]: 'Update limited bot configuration',
    [Permission.UPDATE_CONFIG]: 'Update full bot configuration',
    [Permission.MANAGE_USERS]: 'Manage regular users',
    [Permission.MANAGE_OPERATORS]: 'Manage operator accounts',
    [Permission.MANAGE_ADMINS]: 'Manage administrator accounts',
    [Permission.MANAGE_OWNERS]: 'Manage owner accounts',
    [Permission.MANAGE_WHITELIST]: 'Manage user whitelist',
    [Permission.VIEW_AUDIT_LOGS]: 'View audit logs',
    [Permission.EXPORT_AUDIT_LOGS]: 'Export audit logs',
  };

  return descriptions[permission] || 'Unknown permission';
}

/**
 * Get user-friendly description of a role
 *
 * @param role - Role to describe
 * @returns Human-readable description
 */
export function getRoleDescription(role: UserRoleType): string {
  const descriptions: Record<UserRoleType, string> = {
    [UserRole.OWNER]: 'Owner - Full system access, can manage all roles',
    [UserRole.ADMIN]: 'Admin - Team lead, can manage operators and users',
    [UserRole.OPERATOR]: 'Operator - Customer service agent, limited access',
    [UserRole.USER]: 'User - Customer, chat only',
  };

  return descriptions[role] || 'Unknown role';
}
