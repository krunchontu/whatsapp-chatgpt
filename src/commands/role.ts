/**
 * Role Management Commands Module
 *
 * Purpose: Admin commands for managing user roles
 * Pattern: Command module for AI config system
 *
 * Usage:
 *   !config role list                        - List all users and their roles
 *   !config role info <phoneNumber>          - Show role and permissions for a user
 *   !config role promote <phoneNumber> <role> - Promote user to role
 *   !config role demote <phoneNumber> <role>  - Demote user to role
 */

import { ICommandModule, ICommandDefinition, ICommandsMap } from "../types/commands";
import { Message } from "whatsapp-web.js";
import { UserRepository, UserRole } from "../db/repositories/user.repository";
import { AuditLogger } from "../services/auditLogger";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'commands:role' });

export const RoleModule: ICommandModule = {
	key: "role",
	register: (): ICommandsMap => {
		return {
			list,
			info,
			promote,
			demote
		};
	}
};

const list: ICommandDefinition = {
	help: "- List all users and their roles",
	execute: async function (message: Message) {
		try {
			// Check permissions (ADMIN or higher)
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser || !UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser?.role || 'NONE',
					action: 'LIST_USERS',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to list users. This command requires ADMIN role or higher.");
				return;
			}

			logger.debug({ chatId: message.from }, 'Listing all users');

			const owners = await UserRepository.findAllOwners();
			const admins = await UserRepository.findAllAdmins();
			const operators = await UserRepository.findAllOperators();
			const users = await UserRepository.findAll();

			let response = `👥 *User Roles Summary*\n\n`;

			if (owners.length > 0) {
				response += `*OWNERS (${owners.length}):*\n`;
				for (const owner of owners) {
					response += `• ${owner.phoneNumber}\n`;
				}
				response += `\n`;
			}

			if (admins.length > 0) {
				response += `*ADMINS (${admins.length}):*\n`;
				for (const admin of admins) {
					response += `• ${admin.phoneNumber}\n`;
				}
				response += `\n`;
			}

			if (operators.length > 0) {
				response += `*OPERATORS (${operators.length}):*\n`;
				for (const operator of operators) {
					response += `• ${operator.phoneNumber}\n`;
				}
				response += `\n`;
			}

			const regularUsers = users.filter(u => u.role === UserRole.USER);
			if (regularUsers.length > 0) {
				response += `*USERS (${regularUsers.length}):*\n`;
				// Show first 10 users only
				for (const user of regularUsers.slice(0, 10)) {
					response += `• ${user.phoneNumber}\n`;
				}
				if (regularUsers.length > 10) {
					response += `_...and ${regularUsers.length - 10} more_\n`;
				}
			}

			response += `\n*Total Users:* ${users.length}`;

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to list users');
			message.reply(`Error listing users: ${error.message}`);
		}
	}
};

const info: ICommandDefinition = {
	help: "<phoneNumber> - Show role and permissions for a user",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions (ADMIN or higher)
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser || !UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser?.role || 'NONE',
					action: 'VIEW_USER_INFO',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to view user info. This command requires ADMIN role or higher.");
				return;
			}

			if (!value || value.trim() === '') {
				message.reply("Please provide a phone number. Usage: !config role info <phoneNumber>");
				return;
			}

			const phoneNumber = value.trim();
			logger.debug({ chatId: message.from, targetPhone: phoneNumber }, 'Getting user info');

			const user = await UserRepository.findByPhoneNumber(phoneNumber);
			if (!user) {
				message.reply(`User not found: ${phoneNumber}`);
				return;
			}

			let response = `👤 *User Information*\n\n`;
			response += `📞 Phone: ${user.phoneNumber}\n`;
			response += `🎭 Role: ${user.role}\n`;
			response += `✅ Whitelisted: ${user.isWhitelisted ? 'Yes' : 'No'}\n`;
			response += `📅 Created: ${new Date(user.createdAt).toLocaleDateString()}\n\n`;

			response += `*Permissions:*\n`;

			if (user.role === UserRole.OWNER) {
				response += `• Full system access\n`;
				response += `• Manage all roles (OWNER, ADMIN, OPERATOR, USER)\n`;
				response += `• View and export audit logs\n`;
				response += `• View all statistics and costs\n`;
				response += `• Configure all bot settings\n`;
				response += `• Manage whitelist\n`;
			} else if (user.role === UserRole.ADMIN) {
				response += `• Manage OPERATOR and USER roles\n`;
				response += `• View audit logs (read-only)\n`;
				response += `• View all statistics and costs\n`;
				response += `• Configure all bot settings\n`;
				response += `• Manage whitelist\n`;
			} else if (user.role === UserRole.OPERATOR) {
				response += `• View personal usage statistics\n`;
				response += `• Limited config access (language, model)\n`;
				response += `• Handle customer inquiries\n`;
				response += `• Reset conversations\n`;
			} else {
				response += `• Chat with bot\n`;
				response += `• Reset own conversation\n`;
				response += `• No administrative access\n`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get user info');
			message.reply(`Error getting user info: ${error.message}`);
		}
	}
};

