import os from "os";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Message, MessageMedia, Client } from "whatsapp-web.js";
import { convertMediaToBase64, isImageMedia } from "../utils";
import { chatCompletion } from "../providers/openai";
import * as cli from "../cli/ui";
import config from "../config";
import { createChildLogger } from "../lib/logger";
import { UsageRepository, OperationType } from "../db/repositories/usage.repository";
import { UserRepository } from "../db/repositories/user.repository";
import { ConversationRepository } from "../db/repositories/conversation.repository";

const logger = createChildLogger({ module: 'handlers:gpt' });

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
		logger.debug({ chatId: message.from, hasMedia: message.hasMedia }, 'Checking for media attachments');

		let media: MessageMedia | null = null;
		if (message.hasMedia) {
			try {
				media = await message.downloadMedia();
				logger.debug({
					chatId: message.from,
					mediaExists: !!media,
					hasData: !!media?.data
				}, 'Downloaded media');

				if (!media?.data) {
					logger.error({ chatId: message.from }, 'Media download failed - empty data');
					throw new Error("Failed to download media - empty data");
				}
			} catch (error) {
				logger.error({ err: error, chatId: message.from }, 'Media download failed');
				media = null;
			}
		} else {
			logger.debug({ chatId: message.from }, 'No media attached to message');
		}

		const hasImage = media && isImageMedia(media) && media.data.length > 0;
		logger.debug({
			chatId: message.from,
			mediaFound: !!media,
			isImage: hasImage
		}, 'Media check completed');

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

		logger.debug({
			chatId: message.from,
			imageUrlCount: imageUrls.length,
			imageUrls
		}, 'Found image URLs in message');

		if (media) {
			logger.debug({
				chatId: message.from,
				mediaType: media.mimetype,
				mediaSize: media.data?.length,
				hasData: !!media.data
			}, 'Media details');
		}

		// Prompt Moderation
		if (config.promptModerationEnabled) {
			try {
				logger.debug({ chatId: message.from }, 'Running prompt moderation');
				await moderateIncomingPrompt(prompt);
			} catch (error: any) {
				logger.warn({
					err: error,
					chatId: message.from,
					prompt: prompt.substring(0, 100)
				}, 'Prompt moderation failed');
				message.reply(error.message);
				return;
			}
		}

		const start = Date.now();

		// Get or create user for conversation tracking
		const user = await UserRepository.findByPhoneNumber(message.from) ||
		             await UserRepository.create({ phoneNumber: message.from, role: 'USER' });

		// Build messages array
		const messages = [];

		// Add system prompt if configured
		if (config.prePrompt?.trim()) {
			logger.debug({ chatId: message.from }, 'Adding system prompt');
			messages.push({
				role: "system",
				content: config.prePrompt
			});
		}

		// Get conversation history (last 10 messages)
		try {
			const conversationContext = await ConversationRepository.getContext(user.id);
			if (conversationContext.length > 0) {
				logger.debug({
					chatId: message.from,
					userId: user.id,
					messageCount: conversationContext.length
				}, 'Adding conversation history');
				messages.push(...conversationContext);
			}
		} catch (error) {
			logger.error({
				err: error,
				chatId: message.from,
				userId: user.id
			}, 'Failed to retrieve conversation history');
			// Continue without history if retrieval fails
		}

		// Add user message with optional image
		const content: Array<any> = [];

		if (prompt) {
			logger.debug({
				chatId: message.from,
				promptLength: prompt.length
			}, 'Adding text prompt');
			content.push({ type: "text", text: prompt });
		}

		// Handle attached image
		if (hasImage) {
			logger.debug({ chatId: message.from }, 'Processing attached image');
			try {
				if (!media?.data) {
					throw new Error("No media data available");
				}
				const base64Image = await convertMediaToBase64(media);
				logger.debug({
					chatId: message.from,
					base64Length: base64Image.length
				}, 'Image converted to base64');

				content.push({
					type: "image_url",
					image_url: {
						url: base64Image,
						detail: config.visionDetailLevel
					}
				});
				logger.debug({
					chatId: message.from,
					detailLevel: config.visionDetailLevel
				}, 'Image added to content');
			} catch (error) {
				logger.error({
					err: error,
					chatId: message.from
				}, 'Image processing failed');
				throw new Error("Failed to process image");
			}
		}

		// Handle image URLs
		if (imageUrls.length > 0) {
			logger.debug({
				chatId: message.from,
				urlCount: imageUrls.length
			}, 'Processing image URLs');
			for (const url of imageUrls) {
				content.push({
					type: "image_url",
					image_url: {
						url: url,
						detail: config.visionDetailLevel
					}
				});
				logger.debug({ chatId: message.from, url }, 'Added image URL to content');
			}
		}

		messages.push({
			role: "user",
			content: content
		});

		logger.debug({
			chatId: message.from,
			messageCount: messages.length,
			contentItems: content.length
		}, 'Built messages array for OpenAI');

		// Get response from OpenAI
		const model = config.visionEnabled && (hasImage || imageUrls.length > 0) ? config.visionModel : config.openAIModel;
		logger.debug({
			chatId: message.from,
			model,
			visionEnabled: config.visionEnabled,
			hasVisualContent: hasImage || imageUrls.length > 0
		}, 'Sending request to OpenAI');

		const result = await chatCompletion(messages, {
			model,
			temperature: 0.7
		});

		const end = Date.now() - start;
		logger.info({
			chatId: message.from,
			model: result.model,
			durationMs: end,
			responseLength: result.content.length,
			promptTokens: result.usage.promptTokens,
			completionTokens: result.usage.completionTokens,
			totalTokens: result.usage.totalTokens
		}, 'OpenAI response received');

		// Save conversation messages (user + assistant)
		try {
			// Save user message
			await ConversationRepository.addMessage(user.id, {
				role: 'user',
				content: prompt
			});

			// Save assistant response
			await ConversationRepository.addMessage(user.id, {
				role: 'assistant',
				content: result.content
			});

			logger.debug({
				chatId: message.from,
				userId: user.id
			}, 'Conversation messages saved');
		} catch (error) {
			logger.error({
				err: error,
				chatId: message.from,
				userId: user.id
			}, 'Failed to save conversation messages');
			// Continue even if conversation saving fails
		}

		// Track usage and cost
		try {

			// Calculate cost
			const costMicros = UsageRepository.calculateGptCost(
				result.model,
				result.usage.promptTokens,
				result.usage.completionTokens
			);

			// Determine operation type
			const operation = hasImage || imageUrls.length > 0 ? OperationType.VISION : OperationType.CHAT;

			// Save usage metric
			await UsageRepository.create({
				userId: user.id,
				promptTokens: result.usage.promptTokens,
				completionTokens: result.usage.completionTokens,
				totalTokens: result.usage.totalTokens,
				costMicros,
				model: result.model,
				operation
			});

			logger.debug({
				chatId: message.from,
				userId: user.id,
				costUsd: UsageRepository.microToUsd(costMicros),
				totalTokens: result.usage.totalTokens
			}, 'Usage tracked');
		} catch (usageError) {
			// Don't fail the request if usage tracking fails
			logger.error({
				err: usageError,
				chatId: message.from
			}, 'Failed to track usage');
		}

		cli.print(`[GPT] Answer to ${message.from}: ${result.content}  | OpenAI request took ${end}ms)`);

		// TTS reply (Default: disabled)
		if (getConfig("tts", "enabled")) {
			logger.debug({ chatId: message.from }, 'Sending TTS reply');
			sendVoiceMessageReply(message, result.content);
			message.reply(result.content);
			return;
		}

		// Default: Text reply
		logger.debug({ chatId: message.from }, 'Sending text reply');
		message.reply(result.content);
	} catch (error: any) {
		logger.error({
			err: error,
			chatId: message.from,
			prompt: prompt?.substring(0, 100)
		}, 'GPT request failed');

		// Provide user-friendly error messages based on error type
		let errorMessage: string;

		if (error.message && error.message.includes('Circuit breaker is OPEN')) {
			// Circuit breaker is open - service temporarily unavailable
			errorMessage = "I'm experiencing technical difficulties at the moment. Please try again in a few minutes.";
			logger.warn({ chatId: message.from }, 'Circuit breaker open - failing fast');
		} else if (error.status === 429 || error.message?.includes('rate limit')) {
			// Rate limit error
			errorMessage = "Too many requests. Please wait a moment and try again.";
		} else if (error.status === 503 || error.status === 500) {
			// Server error
			errorMessage = "The AI service is temporarily unavailable. Please try again later.";
		} else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
			// Timeout error
			errorMessage = "The request took too long. Please try again.";
		} else {
			// Generic error
			errorMessage = "An error occurred while processing your request. Please try again.";
		}

		message.reply(errorMessage);
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
	message.reply(messageMedia, { caption: "Generated audio response" });

	// Delete temp file
	fs.unlinkSync(tempFilePath);
}

