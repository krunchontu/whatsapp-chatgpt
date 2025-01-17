import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Message, MessageMedia } from "whatsapp-web.js";
import { convertMediaToBase64, isImageMedia } from "../utils";
import { chatCompletion } from "../providers/openai";
import * as cli from "../cli/ui";
import config from "../config";

// TTS
import { ttsRequest as speechTTSRequest } from "../providers/speech";
import { ttsRequest as awsTTSRequest } from "../providers/aws";
import { TTSMode } from "../types/tts-mode";

// Moderation
import { moderateIncomingPrompt } from "./moderation";
import { aiConfig, getConfig } from "./ai-config";

const handleMessageGPT = async (message: Message, prompt: string) => {
    try {
        cli.print(`[GPT] Received prompt from ${message.from}: ${prompt}`);

        // Check for media attachments
        console.log('[DEBUG] Checking for media attachments...');
        const media = await message.downloadMedia();
        const hasImage = media && isImageMedia(media);
        
        console.log(`[DEBUG] Media found: ${!!media}`);
        console.log(`[DEBUG] Is image: ${hasImage}`);
        if (media) {
            console.log(`[DEBUG] Media type: ${media.mimetype}`);
            console.log(`[DEBUG] Media size: ${media.data.length} bytes`);
        }

        // Prompt Moderation
        if (config.promptModerationEnabled) {
            try {
                console.log('[DEBUG] Running prompt moderation...');
                await moderateIncomingPrompt(prompt);
            } catch (error: any) {
                console.error('[DEBUG] Prompt moderation failed:', error);
                message.reply(error.message);
                return;
            }
        }

        const start = Date.now();

        // Build messages array
        const messages = [];
        
        // Add system prompt if configured
        if (config.prePrompt?.trim()) {
            console.log('[DEBUG] Adding system prompt');
            messages.push({
                role: 'system',
                content: config.prePrompt
            });
        }

        // Add user message with optional image
        const content: Array<any> = [];
        
        if (prompt) {
            console.log('[DEBUG] Adding text prompt:', prompt);
            content.push({ type: 'text', text: prompt });
        }

        if (hasImage) {
            console.log('[DEBUG] Processing image...');
            try {
                const base64Image = await convertMediaToBase64(media);
                console.log('[DEBUG] Image converted to base64, length:', base64Image.length);
                
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: base64Image,
                        detail: config.visionDetailLevel
                    }
                });
                console.log('[DEBUG] Image added to content with detail level:', config.visionDetailLevel);
            } catch (error) {
                console.error('[DEBUG] Image processing failed:', error);
                throw new Error('Failed to process image');
            }
        }

        messages.push({
            role: 'user',
            content: content
        });

        console.log('[DEBUG] Final messages array:', JSON.stringify(messages, null, 2));

        // Get response from OpenAI
        console.log('[DEBUG] Sending request to OpenAI...');
        const response = await chatCompletion(messages, {
            model: config.visionEnabled && hasImage ? config.visionModel : config.openAIModel,
            temperature: 0.7
        });

        const end = Date.now() - start;
        console.log(`[DEBUG] OpenAI response received in ${end}ms`);

        cli.print(`[GPT] Answer to ${message.from}: ${response}  | OpenAI request took ${end}ms)`);

        // TTS reply (Default: disabled)
        if (getConfig("tts", "enabled")) {
            console.log('[DEBUG] Sending TTS reply...');
            sendVoiceMessageReply(message, response);
            message.reply(response);
            return;
        }

        // Default: Text reply
        console.log('[DEBUG] Sending text reply...');
        message.reply(response);
    } catch (error: any) {
        console.error("[DEBUG] An error occurred:", error);
        message.reply("An error occurred, please contact the administrator. (" + error.message + ")");
    }
};

async function sendVoiceMessageReply(message: Message, gptTextResponse: string) {
	var logTAG = "[TTS]";
	var ttsRequest = async function (): Promise<Buffer | null> {
		return await speechTTSRequest(gptTextResponse);
	};

	switch (config.ttsMode) {
		case TTSMode.SpeechAPI:
			logTAG = "[SpeechAPI]";
			ttsRequest = async function (): Promise<Buffer | null> {
				return await speechTTSRequest(gptTextResponse);
			};
			break;

		case TTSMode.AWSPolly:
			logTAG = "[AWSPolly]";
			ttsRequest = async function (): Promise<Buffer | null> {
				return await awsTTSRequest(gptTextResponse);
			};
			break;

		default:
			logTAG = "[SpeechAPI]";
			ttsRequest = async function (): Promise<Buffer | null> {
				return await speechTTSRequest(gptTextResponse);
			};
			break;
	}

	// Get audio buffer
	cli.print(`${logTAG} Generating audio from GPT response "${gptTextResponse}"...`);
	const audioBuffer = await ttsRequest();

	// Check if audio buffer is valid
	if (audioBuffer == null || audioBuffer.length == 0) {
		message.reply(`${logTAG} couldn't generate audio, please contact the administrator.`);
		return;
	}

	cli.print(`${logTAG} Audio generated!`);

	// Get temp folder and file path
	const tempFolder = os.tmpdir();
	const tempFilePath = path.join(tempFolder, randomUUID() + ".opus");

	// Save buffer to temp file
	fs.writeFileSync(tempFilePath, audioBuffer);

	// Send audio
	const messageMedia = new MessageMedia("audio/ogg; codecs=opus", audioBuffer.toString("base64"));
	message.reply(messageMedia);

	// Delete temp file
	fs.unlinkSync(tempFilePath);
}

export { handleMessageGPT, handleDeleteConversation };
