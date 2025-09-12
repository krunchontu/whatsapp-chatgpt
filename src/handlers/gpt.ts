import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Message, MessageMedia, Client } from "whatsapp-web.js";
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
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";

const handleMessageGPT = async (message: Message, prompt: string) => {
	try {
		cli.print(`[GPT] Received prompt from ${message.from}: ${prompt}`);

		// Check for media attachments
		console.log("[DEBUG] Checking for media attachments...");
		console.log("[DEBUG] Message object:", JSON.stringify(message, null, 2));

		let media: MessageMedia | null = null;
		if (message.hasMedia) {
			try {
				media = await message.downloadMedia();
				console.log("[DEBUG] Downloaded media:", media ? "exists" : "null");

				if (!media?.data) {
					console.error("[DEBUG] Media download failed - empty data");
					throw new Error("Failed to download media - empty data");
				}
			} catch (error) {
				console.error("[DEBUG] Media download failed:", error);
				media = null;
			}
		} else {
			console.log("[DEBUG] No media attached to message");
		}

		const hasImage = media && isImageMedia(media) && media.data.length > 0;
		console.log(`[DEBUG] Media found: ${!!media}`);
		console.log(`[DEBUG] Is image: ${hasImage}`);

		// Check for image URLs in the message
		const imageUrls =
			message.links
				?.filter((link) => {
					try {
						const url = new URL(link.link);
						return /\.(jpeg|jpg|gif|png|webp|webm)$/i.test(url.pathname);
					} catch {
						return false;
					}
				})
				.map((link) => link.link) || [];

		console.log("[DEBUG] Found image URLs:", imageUrls);

		if (media) {
			console.log(`[DEBUG] Media type: ${media.mimetype}`);
			if (media.data) {
				console.log(`[DEBUG] Media size: ${media.data.length} bytes`);
				console.log(`[DEBUG] First 100 chars of media data: ${media.data.substring(0, 100)}`);
			} else {
				console.error("[DEBUG] Media has no data");
			}
		}

		// Prompt Moderation
		if (config.promptModerationEnabled) {
			try {
				console.log("[DEBUG] Running prompt moderation...");
				await moderateIncomingPrompt(prompt);
			} catch (error: any) {
				console.error("[DEBUG] Prompt moderation failed:", error);
				message.reply(error.message);
				return;
			}
		}

		const start = Date.now();

		// Build messages array
		const messages: ChatCompletionMessageParam[] = [];

		// Add system prompt if configured
		if (config.prePrompt?.trim()) {
			console.log("[DEBUG] Adding system prompt");
			messages.push({
				role: "system",
				content: config.prePrompt
			});
		}

		// Add user message with optional image
		const content: ChatCompletionContentPart[] = [];

		if (prompt) {
			console.log("[DEBUG] Adding text prompt:", prompt);
			content.push({ type: "text", text: prompt });
		}

		// Handle attached image
		if (hasImage) {
			console.log("[DEBUG] Processing attached image...");
			try {
				if (!media?.data) {
					throw new Error("No media data available");
				}
				const base64Image = await convertMediaToBase64(media);
				console.log("[DEBUG] Image converted to base64, length:", base64Image.length);

				content.push({
					type: "image_url",
					image_url: {
						url: base64Image,
						detail: config.visionDetailLevel as "low" | "high" | "auto"
					}
				});
				console.log("[DEBUG] Image added to content with detail level:", config.visionDetailLevel);
			} catch (error) {
				console.error("[DEBUG] Image processing failed:", error);
				throw new Error("Failed to process image");
			}
		}

		// Handle image URLs
		if (imageUrls.length > 0) {
			console.log("[DEBUG] Processing image URLs...");
			for (const url of imageUrls) {
				content.push({
					type: "image_url",
					image_url: {
						url: url,
						detail: config.visionDetailLevel as "low" | "high" | "auto"
					}
				});
				console.log("[DEBUG] Added image URL to content:", url);
			}
		}

		messages.push({
			role: "user",
			content: content
		});

		console.log("[DEBUG] Final messages array:", JSON.stringify(messages, null, 2));

		// Get response from OpenAI
		console.log("[DEBUG] Sending request to OpenAI...");
		const response = await chatCompletion(messages, {
			model: config.visionEnabled && (hasImage || imageUrls.length > 0) ? config.visionModel : config.openAIModel,
			temperature: 0.7
		});

		const end = Date.now() - start;
		console.log(`[DEBUG] OpenAI response received in ${end}ms`);

		cli.print(`[GPT] Answer to ${message.from}: ${response}  | OpenAI request took ${end}ms)`);

		// TTS reply (Default: disabled)
		if (getConfig("tts", "enabled")) {
			console.log("[DEBUG] Sending TTS reply...");
			sendVoiceMessageReply(message, response);
			message.reply(response);
			return;
		}

		// Default: Text reply
		console.log("[DEBUG] Sending text reply...");
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

	// Send audio with metadata and caption
	const messageMedia = new MessageMedia(
		"audio/ogg; codecs=opus",
		audioBuffer.toString("base64"),
		`audio_${Date.now()}.opus`, // filename
		audioBuffer.length // filesize
	);
	message.reply(messageMedia, undefined, { caption: "Generated audio response" });

	// Delete temp file
	fs.unlinkSync(tempFilePath);
}

async function sendLocalFileMedia(message: Message, filePath: string) {
	try {
		const media = MessageMedia.fromFilePath(filePath);
		await message.reply(media);
		cli.print(`[Media] Sent local file: ${filePath}`);
	} catch (error) {
		console.error("[Media] Error sending local file:", error);
		throw new Error("Failed to send local file");
	}
}

async function sendUrlMedia(message: Message, url: string) {
	try {
		const media = await MessageMedia.fromUrl(url);
		await message.reply(media);
		cli.print(`[Media] Sent URL media: ${url}`);
	} catch (error) {
		console.error("[Media] Error sending URL media:", error);
		throw new Error("Failed to send URL media");
	}
}

export { handleMessageGPT, sendLocalFileMedia, sendUrlMedia };
