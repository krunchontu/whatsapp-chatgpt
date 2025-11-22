import { Message } from "whatsapp-web.js";
import config from "../config";
import { startsWithIgnoreCase } from "../utils";
import { handleDeleteConversation } from "./gpt";
import { handleMessageGPT } from "./gpt";
import { handleMessageAIConfig, executeCommand } from "./ai-config";

async function dispatchCommand(message: Message, messageString: string, selfNotedMessage: boolean): Promise<void> {
	if (startsWithIgnoreCase(messageString, config.resetPrefix)) {
		await handleDeleteConversation(message);
		return;
	}

	if (startsWithIgnoreCase(messageString, config.aiConfigPrefix)) {
		const prompt = messageString.substring(config.aiConfigPrefix.length + 1);
		await handleMessageAIConfig(message, prompt);
		return;
	}

	if (startsWithIgnoreCase(messageString, "!translate")) {
		await executeCommand("translate", "translate", message);
		return;
	}

	if (startsWithIgnoreCase(messageString, config.gptPrefix)) {
		const prompt = messageString.substring(config.gptPrefix.length + 1);
		await handleMessageGPT(message, prompt);
		return;
	}

	// Note: DALL-E, LangChain, and Stable Diffusion are deferred to v2 (see MVP_PLAN.md)
	// Removed to reduce complexity and focus on core customer service features

	if (!config.prefixEnabled || (config.prefixSkippedForMe && selfNotedMessage)) {
		await handleMessageGPT(message, messageString);
	}
}

export { dispatchCommand };
