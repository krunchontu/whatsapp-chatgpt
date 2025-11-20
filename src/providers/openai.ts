import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { OpenAI } from "openai";
import ffmpeg from "fluent-ffmpeg";
import config from "../config";
import { getConfig } from "../handlers/ai-config";
import { createChildLogger } from "../lib/logger";
import { CircuitBreaker } from "../lib/circuit-breaker";

const logger = createChildLogger({ module: 'providers:openai' });

// Circuit breaker for OpenAI API
const openaiCircuitBreaker = new CircuitBreaker({
	name: 'OpenAI API',
	failureThreshold: 5,        // Open circuit after 5 consecutive failures
	resetTimeout: 60000,         // Wait 60 seconds before trying again
	successThreshold: 2          // Require 2 successes to close circuit
});

export let openai: OpenAI;

export function initOpenAI() {
	const apiKey = getConfig("gpt", "apiKey");
	if (!apiKey) {
		throw new Error("OpenAI API key is not configured");
	}

	openai = new OpenAI({
		apiKey: apiKey,
		organization: config.openAIOrganization,
		project: config.openAIProject,
		timeout: config.openAITimeout || 30000,
		maxRetries: config.openAIMaxRetries || 5
	});
}

export type ChatCompletionMessageParam = {
	role: "system" | "user" | "assistant";
	content:
		| string
		| Array<{
				type: "text" | "image_url";
				text?: string;
				image_url?: {
					url: string;
					detail?: "low" | "high" | "auto";
				};
		  }>;
	name?: string;
};

export interface ChatCompletionResult {
	content: string;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	model: string;
}

export async function chatCompletion(
	messages: ChatCompletionMessageParam[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
		responseFormat?: "text" | "json_object";
	} = {}
): Promise<ChatCompletionResult> {
	// Use circuit breaker to protect against cascading failures
	return openaiCircuitBreaker.execute(async () => {
		try {
			if (!openai) {
				initOpenAI();
			}

			const model = options.model || config.openAIModel;
			const completion = await openai.chat.completions.create({
				model,
				messages: messages,
				temperature: options.temperature || 0.7,
				max_tokens: options.maxTokens || config.maxModelTokens,
				response_format: options.responseFormat ? { type: options.responseFormat } : undefined
			});

			if (!completion.choices[0]?.message?.content) {
				throw new Error("No content in completion response");
			}

			// Extract usage information
			const usage = completion.usage || {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0
			};

			return {
				content: completion.choices[0].message.content,
				usage: {
					promptTokens: usage.prompt_tokens,
					completionTokens: usage.completion_tokens,
					totalTokens: usage.total_tokens
				},
				model
			};
		} catch (error) {
			logger.error({
				err: error,
				model: options.model || config.openAIModel,
				messageCount: messages?.length
			}, 'OpenAI chat completion failed');
			throw error;
		}
	});
}

export async function transcribeOpenAI(audioBuffer: Buffer): Promise<{ text: string; language: string }> {
	const tempdir = os.tmpdir();
	const oggPath = path.join(tempdir, randomUUID() + ".ogg");
	const wavPath = path.join(tempdir, randomUUID() + ".wav");

	try {
		// Ensure OpenAI is initialized
		if (!openai) {
			initOpenAI();
		}

		fs.writeFileSync(oggPath, audioBuffer);
		await convertOggToWav(oggPath, wavPath);

		const transcription = await openai.audio.transcriptions.create({
			file: fs.createReadStream(wavPath),
			model: "whisper-1",
			language: config.transcriptionLanguage,
			response_format: "json"
		});

		// Updated response handling
		if (!transcription || typeof transcription !== "object" || !transcription.text) {
			throw new Error("Invalid transcription response from OpenAI API");
		}

		return {
			text: transcription.text,
			language: config.transcriptionLanguage || ""
		};
	} catch (error) {
		logger.error({
			err: error,
			language: config.transcriptionLanguage
		}, 'OpenAI transcription failed');
		throw new Error(`Transcription failed: ${error.message}`);
	} finally {
		try {
			fs.unlinkSync(oggPath);
			fs.unlinkSync(wavPath);
		} catch (cleanupError) {
			logger.warn({ err: cleanupError, oggPath, wavPath }, 'Failed to cleanup temporary transcription files');
		}
	}
}

async function convertOggToWav(oggPath: string, wavPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(oggPath)
			.toFormat("wav")
			.outputOptions("-acodec pcm_s16le")
			.output(wavPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}
