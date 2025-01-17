import { Message } from "whatsapp-web.js";
import config from "../config";
import { chatCompletion } from "../providers/openai";
import * as cli from "../cli/ui";

/**
 * Handles the !translate command to translate the last message to English.
 * @param message - The WhatsApp message that triggered the command.
 */
const handleTranslate = async (message: Message) => {
    try {
        cli.print(`[Translate] Received translate command from ${message.from}`);

        cli.print(`[Translate] Received translate command from ${message.from}`);

        // Determine if the chat is self-noted
        const isSelfChat = message.from === message.to;

        cli.print(`[Translate] Is self-chat: ${isSelfChat}`);

        // Fetch more messages to ensure we retrieve the target message
        const chat = await message.getChat();
        const messages = await chat.fetchMessages({ limit: 10 });

        cli.print(`[Translate] Number of messages fetched: ${messages.length}`);

        // Filter messages based on chat type
        let targetMessage;
        if (isSelfChat) {
            // In self-chat, 'fromMe' indicates user-sent messages
            targetMessage = messages.find(msg => msg.id.fromMe === true && msg.id.id !== message.id.id);
        } else {
            // In regular chats, 'fromMe === false' indicates messages from others
            targetMessage = messages.find(msg => msg.id.fromMe === false);
        }

        cli.print(`[Translate] Target message found: ${targetMessage ? "Yes" : "No"}`);

        if (!targetMessage) {
            message.reply("There is no previous message to translate.");
            return;
        }

        const textToTranslate = targetMessage.body;

        if (!textToTranslate) {
            message.reply("The previous message is empty or not text.");
            return;
        }

        cli.print(`[Translate] Translating text: ${textToTranslate}`);

        // Construct the prompt for translation
        const prompt = `Translate the following text to English:\n\n${textToTranslate}`;

        // Request translation from OpenAI
        const response = await chatCompletion(
            [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that translates text to English.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            {
                model: config.openAIModel,
                temperature: 0
            }
        );

        if (!response || !response.trim()) {
            message.reply("Translation failed. Please try again later.");
            return;
        }

        cli.print(`[Translate] Translated text: ${response}`);

        // Reply with the translated text
        message.reply(response);
    } catch (error: any) {
        console.error("[Translate] An error occurred:", error);
        cli.print(`[Translate] Error details: ${error.message}`);
        cli.print(`[Translate] Stack trace: ${error.stack}`);
        message.reply("An error occurred while translating the message. Please try again later.");
    }
};

export { handleTranslate };
