import { Message } from "whatsapp-web.js";

import config from "../config";
import * as cli from "../cli/ui";
import { handleMessageGPT } from "./gpt";
import { getConfig } from "./ai-config";
import { shouldIgnoreByTimestamp } from "./timestamp";
import { transcribeMedia } from "./transcription";
import { dispatchCommand } from "./command";
import { createChildLogger } from "../lib/logger";
import { checkRateLimit } from "../middleware/rateLimiter";
import { RateLimitError } from "../lib/errors/RateLimitError";

const logger = createChildLogger({ module: 'handlers:message' });

async function handleIncomingMessage(message: Message) {
	const messageString = message.body;

	logger.debug({
		from: message.from,
		messageId: message.id._serialized,
		bodyLength: messageString?.length || 0
	}, 'Processing incoming message');

	// Check timestamp
	if (shouldIgnoreByTimestamp(message)) {
		logger.debug({ messageId: message.id._serialized }, 'Ignoring old message by timestamp');
		return;
	}

	// Check rate limits (before processing message)
	try {
		await checkRateLimit(message);
	} catch (error) {
		if (error instanceof RateLimitError) {
			// Send rate limit message to user
			await message.reply(error.toUserMessage());
			logger.info({
				from: message.from,
				limit: error.limit,
				retryAfter: error.retryAfter
			}, 'Rate limit exceeded, message rejected');
			return;
		}
		// Re-throw other errors
		throw error;
	}

	// Check group chat settings
	const chat = await message.getChat();
	if (chat.isGroup && !config.groupchatsEnabled) {
		logger.debug({
			chatId: chat.id._serialized,
			chatName: chat.name
		}, 'Ignoring group chat message (group chats disabled)');
		return;
	}

	const selfNotedMessage = message.fromMe && message.hasQuotedMsg === false && message.from === message.to;

	// Check whitelist
	if (config.whitelistedEnabled) {
		const whitelistedPhoneNumbers = getConfig("general", "whitelist");
		if (!selfNotedMessage && whitelistedPhoneNumbers.length > 0 && !whitelistedPhoneNumbers.includes(message.from)) {
			logger.info({
				from: message.from,
				whitelistCount: whitelistedPhoneNumbers.length
			}, 'Ignoring non-whitelisted message');
			cli.print(`Ignoring message from ${message.from} because it is not whitelisted.`);
			return;
		}
	}

	// Try transcription first
	const transcribedText = await transcribeMedia(message);
	if (transcribedText) {
		logger.info({
			from: message.from,
			transcriptionLength: transcribedText.length
		}, 'Voice message transcribed successfully');
		await handleMessageGPT(message, transcribedText);
		return;
	}

	// Dispatch to command handler
	await dispatchCommand(message, messageString, selfNotedMessage);
}

export { handleIncomingMessage };
