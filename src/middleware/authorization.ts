/**
 * Authorization Middleware
 *
 * Purpose: Provide authorization helpers for command handlers
 * Pattern: Middleware pattern for permission checks
 *
 * Usage:
 *   import { requirePermission, requireRole } from './middleware/authorization';
 *   const user = await requirePermission(phoneNumber, Permission.VIEW_GLOBAL_USAGE);
 */

import { UserRepository, UserRoleType } from '../db/repositories/user.repository';
import { hasPermission, Permission, isRoleEqualOrHigher } from '../lib/permissions';
import { AuthorizationError } from '../lib/errors/AuthorizationError';
import type { User } from '@prisma/client';
import { config } from '../config';

/**
 * Get user role from phone number
 * Creates user if doesn't exist
 *
 * @param phoneNumber - Phone number (E.164 format)
 * @returns User with role
 */
export async function getUserRole(phoneNumber: string): Promise<User> {
  // Check if user exists
  let user = await UserRepository.findByPhoneNumber(phoneNumber);

  if (user) {
    return user;
  }

  // User doesn't exist - determine role from config and create
  const role = determineRoleFromConfig(phoneNumber);
  const isWhitelisted = determineWhitelistStatusFromConfig(phoneNumber);

  user = await UserRepository.create({
    phoneNumber,
    role,
    isWhitelisted,
  });

  return user;
}

/**
 * Determine user role from configuration
 * Checks OWNER_PHONE_NUMBERS, ADMIN_PHONE_NUMBERS, OPERATOR_PHONE_NUMBERS
 *
 * @param phoneNumber - Phone number to check
 * @returns Role (defaults to USER if not in any list)
 */
function determineRoleFromConfig(phoneNumber: string): UserRoleType {
  // Remove whitespace for comparison
  const cleanPhone = phoneNumber.trim();

  // Check owner list
  if (config.ownerPhoneNumbers.some((p) => p.trim() === cleanPhone)) {
    return 'OWNER';
  }

  // Check admin list
  if (config.adminPhoneNumbers.some((p) => p.trim() === cleanPhone)) {
    return 'ADMIN';
  }

  // Check operator list
  if (config.operatorPhoneNumbers.some((p) => p.trim() === cleanPhone)) {
    return 'OPERATOR';
  }

  // Default to USER
  return 'USER';
}

/**
 * Determine whitelist status from configuration
 *
 * @param phoneNumber - Phone number to check
 * @returns True if phone is in whitelist or whitelist is disabled
 */
function determineWhitelistStatusFromConfig(phoneNumber: string): boolean {
  // If whitelist is disabled, everyone is whitelisted
  if (!config.whitelistedEnabled) {
    return true;
  }

  // Check if phone is in whitelist
  const cleanPhone = phoneNumber.trim();
  return config.whitelistedPhoneNumbers.some((p) => p.trim() === cleanPhone);
}

/**
 * Require specific role or higher
 * Throws AuthorizationError if user doesn't have required role level
 *
 * @param phoneNumber - Phone number
 * @param minRole - Minimum required role
 * @returns User if authorized
 * @throws AuthorizationError if not authorized
 *
 * @example
 * // Require ADMIN or OWNER
 * const user = await requireRole(phoneNumber, UserRole.ADMIN);
 */
export async function requireRole(
  phoneNumber: string,
  minRole: UserRoleType
): Promise<User> {
  const user = await getUserRole(phoneNumber);

  if (!isRoleEqualOrHigher(user.role as UserRoleType, minRole)) {
    throw new AuthorizationError(
      `This command requires ${minRole} role or higher. Your role: ${user.role}`
    );
  }

  return user;
}

/**
 * Require specific permission
 * Throws AuthorizationError if user doesn't have permission
 *
 * @param phoneNumber - Phone number
 * @param permission - Required permission
 * @returns User if authorized
 * @throws AuthorizationError if not authorized
 *
 * @example
 * // Require VIEW_GLOBAL_USAGE permission
 * const user = await requirePermission(phoneNumber, Permission.VIEW_GLOBAL_USAGE);
 */