async function sendLocalFileMedia(message: Message, filePath: string) {
	try {
		const media = MessageMedia.fromFilePath(filePath);
		await message.reply(media);
		cli.print(`[Media] Sent local file: ${filePath}`);
		logger.info({ chatId: message.from, filePath }, 'Sent local file media');
	} catch (error) {
		logger.error({
			err: error,
			chatId: message.from,
			filePath
		}, 'Error sending local file');
		throw new Error("Failed to send local file");
	}
}

async function sendUrlMedia(message: Message, url: string) {
	try {
		const media = await MessageMedia.fromUrl(url);
		await message.reply(media);
		cli.print(`[Media] Sent URL media: ${url}`);
		logger.info({ chatId: message.from, url }, 'Sent URL media');
	} catch (error) {
		logger.error({
			err: error,
			chatId: message.from,
			url
		}, 'Error sending URL media');
		throw new Error("Failed to send URL media");
	}
}

/**
 * Handle conversation reset/deletion
 * Clears the conversation history for a user
 *
 * @param message - WhatsApp message
 */
async function handleDeleteConversation(message: Message): Promise<void> {
	try {
		// Get user
		const user = await UserRepository.findByPhoneNumber(message.from);
		if (!user) {
			logger.warn({ chatId: message.from }, 'User not found for conversation reset');
			await message.reply('No conversation history found.');
			return;
		}

		// Clear conversation history
		await ConversationRepository.clearHistory(user.id);

		logger.info({
			chatId: message.from,
			userId: user.id
		}, 'Conversation history cleared');

		await message.reply('✅ Conversation reset successfully. Starting fresh!');
	} catch (error) {
		logger.error({
			err: error,
			chatId: message.from
		}, 'Failed to reset conversation');
		await message.reply('Failed to reset conversation. Please try again.');
	}
}

export { handleMessageGPT, handleDeleteConversation, sendLocalFileMedia, sendUrlMedia };
