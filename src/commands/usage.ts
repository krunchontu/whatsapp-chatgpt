/**
 * Usage Commands Module
 *
 * Purpose: Admin commands for viewing usage statistics and costs
 * Pattern: Command module for AI config system
 *
 * Usage:
 *   !config usage stats [days]     - View global usage stats for last N days (default: 7)
 *   !config usage user <days>      - View personal usage stats for last N days (default: 7)
 *   !config usage daily           - View today's usage and cost
 *   !config usage cost            - View current daily cost
 */

import { ICommandModule, ICommandDefinition, ICommandsMap } from "../types/commands";
import { Message } from "whatsapp-web.js";
import { UsageRepository } from "../db/repositories/usage.repository";
import { UserRepository } from "../db/repositories/user.repository";
import { CostMonitor } from "../services/costMonitor";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'commands:usage' });

export const UsageModule: ICommandModule = {
	key: "usage",
	register: (): ICommandsMap => {
		return {
			stats,
			user,
			daily,
			cost
		};
	}
};

const stats: ICommandDefinition = {
	help: "<days> - View global usage statistics for last N days (default: 7)",
	execute: async function (message: Message, value?: string) {
		try {
			const days = value ? parseInt(value) : 7;
			if (isNaN(days) || days < 1 || days > 365) {
				message.reply("Invalid number of days. Please provide a number between 1 and 365.");
				return;
			}

			logger.debug({ chatId: message.from, days }, 'Fetching global usage stats');

			const stats = await UsageRepository.getGlobalStats(days);

			let response = `📊 *Global Usage Statistics (${days} days)*\n\n`;
			response += `👥 Unique Users: ${stats.uniqueUsers}\n`;
			response += `📨 Total Requests: ${stats.totalRequests}\n`;
			response += `🎯 Total Tokens: ${stats.totalTokens.toLocaleString()}\n`;
			response += `💰 Total Cost: $${stats.totalCostUsd.toFixed(4)}\n`;
			response += `💵 Avg Cost/User: $${stats.averageCostPerUserUsd.toFixed(4)}\n\n`;

			response += `*By Operation:*\n`;
			for (const [op, data] of Object.entries(stats.byOperation)) {
				const costUsd = UsageRepository.microToUsd(data.costMicros);
				response += `• ${op}: ${data.requests} requests, ${data.tokens.toLocaleString()} tokens, $${costUsd.toFixed(4)}\n`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get global stats');
			message.reply(`Error fetching statistics: ${error.message}`);
		}
	}
};

const user: ICommandDefinition = {
	help: "<days> - View your personal usage statistics for last N days (default: 7)",
	execute: async function (message: Message, value?: string) {
		try {
			const days = value ? parseInt(value) : 7;
			if (isNaN(days) || days < 1 || days > 365) {
				message.reply("Invalid number of days. Please provide a number between 1 and 365.");
				return;
			}

			// Get user
			const user = await UserRepository.findByPhoneNumber(message.from);
			if (!user) {
				message.reply("No usage data found for your account.");
				return;
			}

			logger.debug({ chatId: message.from, userId: user.id, days }, 'Fetching user usage stats');

			const stats = await UsageRepository.getUserStats(user.id, days);

			let response = `📊 *Your Usage Statistics (${days} days)*\n\n`;
			response += `📨 Total Requests: ${stats.totalRequests}\n`;
			response += `🎯 Total Tokens: ${stats.totalTokens.toLocaleString()}\n`;
			response += `💰 Total Cost: $${stats.totalCostUsd.toFixed(4)}\n`;
			response += `💵 Avg Cost/Request: $${stats.averageCostPerRequestUsd.toFixed(4)}\n\n`;

			response += `*By Operation:*\n`;
			for (const [op, data] of Object.entries(stats.byOperation)) {
				const costUsd = UsageRepository.microToUsd(data.costMicros);
				response += `• ${op}: ${data.requests} requests, $${costUsd.toFixed(4)}\n`;
			}

			response += `\n*By Model:*\n`;
			for (const [model, data] of Object.entries(stats.byModel)) {
				const costUsd = UsageRepository.microToUsd(data.costMicros);
				response += `• ${model}: ${data.requests} requests, $${costUsd.toFixed(4)}\n`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get user stats');
			message.reply(`Error fetching your statistics: ${error.message}`);
		}
	}
};

const daily: ICommandDefinition = {
	help: "- View today's global usage and cost",
	execute: async function (message: Message) {
		try {
			logger.debug({ chatId: message.from }, 'Fetching daily usage');

			const dailyTotal = await UsageRepository.getGlobalDailyTotal();

			let response = `📅 *Today's Usage Summary*\n\n`;
			response += `📨 Total Requests: ${dailyTotal.totalRequests}\n`;
			response += `🎯 Total Tokens: ${dailyTotal.totalTokens.toLocaleString()}\n`;
			response += `💰 Total Cost: $${dailyTotal.totalCostUsd.toFixed(4)}\n\n`;

			response += `*By Operation:*\n`;
			for (const [op, data] of Object.entries(dailyTotal.operations)) {
				const costUsd = UsageRepository.microToUsd(data.costMicros);
				response += `• ${op}: ${data.requests} requests, $${costUsd.toFixed(4)}\n`;
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get daily usage');
			message.reply(`Error fetching daily usage: ${error.message}`);
		}
	}
};

const cost: ICommandDefinition = {
	help: "- View current daily cost",
	execute: async function (message: Message) {
		try {
			logger.debug({ chatId: message.from }, 'Fetching current daily cost');

			const currentCost = await CostMonitor.getCurrentDailyCost();

			let response = `💰 *Current Daily Cost*\n\n`;
			response += `Today's Cost: $${currentCost.toFixed(4)}\n`;

			// Add threshold info if enabled
			const { config } = await import('../config');
			if (config.costAlertEnabled) {
				const threshold = config.costAlertThresholdUsd;
				const percentUsed = (currentCost / threshold) * 100;
				response += `Alert Threshold: $${threshold.toFixed(2)}\n`;
				response += `Usage: ${percentUsed.toFixed(1)}%\n`;

				if (currentCost >= threshold) {
					response += `\n⚠️ *ALERT: Daily cost threshold exceeded!*`;
				} else if (percentUsed >= 80) {
					response += `\n⚠️ Warning: Approaching threshold (${percentUsed.toFixed(0)}%)`;
				}
			}

			message.reply(response);
		} catch (error: any) {
			logger.error({ err: error, chatId: message.from }, 'Failed to get current cost');
			message.reply(`Error fetching current cost: ${error.message}`);
		}
	}
};
