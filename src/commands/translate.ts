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
    help: "!translate - Translate the last message in this chat to English",
    execute: async function (message: Message) {
        try {
            await handleTranslate(message);
        } catch (error: any) {
            console.error("[Translate Command] Error:", error);
            message.reply("Failed to process translation command. Please try again.");
        }
    }
};
