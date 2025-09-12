import { ICommandModule, ICommandDefinition, ICommandsMap } from "../types/commands";
import { Message } from "whatsapp-web.js";
import { handleTranslate } from "../handlers/translate";

/**
 * TranslateModule handles the !translate command.
 */
export const TranslateModule: ICommandModule = {
	key: "translate",
	register: (): ICommandsMap => {
		return {
			translate
		};
	}
};

/**
 * Definition of the !translate command.
 */
const translate: ICommandDefinition = {
	help: "!translate [number] - Translate the last [number] messages in this chat to English (default: 1)",
	execute: async function (message: Message) {
		try {
			// Split the message body by spaces to extract arguments
			const args = message.body.trim().split(/\s+/);

			// Extract the numerical value if provided
			const value = args[1]; // This should be the number after '!translate'

			// Pass the extracted value to the handler
			await handleTranslate(message, value);
		} catch (error: any) {
			console.error("[Translate Command] Error:", error);
			message.reply("Failed to process translation command. Please try again.");
		}
	}
};
