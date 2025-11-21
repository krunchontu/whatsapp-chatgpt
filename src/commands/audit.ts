/**
 * Audit Commands Module
 *
 * Purpose: Admin commands for viewing and exporting audit logs
 * Pattern: Command module for AI config system
 *
 * Usage:
 *   !config audit list [days]          - View recent audit logs (default: 7 days)
 *   !config audit user <phoneNumber>   - View audit logs for specific user
 *   !config audit category <category>  - Filter by category (AUTH|CONFIG|ADMIN|SECURITY)
 *   !config audit export [days]        - Export audit logs as JSON (OWNER only)
 */

import { ICommandModule, ICommandDefinition, ICommandsMap } from "../types/commands";
import { Message } from "whatsapp-web.js";
import { AuditLogRepository, AuditCategory } from "../db/repositories/auditLog.repository";
import { UserRepository } from "../db/repositories/user.repository";
import { AuditLogger } from "../services/auditLogger";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'commands:audit' });

export const AuditModule: ICommandModule = {
	key: "audit",
	register: (): ICommandsMap => {
		return {
			list,
			user: userLogs,
			category,
			export: exportLogs
		};
	}
};

const list: ICommandDefinition = {
	help: "[days] - View recent audit logs (default: 7 days)",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions (ADMIN or higher)
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser || !UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser?.role || 'NONE',
					action: 'VIEW_AUDIT_LOGS',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to view audit logs. This command requires ADMIN role or higher.");
				return;
			}

			const days = value ? parseInt(value) : 7;
			if (isNaN(days) || days < 1 || days > 365) {
				message.reply("Invalid number of days. Please provide a number between 1 and 365.");
				return;
			}

			logger.debug({ chatId: message.from, days }, 'Fetching audit logs');

			const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
			const logs = await AuditLogRepository.query({
				startDate,
				limit: 20 // Show last 20 logs
			});

			// Log this audit log access
			await AuditLogger.logAuditLogViewed({
				user: requestingUser,
				filters: { startDate, limit: 20 }
			});

			if (logs.length === 0) {
				message.reply(`No audit logs found for the last ${days} days.`);
				return;
			}

			let response = `📋 *Audit Logs (${days} days) - Last ${logs.length} entries*\n\n`;

			for (const log of logs.slice(0, 10)) {
				const date = new Date(log.createdAt).toLocaleString();
				response += `*${log.action}* - ${log.category}\n`;
				response += `📅 ${date}\n`;
				response += `👤 ${log.phoneNumber} (${log.userRole})\n`;
				response += `📝 ${log.description}\n`;
				response += `---\n`;
			}

			if (logs.length > 10) {
				response += `\n_Showing 10 of ${logs.length} logs. Use filters for more specific results._`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get audit logs');
			message.reply(`Error fetching audit logs: ${error.message}`);
		}
	}
};

const userLogs: ICommandDefinition = {
	help: "<phoneNumber> - View audit logs for specific user",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions (ADMIN or higher)
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser || !UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser?.role || 'NONE',
					action: 'VIEW_AUDIT_LOGS',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to view audit logs. This command requires ADMIN role or higher.");
				return;
			}

			if (!value || value.trim() === '') {
				message.reply("Please provide a phone number. Usage: !config audit user <phoneNumber>");
				return;
			}

			const phoneNumber = value.trim();
			logger.debug({ chatId: message.from, targetPhone: phoneNumber }, 'Fetching user audit logs');

			const logs = await AuditLogRepository.findByPhoneNumber(phoneNumber, 20);

			// Log this audit log access
			await AuditLogger.logAuditLogViewed({
				user: requestingUser,
				filters: { phoneNumber, limit: 20 }
			});

			if (logs.length === 0) {
				message.reply(`No audit logs found for ${phoneNumber}.`);
				return;
			}

			let response = `📋 *Audit Logs for ${phoneNumber}*\n`;
			response += `Found ${logs.length} entries\n\n`;

			for (const log of logs.slice(0, 10)) {
				const date = new Date(log.createdAt).toLocaleString();
				response += `*${log.action}* - ${log.category}\n`;
				response += `📅 ${date}\n`;
				response += `📝 ${log.description}\n`;
				response += `---\n`;
			}

			if (logs.length > 10) {
				response += `\n_Showing 10 of ${logs.length} logs._`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get user audit logs');
			message.reply(`Error fetching user audit logs: ${error.message}`);
		}
	}
};

