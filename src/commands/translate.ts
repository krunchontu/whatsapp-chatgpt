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
    execute: async function (message: Message, value?: string) {
        try {
            await handleTranslate(message, value);
        } catch (error: any) {
            console.error("[Translate Command] Error:", error);
            message.reply("Failed to process translation command. Please try again.");
        }
    }
};
