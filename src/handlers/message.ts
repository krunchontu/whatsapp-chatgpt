import { Message } from "whatsapp-web.js";

import config from "../config";
import * as cli from "../cli/ui";
import { handleMessageGPT } from "./gpt";
import { getConfig } from "./ai-config";
import { shouldIgnoreByTimestamp } from "./timestamp";
import { transcribeMedia } from "./transcription";
import { dispatchCommand } from "./command";

async function handleIncomingMessage(message: Message) {
	const messageString = message.body;

	if (shouldIgnoreByTimestamp(message)) return;

	if ((await message.getChat()).isGroup && !config.groupchatsEnabled) return;

	const selfNotedMessage = message.fromMe && message.hasQuotedMsg === false && message.from === message.to;

	if (config.whitelistedEnabled) {
		const whitelistedPhoneNumbers = getConfig("general", "whitelist");
		if (!selfNotedMessage && whitelistedPhoneNumbers.length > 0 && !whitelistedPhoneNumbers.includes(message.from)) {
			cli.print(`Ignoring message from ${message.from} because it is not whitelisted.`);
			return;
		}
	}

	const transcribedText = await transcribeMedia(message);
	if (transcribedText) {
		await handleMessageGPT(message, transcribedText);
		return;
	}

	await dispatchCommand(message, messageString, selfNotedMessage);
}

export { handleIncomingMessage };