export async function requirePermission(
  phoneNumber: string,
  permission: Permission
): Promise<User> {
  const user = await getUserRole(phoneNumber);

  if (!hasPermission(user.role as UserRoleType, permission)) {
    throw new AuthorizationError(
      `You don't have permission to perform this action. Required permission: ${permission}`
    );
  }

  return user;
}

/**
 * Require any of the specified permissions
 * Throws AuthorizationError if user doesn't have at least one permission
 *
 * @param phoneNumber - Phone number
 * @param permissions - Array of acceptable permissions
 * @returns User if authorized
 * @throws AuthorizationError if not authorized
 *
 * @example
 * // Require either VIEW_GLOBAL_USAGE or VIEW_OWN_USAGE
 * const user = await requireAnyPermission(phoneNumber, [
 *   Permission.VIEW_GLOBAL_USAGE,
 *   Permission.VIEW_OWN_USAGE,
 * ]);
 */
export async function requireAnyPermission(
  phoneNumber: string,
  permissions: Permission[]
): Promise<User> {
  const user = await getUserRole(phoneNumber);

  const hasAny = permissions.some((permission) =>
    hasPermission(user.role as UserRoleType, permission)
  );

  if (!hasAny) {
    throw new AuthorizationError(
      `You don't have permission to perform this action. Required: one of ${permissions.join(', ')}`
    );
  }

  return user;
}

/**
 * Require all of the specified permissions
 * Throws AuthorizationError if user doesn't have all permissions
 *
 * @param phoneNumber - Phone number
 * @param permissions - Array of required permissions
 * @returns User if authorized
 * @throws AuthorizationError if not authorized
 *
 * @example
 * // Require both MANAGE_USERS and VIEW_AUDIT_LOGS
 * const user = await requireAllPermissions(phoneNumber, [
 *   Permission.MANAGE_USERS,
 *   Permission.VIEW_AUDIT_LOGS,
 * ]);
 */
export async function requireAllPermissions(
  phoneNumber: string,
  permissions: Permission[]
): Promise<User> {
  const user = await getUserRole(phoneNumber);

  const hasAll = permissions.every((permission) =>
    hasPermission(user.role as UserRoleType, permission)
  );

  if (!hasAll) {
    throw new AuthorizationError(
      `You don't have permission to perform this action. Required: all of ${permissions.join(', ')}`
    );
  }

  return user;
}

/**
 * Check if user is whitelisted
 * Returns false if whitelist is enabled and user is not whitelisted
 *
 * @param user - User object
 * @returns True if user is whitelisted or whitelist is disabled
 */
export function isWhitelisted(user: User): boolean {
  // If whitelist is disabled, everyone is whitelisted
  if (!config.whitelistedEnabled) {
    return true;
  }

  // Check user's whitelist status
  return user.isWhitelisted;
}

/**
 * Require user to be whitelisted
 * Throws AuthorizationError if user is not whitelisted
 *
 * @param user - User object
 * @throws AuthorizationError if not whitelisted
 *
 * @example
 * const user = await getUserRole(phoneNumber);
 * requireWhitelisted(user);
 */
export function requireWhitelisted(user: User): void {
  if (!isWhitelisted(user)) {
    throw new AuthorizationError(
      'You are not authorized to use this bot. Please contact an administrator to be added to the whitelist.'
    );
  }
}

/**
 * Check if user has permission (non-throwing version)
 * Useful for conditional UI or logging
 *
 * @param user - User object
 * @param permission - Permission to check
 * @returns True if user has permission
 *
 * @example
 * if (checkPermission(user, Permission.VIEW_GLOBAL_USAGE)) {
 *   // Show global stats
 * } else {
 *   // Show only personal stats
 * }
 */
export function checkPermission(user: User, permission: Permission): boolean {
  return hasPermission(user.role as UserRoleType, permission);
}

/**
 * Check if user has role or higher (non-throwing version)
 * Useful for conditional logic
 *
 * @param user - User object
 * @param minRole - Minimum required role
 * @returns True if user has role or higher
 *
 * @example
 * if (checkRole(user, UserRole.ADMIN)) {
 *   // Admin-specific logic
 * }
 */
export function checkRole(user: User, minRole: UserRoleType): boolean {
  return isRoleEqualOrHigher(user.role as UserRoleType, minRole);
}
