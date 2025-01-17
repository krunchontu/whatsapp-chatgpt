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

const handleTranslate = async (message: Message, value?: string) => {
    try {
        const userId = message.from;

        // Parse the optional number parameter
        let translateCount = 1; // Default to 1 message
        if (value) {
            const parsedCount = parseInt(value);
            if (isNaN(parsedCount) || parsedCount < 1) {
                message.reply("Please provide a valid positive number after the !translate command (e.g., !translate 5).");
                return;
            }
            translateCount = parsedCount;
        }

        // Rate limiting: allow only one translate per user per minute
        const currentTime = Date.now();
        const lastUsed = rateLimitMap[userId] || 0;
        const cooldown = 5 * 1000; // 5 seconds

        if (currentTime - lastUsed < cooldown) {
            const secondsLeft = Math.ceil((cooldown - (currentTime - lastUsed)) / 1000);
            message.reply(`Please wait ${secondsLeft} more second(s) before using the \`!translate\` command again.`);
            return;
        }

        // Update the rate limit map
        rateLimitMap[userId] = currentTime;

        cli.print(`[Translate] Received translate command from ${message.from}`);

        // Determine if the chat is self-noted
        const isSelfChat = message.from === message.to;

        cli.print(`[Translate] Is self-chat: ${isSelfChat}`);

        // Fetch more messages to ensure we retrieve the target message
        const chat = await message.getChat();
        const messages = await chat.fetchMessages({ limit: 50 });

        cli.print(`[Translate] Number of messages fetched: ${messages.length}`);
        cli.print(`[Translate] Current message ID: ${message.id.id}`);
        cli.print(`[Translate] Current message fromMe: ${message.fromMe}`);
        cli.print(`[Translate] Current message body: "${message.body}"`);

        // Log all fetched messages for debugging
        cli.print(`[Translate] Fetched ${messages.length} messages:`);
        messages.forEach((msg, index) => {
            cli.print(`  ${index + 1}. ID: ${msg.id.id}, fromMe: ${msg.fromMe}, Body: "${msg.body}"`);
        });

        // Find the index of the current translate command message
        const translateCommandIndex = messages.findIndex(msg => msg.id.id === message.id.id);
        if (translateCommandIndex === -1) {
            message.reply("Could not locate the translate command in message history.");
            return;
        }

        // Initialize array to store target messages
        const targetMessages: Message[] = [];

        // Start from the message after the translate command and collect the next N messages
        for (let i = translateCommandIndex + 1; i < messages.length; i++) {
            const msg = messages[i];

            // Skip any additional !translate commands to avoid recursion
            if (msg.body.trim().toLowerCase().startsWith("!translate")) {
                continue;
            }

            // Add message to target messages
            targetMessages.push(msg);

            // Stop if we have enough messages
            if (targetMessages.length >= translateCount) {
                break;
            }
        }

        cli.print(`[Translate] Target messages found: ${targetMessages.length}`);

        if (targetMessages.length === 0) {
            message.reply("There are no messages after the translate command to translate.");
            return;
        }

        // Check messages for media and collect texts
        const textsToTranslate = targetMessages
            .filter(msg => {
                if (msg.hasMedia) {
                    message.reply("One of the messages contains media and cannot be translated. Please send text messages to translate.");
                    return false;
                }
                return true;
            })
            .map(msg => msg.body?.trim())
            .filter(text => text && !text.toLowerCase().startsWith("!translate"));

        if (textsToTranslate.length === 0) {
            message.reply("The previous messages are empty or not text.");
            return;
        }

        cli.print(`[Translate] Translating ${textsToTranslate.length} messages`);

        // Construct the prompt for translation
        const prompt = `Translate the following ${textsToTranslate.length} messages to English:\n\n` +
            textsToTranslate.map((text, index) => `${index + 1}. ${text}`).join("\n");

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

        // Reply with the translated text(s)
        const translatedMessages = response.split("\n");
        const replyText = translatedMessages
            .map((msg, index) => `Message ${index + 1}:\n${msg}`)
            .join("\n\n");
            
        message.reply(replyText);
    } catch (error: any) {
        // Differentiate between different error types
        if (error.response) {
            cli.print(`[Translate] API Error Response: ${JSON.stringify(error.response.data)}`);
            cli.print(`[Translate] API Status: ${error.response.status}`);
            cli.print(`[Translate] API Headers: ${JSON.stringify(error.response.headers)}`);
            
            if (error.response.status === 429) {
                message.reply("Translation service is currently overloaded. Please try again later.");
            } else if (error.response.status >= 500) {
                message.reply("Translation service is experiencing issues. Please try again later.");
            } else {
                message.reply("An error occurred with the translation service. Please try again later.");
            }
        } else {
            console.error("[Translate] An error occurred:", error);
            cli.print(`[Translate] Error details: ${error.message}`);
            cli.print(`[Translate] Stack trace: ${error.stack}`);
            cli.print(`[Translate] Full error: ${JSON.stringify(error)}`);
            message.reply("An unexpected error occurred while translating the message. Please try again later.");
        }
    }
};

export { handleTranslate };
