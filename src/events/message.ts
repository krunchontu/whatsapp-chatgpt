import { Message } from "whatsapp-web.js";
import constants from "../constants";
import { handleIncomingMessage } from "../handlers/message";
import { asyncHandler } from "../middleware/errorHandler";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'events:message' });

async function onMessageReceived(message: Message) {
	if (message.from == constants.statusBroadcast) {
		logger.debug({ from: message.from }, 'Ignoring status broadcast message');
		return;
	}
	if (message.hasQuotedMsg) {
		logger.debug({ messageId: message.id._serialized }, 'Ignoring quoted message');
		return;
	}

	logger.debug({
		from: message.from,
		messageId: message.id._serialized,
		hasMedia: message.hasMedia
	}, 'Message received');

	await handleIncomingMessage(message);
}

async function onMessageCreate(message: Message) {
	if (message.from == constants.statusBroadcast) {
		logger.debug({ from: message.from }, 'Ignoring status broadcast message');
		return;
	}
	if (message.hasQuotedMsg) {
		logger.debug({ messageId: message.id._serialized }, 'Ignoring quoted message');
		return;
	}
	if (!message.fromMe) {
		logger.debug({ messageId: message.id._serialized }, 'Ignoring message not from self');
		return;
	}

	logger.debug({
		from: message.from,
		messageId: message.id._serialized,
		hasMedia: message.hasMedia
	}, 'Self-message created');

	await handleIncomingMessage(message);
}

// Wrap handlers with error handling
const wrappedOnMessageReceived = asyncHandler(onMessageReceived);
const wrappedOnMessageCreate = asyncHandler(onMessageCreate);

export { wrappedOnMessageReceived as onMessageReceived, wrappedOnMessageCreate as onMessageCreate };
