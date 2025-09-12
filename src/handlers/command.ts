import { Message } from "whatsapp-web.js";
import config from "../config";
import { startsWithIgnoreCase } from "../utils";
import { handleDeleteConversation } from "./ai-config";
import { handleMessageGPT } from "./gpt";
import { handleMessageDALLE } from "./dalle";
import { handleMessageAIConfig, executeCommand } from "./ai-config";
import { handleMessageLangChain } from "./langchain";

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

	if (startsWithIgnoreCase(messageString, config.langChainPrefix)) {
		const prompt = messageString.substring(config.langChainPrefix.length + 1);
		await handleMessageLangChain(message, prompt);
		return;
	}

	if (startsWithIgnoreCase(messageString, config.dallePrefix)) {
		const prompt = messageString.substring(config.dallePrefix.length + 1);
		await handleMessageDALLE(message, prompt);
		return;
	}

	if (startsWithIgnoreCase(messageString, config.stableDiffusionPrefix)) {
		const prompt = messageString.substring(config.stableDiffusionPrefix.length + 1);
		await executeCommand("sd", "generate", message, prompt);
		return;
	}

	if (!config.prefixEnabled || (config.prefixSkippedForMe && selfNotedMessage)) {
		await handleMessageGPT(message, messageString);
	}
}

export { dispatchCommand };