const promote: ICommandDefinition = {
	help: "<phoneNumber> <role> - Promote user to role (OWNER|ADMIN|OPERATOR|USER)",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser) {
				message.reply("❌ User not found.");
				return;
			}

			if (!value || value.trim() === '') {
				message.reply("Usage: !config role promote <phoneNumber> <role>\nValid roles: OWNER, ADMIN, OPERATOR, USER");
				return;
			}

			const parts = value.trim().split(/\s+/);
			if (parts.length !== 2) {
				message.reply("Usage: !config role promote <phoneNumber> <role>\nValid roles: OWNER, ADMIN, OPERATOR, USER");
				return;
			}

			const [phoneNumber, roleStr] = parts;
			const targetRole = roleStr.toUpperCase();

			// Validate role
			if (!['OWNER', 'ADMIN', 'OPERATOR', 'USER'].includes(targetRole)) {
				message.reply("Invalid role. Valid roles: OWNER, ADMIN, OPERATOR, USER");
				return;
			}

			// Get target user
			let targetUser = await UserRepository.findByPhoneNumber(phoneNumber);
			if (!targetUser) {
				// Create user if doesn't exist
				targetUser = await UserRepository.create({
					phoneNumber,
					role: UserRole.USER,
					isWhitelisted: true
				});
			}

			const oldRole = targetUser.role;

			// Check if requesting user has permission to promote to this role
			if (targetRole === 'OWNER' && requestingUser.role !== UserRole.OWNER) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser.role,
					action: 'PROMOTE_TO_OWNER',
					reason: 'Only OWNER can promote to OWNER role'
				});
				message.reply("❌ Only OWNER can promote users to OWNER role.");
				return;
			}

			if (targetRole === 'ADMIN' && !UserRepository.isOwner(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser.role,
					action: 'PROMOTE_TO_ADMIN',
					reason: 'Only OWNER can promote to ADMIN role'
				});
				message.reply("❌ Only OWNER can promote users to ADMIN role.");
				return;
			}

			if (!UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser.role,
					action: 'PROMOTE_USER',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to promote users. This command requires ADMIN role or higher.");
				return;
			}

			logger.info({
				chatId: message.from,
				targetPhone: phoneNumber,
				oldRole,
				newRole: targetRole
			}, 'Promoting user');

			// Promote user based on target role
			switch (targetRole) {
				case 'OWNER':
					targetUser = await UserRepository.promoteToOwner(targetUser.id, requestingUser);
					break;
				case 'ADMIN':
					targetUser = await UserRepository.promoteToAdmin(targetUser.id, requestingUser);
					break;
				case 'OPERATOR':
					targetUser = await UserRepository.promoteToOperator(targetUser.id, requestingUser);
					break;
				case 'USER':
					targetUser = await UserRepository.demoteToUser(targetUser.id, requestingUser);
					break;
			}

			let response = `✅ *Role Change Successful*\n\n`;
			response += `👤 User: ${phoneNumber}\n`;
			response += `📊 ${oldRole} → ${targetRole}\n`;
			response += `✏️ Changed by: ${requestingUser.phoneNumber}`;

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to promote user');
			message.reply(`Error promoting user: ${error.message}`);
		}
	}
};

const demote: ICommandDefinition = {
	help: "<phoneNumber> <role> - Demote user to role (ADMIN|OPERATOR|USER)",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser) {
				message.reply("❌ User not found.");
				return;
			}

			if (!value || value.trim() === '') {
				message.reply("Usage: !config role demote <phoneNumber> <role>\nValid roles: ADMIN, OPERATOR, USER");
				return;
			}

			const parts = value.trim().split(/\s+/);
			if (parts.length !== 2) {
				message.reply("Usage: !config role demote <phoneNumber> <role>\nValid roles: ADMIN, OPERATOR, USER");
				return;
			}

			const [phoneNumber, roleStr] = parts;
			const targetRole = roleStr.toUpperCase();

			// Validate role (cannot demote TO OWNER)
			if (!['ADMIN', 'OPERATOR', 'USER'].includes(targetRole)) {
				message.reply("Invalid role. Valid roles for demotion: ADMIN, OPERATOR, USER");
				return;
			}

			// Get target user
			const targetUser = await UserRepository.findByPhoneNumber(phoneNumber);
			if (!targetUser) {
				message.reply(`User not found: ${phoneNumber}`);
				return;
			}

			const oldRole = targetUser.role;

			// Cannot demote yourself
			if (targetUser.id === requestingUser.id) {
				message.reply("❌ You cannot demote yourself. Ask another admin or owner.");
				return;
			}

			// Check if requesting user has permission
			if (targetUser.role === UserRole.OWNER && requestingUser.role !== UserRole.OWNER) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser.role,
					action: 'DEMOTE_OWNER',
					reason: 'Only OWNER can demote OWNER role'
				});
				message.reply("❌ Only OWNER can demote other OWNERs.");
				return;
			}

			if (targetUser.role === UserRole.ADMIN && !UserRepository.isOwner(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser.role,
					action: 'DEMOTE_ADMIN',
					reason: 'Only OWNER can demote ADMIN role'
				});
				message.reply("❌ Only OWNER can demote ADMINs.");
				return;
			}

			if (!UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser.role,
					action: 'DEMOTE_USER',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to demote users. This command requires ADMIN role or higher.");
				return;
			}

			logger.info({
				chatId: message.from,
				targetPhone: phoneNumber,
				oldRole,
				newRole: targetRole
			}, 'Demoting user');

			// Update user role
			let updatedUser = targetUser;
			switch (targetRole) {
				case 'ADMIN':
					updatedUser = await UserRepository.promoteToAdmin(targetUser.id, requestingUser);
					break;
				case 'OPERATOR':
					updatedUser = await UserRepository.promoteToOperator(targetUser.id, requestingUser);
					break;
				case 'USER':
					updatedUser = await UserRepository.demoteToUser(targetUser.id, requestingUser);
					break;
			}

			let response = `✅ *Role Change Successful*\n\n`;
			response += `👤 User: ${phoneNumber}\n`;
			response += `📊 ${oldRole} → ${targetRole}\n`;
			response += `✏️ Changed by: ${requestingUser.phoneNumber}`;

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to demote user');
			message.reply(`Error demoting user: ${error.message}`);
		}
	}
};
