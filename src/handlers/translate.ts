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

        // Fetch the chat to retrieve message history
        const chat = await message.getChat();
        const messages = await chat.fetchMessages({ limit: 2 });

        if (messages.length < 2) {
            message.reply("There is no previous message to translate.");
            return;
        }

        // Identify the last message sent before the !translate command
        const lastMessage = messages.find(msg => msg.id.fromMe === false);

        if (!lastMessage) {
            message.reply("There is no previous message to translate.");
            return;
        }

        const textToTranslate = lastMessage.body;

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
        message.reply("An error occurred while translating the message.");
    }
};

export { handleTranslate };
