import { Message } from "whatsapp-web.js";
import config from "../config";
import * as cli from "../cli/ui";
import { getConfig } from "./ai-config";
import { TranscriptionMode } from "../types/transcription-mode";
import { transcribeAudioLocal } from "../providers/whisper-local";
import { transcribeWhisperApi } from "../providers/whisper-api";
import { transcribeRequest } from "../providers/speech";
import { transcribeOpenAI } from "../providers/openai";
import { queueTranscription } from "../queue/transcription.queue";
import { logger } from "../lib/logger";

/**
 * Transcribe voice message synchronously (legacy mode, when Redis disabled)
 */
async function transcribeMediaSync(message: Message): Promise<string | null> {
	if (!message.hasMedia) return null;
	const media = await message.downloadMedia();
	if (!media || !media.mimetype.startsWith("audio/")) return null;

	if (!getConfig("transcription", "enabled")) {
		cli.print("[Transcription] Received voice messsage but voice transcription is disabled.");
		return null;
	}

	const mediaBuffer = Buffer.from(media.data, "base64");
	const transcriptionMode = getConfig("transcription", "mode");
	cli.print(`[Transcription] Transcribing audio with "${transcriptionMode}" mode...`);

	let res;
	switch (transcriptionMode) {
		case TranscriptionMode.Local:
			res = await transcribeAudioLocal(mediaBuffer);
			break;
		case TranscriptionMode.OpenAI:
			res = await transcribeOpenAI(mediaBuffer);
			break;
		case TranscriptionMode.WhisperAPI:
			res = await transcribeWhisperApi(new Blob([mediaBuffer]));
			break;
		case TranscriptionMode.SpeechAPI:
			res = await transcribeRequest(new Blob([mediaBuffer]));
			break;
		default:
			cli.print(`[Transcription] Unsupported transcription mode: ${transcriptionMode}`);
			return null;
	}

	const { text: transcribedText, language: transcribedLanguage } = res;

	if (transcribedText == null || transcribedText.length === 0) {
		message.reply("I couldn't understand what you said.");
		return null;
	}

	cli.print(`[Transcription] Transcription response: ${transcribedText} (language: ${transcribedLanguage})`);

	if (config.ttsTranscriptionResponse) {
		const reply = `You said: ${transcribedText}${transcribedLanguage ? " (language: " + transcribedLanguage + ")" : ""}`;
		message.reply(reply);
	}

	return transcribedText;
}

/**
 * Transcribe voice message asynchronously using job queue (recommended)
 */
async function transcribeMediaAsync(message: Message): Promise<boolean> {
	if (!message.hasMedia) return false;

	const media = await message.downloadMedia();
	if (!media || !media.mimetype.startsWith("audio/")) return false;

	if (!getConfig("transcription", "enabled")) {
		logger.info({ module: 'handlers:transcription' }, 'Voice transcription is disabled');
		return false;
	}

	const chat = await message.getChat();
	const transcriptionMode = getConfig("transcription", "mode");

	logger.info(
		{
			messageId: message.id._serialized,
			from: message.from,
			transcriptionMode,
			module: 'handlers:transcription',
		},
		'Queuing voice message transcription'
	);

	try {
		// Queue the transcription job
		await queueTranscription({
			messageId: message.id._serialized,
			audioData: media.data,
			mimeType: media.mimetype,
			phoneNumber: message.from,
			chatId: chat.id._serialized,
			transcriptionMode,
			sendTtsResponse: config.ttsTranscriptionResponse,
		});

		// Send immediate response to user
		await message.reply('🎤 Processing your voice message...');

		logger.info(
			{
				messageId: message.id._serialized,
				from: message.from,
				module: 'handlers:transcription',
			},
			'Transcription job queued successfully'
		);

		return true;
	} catch (error) {
		logger.error(
			{
				err: error,
				messageId: message.id._serialized,
				from: message.from,
				module: 'handlers:transcription',
			},
			'Failed to queue transcription job'
		);

		// Fallback to sync transcription
		logger.warn({ module: 'handlers:transcription' }, 'Falling back to sync transcription');
		await transcribeMediaSync(message);
		return false;
	}
}

/**
 * Transcribe voice message (auto-detects async vs sync based on Redis availability)
 */
async function transcribeMedia(message: Message): Promise<string | null> {
	// Use async queue if Redis is enabled
	if (config.redis.enabled) {
		const queued = await transcribeMediaAsync(message);
		// Return null to indicate transcription is being processed asynchronously
		// The worker will handle sending the result to GPT
		return null;
	}

	// Fallback to sync transcription if Redis is disabled
	return transcribeMediaSync(message);
}

export { transcribeMedia, transcribeMediaSync, transcribeMediaAsync };
