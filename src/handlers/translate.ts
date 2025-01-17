import { Message } from "whatsapp-web.js";
import config from "../config";
import { chatCompletion } from "../providers/openai";
import * as cli from "../cli/ui";

/**
 * Handles the !translate command to translate the last message to English.
 * @param message - The WhatsApp message that triggered the command.
 */
// Simple in-memory rate limiter (reset every minute)
const rateLimitMap: { [key: string]: number } = {}; // Maps user ID to timestamp

const handleTranslate = async (message: Message) => {
    try {
        const userId = message.from;

        // Rate limiting: allow only one translate per user per minute
        const currentTime = Date.now();
        const lastUsed = rateLimitMap[userId] || 0;
        const cooldown = 60 * 1000; // 1 minute

        if (currentTime - lastUsed < cooldown) {
            const secondsLeft = Math.ceil((cooldown - (currentTime - lastUsed)) / 1000);
            message.reply(`Please wait ${secondsLeft} more second(s) before using the \`!translate\` command again.`);
            return;
        }

        // Update the rate limit map
        rateLimitMap[userId] = currentTime;

        cli.print(`[Translate] Received translate command from ${message.from}`);

        cli.print(`[Translate] Received translate command from ${message.from}`);

        // Determine if the chat is self-noted
        const isSelfChat = message.from === message.to;

        cli.print(`[Translate] Is self-chat: ${isSelfChat}`);

        // Fetch more messages to ensure we retrieve the target message
        const chat = await message.getChat();
        const messages = await chat.fetchMessages({ limit: 10 });

        cli.print(`[Translate] Number of messages fetched: ${messages.length}`);

        // Log all fetched messages for debugging
        cli.print(`[Translate] Fetched ${messages.length} messages:`);
        messages.forEach((msg, index) => {
            cli.print(`  ${index + 1}. ID: ${msg.id.id}, fromMe: ${msg.fromMe}, Body: "${msg.body}"`);
        });

        // Initialize targetMessage as null
        let targetMessage: Message | undefined = undefined;

        if (isSelfChat) {
            // In self-chat, find the most recent message sent by the user excluding the current command
            targetMessage = messages.find(msg => msg.fromMe === true && msg.id.id !== message.id.id);
        } else {
            // In regular chats, find the most recent message not sent by the bot
            targetMessage = messages.find(msg => msg.fromMe === false);
        }

        cli.print(`[Translate] Target message found: ${targetMessage ? "Yes" : "No"}`);

        if (!targetMessage) {
            message.reply("There is no previous message to translate.");
            return;
        }

        const textToTranslate = targetMessage.body;

        // Check if the message has media
        if (targetMessage.hasMedia) {
            message.reply("The previous message contains media and cannot be translated. Please send a text message to translate.");
            return;
        }

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
            message.reply("Translation failed. The OpenAI response was empty. Please try again later.");
            return;
        }

        cli.print(`[Translate] Translated text: ${response}`);

        // Reply with the translated text
        message.reply(response);
    } catch (error: any) {
        // Differentiate between different error types
        if (error.response && error.response.status === 429) {
            message.reply("Translation service is currently overloaded. Please try again later.");
        } else if (error.response && error.response.status >= 500) {
            message.reply("Translation service is experiencing issues. Please try again later.");
        } else {
            console.error("[Translate] An error occurred:", error);
            cli.print(`[Translate] Error details: ${error.message}`);
            cli.print(`[Translate] Stack trace: ${error.stack}`);
            message.reply("An unexpected error occurred while translating the message. Please try again later.");
        }
    }
};

export { handleTranslate };
