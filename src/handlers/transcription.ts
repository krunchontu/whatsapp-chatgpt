import { Message } from "whatsapp-web.js";
import config from "../config";
import * as cli from "../cli/ui";
import { getConfig } from "./ai-config";
import { TranscriptionMode } from "../types/transcription-mode";
import { transcribeAudioLocal } from "../providers/whisper-local";
import { transcribeWhisperApi } from "../providers/whisper-api";
import { transcribeRequest } from "../providers/speech";
import { transcribeOpenAI } from "../providers/openai";

async function transcribeMedia(message: Message): Promise<string | null> {
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

export { transcribeMedia };