const category: ICommandDefinition = {
	help: "<category> - Filter by category (AUTH|CONFIG|ADMIN|SECURITY)",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions (ADMIN or higher)
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser || !UserRepository.isAdmin(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser?.role || 'NONE',
					action: 'VIEW_AUDIT_LOGS',
					reason: 'Requires ADMIN role or higher'
				});
				message.reply("❌ You don't have permission to view audit logs. This command requires ADMIN role or higher.");
				return;
			}

			if (!value || value.trim() === '') {
				message.reply("Please provide a category. Valid categories: AUTH, CONFIG, ADMIN, SECURITY");
				return;
			}

			const categoryValue = value.trim().toUpperCase();
			if (!['AUTH', 'CONFIG', 'ADMIN', 'SECURITY'].includes(categoryValue)) {
				message.reply("Invalid category. Valid categories: AUTH, CONFIG, ADMIN, SECURITY");
				return;
			}

			logger.debug({ chatId: message.from, category: categoryValue }, 'Fetching audit logs by category');

			const logs = await AuditLogRepository.findByCategory(categoryValue as AuditCategory, 20);

			// Log this audit log access
			await AuditLogger.logAuditLogViewed({
				user: requestingUser,
				filters: { category: categoryValue, limit: 20 }
			});

			if (logs.length === 0) {
				message.reply(`No audit logs found for category: ${categoryValue}`);
				return;
			}

			let response = `📋 *Audit Logs - ${categoryValue} Category*\n`;
			response += `Found ${logs.length} entries\n\n`;

			for (const log of logs.slice(0, 10)) {
				const date = new Date(log.createdAt).toLocaleString();
				response += `*${log.action}*\n`;
				response += `📅 ${date}\n`;
				response += `👤 ${log.phoneNumber} (${log.userRole})\n`;
				response += `📝 ${log.description}\n`;
				response += `---\n`;
			}

			if (logs.length > 10) {
				response += `\n_Showing 10 of ${logs.length} logs._`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get audit logs by category');
			message.reply(`Error fetching audit logs: ${error.message}`);
		}
	}
};

const exportLogs: ICommandDefinition = {
	help: "[days] - Export audit logs as JSON (OWNER only)",
	execute: async function (message: Message, value?: string) {
		try {
			// Check permissions (OWNER only)
			const requestingUser = await UserRepository.findByPhoneNumber(message.from);
			if (!requestingUser || !UserRepository.isOwner(requestingUser)) {
				await AuditLogger.logPermissionDenied({
					phoneNumber: message.from,
					userRole: requestingUser?.role || 'NONE',
					action: 'EXPORT_AUDIT_LOGS',
					reason: 'Requires OWNER role'
				});
				message.reply("❌ You don't have permission to export audit logs. This command requires OWNER role.");
				return;
			}

			const days = value ? parseInt(value) : 30;
			if (isNaN(days) || days < 1 || days > 365) {
				message.reply("Invalid number of days. Please provide a number between 1 and 365.");
				return;
			}

			logger.info({ chatId: message.from, days }, 'Exporting audit logs');

			const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

			message.reply(`📦 Exporting audit logs for the last ${days} days... This may take a moment.`);

			const jsonData = await AuditLogRepository.exportToJSON({
				startDate
			});

			// Log the export
			await AuditLogger.logAuditLogExported({
				user: requestingUser,
				format: 'JSON',
				recordCount: JSON.parse(jsonData).length,
				dateRange: `${days} days`
			});

			// In a real implementation, you would upload this to cloud storage and send a link
			// For now, we'll just send a truncated preview
			const logs = JSON.parse(jsonData);
			const preview = JSON.stringify(logs.slice(0, 5), null, 2);

			let response = `✅ *Audit Log Export Complete*\n\n`;
			response += `📊 Total Records: ${logs.length}\n`;
			response += `📅 Date Range: Last ${days} days\n\n`;
			response += `_Preview (first 5 records):_\n`;
			response += `\`\`\`json\n${preview.substring(0, 500)}...\n\`\`\`\n\n`;
			response += `_Full export contains ${logs.length} records. In production, this would be uploaded to cloud storage._`;

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to export audit logs');
			message.reply(`Error exporting audit logs: ${error.message}`);
		}
	}
};
