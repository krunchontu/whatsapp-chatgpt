import process from "process";

import { TranscriptionMode } from "./types/transcription-mode";
// Removed for MVP (v2): import { TTSMode } from "./types/tts-mode";
import { AWSPollyEngine } from "./types/aws-polly-engine";

// Environment variables
import dotenv from "dotenv";
dotenv.config();

// Config Interface
interface IConfig {
	// Redis Configuration
	redis: {
		enabled: boolean;
		url: string;
	};
	// OpenAI Client Configuration
	openAITimeout: number;
	openAIMaxRetries: number;
	// Rate Limiting
	rateLimitEnabled: boolean;
	rateLimitPerUser: number;
	rateLimitPerUserWindow: number;
	rateLimitGlobal: number;
	rateLimitGlobalWindow: number;
	// Cost Monitoring & Alerts
	costAlertEnabled: boolean;
	costAlertThresholdUsd: number;
	// RBAC: Role-Based Access Control
	ownerPhoneNumbers: string[];
	adminPhoneNumbers: string[];
	operatorPhoneNumbers: string[];
	// Access control (whitelist for regular users)
	whitelistedPhoneNumbers: string[];
	whitelistedEnabled: boolean;
	// Vision
	visionEnabled: boolean;
	visionModel: string;
	visionDetailLevel: "low" | "high" | "auto";
	// OpenAI
	openAIModel: string;
	openAIAPIKeys: string[];
	openAIOrganization: string;
	openAIProject: string;
	maxModelTokens: number;
	prePrompt: string | undefined;
	// Moderation
	moderationEnabled: boolean;
	customModerationParams: { [key: string]: boolean };

	// Prefix
	prefixEnabled: boolean;
	prefixSkippedForMe: boolean;
	gptPrefix: string;
	// Removed for MVP (v2 features): dallePrefix, stableDiffusionPrefix, langChainPrefix
	resetPrefix: string;
	aiConfigPrefix: string;

	// Groupchats
	groupchatsEnabled: boolean;

	// Prompt Moderation
	promptModerationEnabled: boolean;
	promptModerationBlacklistedCategories: string[];

	// AWS
	awsAccessKeyId: string;
	awsSecretAccessKey: string;
	awsRegion: string;
	awsPollyVoiceId: string;
	awsPollyEngine: AWSPollyEngine;

	// Voice transcription (TTS removed for MVP - v2 feature)
	whisperServerUrl: string;
	openAIServerUrl: string;
	whisperApiKey: string;
	transcriptionEnabled: boolean;
	transcriptionMode: TranscriptionMode;
	transcriptionLanguage: string;
}

function getEnvCustomModerationParams(): { [key: string]: boolean } {
	const envValue = process.env.CUSTOM_MODERATION_PARAMS;
	if (!envValue) {
		return {
			political_content: true,
			misinformation: true,
			hate_speech: true,
			explicit_content: true
		};
	}
	return JSON.parse(envValue);
}

// Config
export const config: IConfig = {
	// Redis Configuration
	redis: {
		enabled: getEnvBooleanWithDefault("REDIS_ENABLED", true), // Default: true
		url: process.env.REDIS_URL || "redis://localhost:6379", // Default: redis://localhost:6379
	},
	// OpenAI Client Configuration
	openAITimeout: parseInt(process.env.OPENAI_TIMEOUT || "30000"),
	openAIMaxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || "5"),
	// Rate Limiting
	rateLimitEnabled: getEnvBooleanWithDefault("RATE_LIMIT_ENABLED", true), // Default: true
	rateLimitPerUser: parseInt(process.env.RATE_LIMIT_PER_USER || "10"), // Default: 10 messages per minute
	rateLimitPerUserWindow: parseInt(process.env.RATE_LIMIT_PER_USER_WINDOW || "60"), // Default: 60 seconds
	rateLimitGlobal: parseInt(process.env.RATE_LIMIT_GLOBAL || "100"), // Default: 100 messages per minute
	rateLimitGlobalWindow: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW || "60"), // Default: 60 seconds
	// Cost Monitoring & Alerts
	costAlertEnabled: getEnvBooleanWithDefault("COST_ALERT_ENABLED", true), // Default: true
	costAlertThresholdUsd: parseFloat(process.env.COST_ALERT_THRESHOLD_USD || "50"), // Default: $50 per day
	// RBAC: Role-Based Access Control
	ownerPhoneNumbers: process.env.OWNER_PHONE_NUMBERS?.split(",").filter(n => n.trim()) || [],
	adminPhoneNumbers: process.env.ADMIN_PHONE_NUMBERS?.split(",").filter(n => n.trim()) || [],
	operatorPhoneNumbers: process.env.OPERATOR_PHONE_NUMBERS?.split(",").filter(n => n.trim()) || [],
	// Access control (whitelist for regular users)
	whitelistedPhoneNumbers: process.env.WHITELISTED_PHONE_NUMBERS?.split(",").filter(n => n.trim()) || [],
	whitelistedEnabled: getEnvBooleanWithDefault("WHITELISTED_ENABLED", false),
	// Vision
	visionEnabled: getEnvBooleanWithDefault("VISION_ENABLED", true),
	visionModel: process.env.VISION_MODEL || "gpt-4o",
	visionDetailLevel: process.env.VISION_DETAIL_LEVEL || "auto",
	// Moderation
	moderationEnabled: getEnvBooleanWithDefault("MODERATION_ENABLED", true),
	customModerationParams: getEnvCustomModerationParams(),

	openAIAPIKeys: (process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || "").split(",").filter((key) => !!key), // Default: []
	openAIModel: process.env.OPENAI_GPT_MODEL || "gpt-3.5-turbo", // Default: gpt-3.5-turbo
	openAIOrganization: process.env.OPENAI_ORGANIZATION || "", // Default: ""
	openAIProject: process.env.OPENAI_PROJECT || "", // Default: ""
	maxModelTokens: getEnvMaxModelTokens(), // Default: 4096
	prePrompt: process.env.PRE_PROMPT, // Default: undefined

	// Prefix
	prefixEnabled: getEnvBooleanWithDefault("PREFIX_ENABLED", true), // Default: true
	prefixSkippedForMe: getEnvBooleanWithDefault("PREFIX_SKIPPED_FOR_ME", true), // Default: true
	gptPrefix: process.env.GPT_PREFIX || "!gpt", // Default: !gpt
	resetPrefix: process.env.RESET_PREFIX || "!reset", // Default: !reset
	aiConfigPrefix: process.env.AI_CONFIG_PREFIX || "!config", // Default: !config
	// Removed for MVP (see MVP_PLAN.md): dallePrefix, stableDiffusionPrefix, langChainPrefix

	// Groupchats
	groupchatsEnabled: getEnvBooleanWithDefault("GROUPCHATS_ENABLED", false), // Default: false

	// Prompt Moderation
	promptModerationEnabled: getEnvBooleanWithDefault("PROMPT_MODERATION_ENABLED", false), // Default: false
	promptModerationBlacklistedCategories: getEnvPromptModerationBlacklistedCategories(), // Default: ["hate", "hate/threatening", "self-harm", "sexual", "sexual/minors", "violence", "violence/graphic"]

	// AWS
	awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "", // Default: ""
	awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "", // Default: ""
	awsRegion: process.env.AWS_REGION || "", // Default: ""
	awsPollyVoiceId: process.env.AWS_POLLY_VOICE_ID || "", // Default: "Joanna"
	awsPollyEngine: getEnvAWSPollyVoiceEngine(), // Default: standard

	// Transcription API URLs
	whisperServerUrl: process.env.WHISPER_API_URL || "https://transcribe.whisperapi.com",
	openAIServerUrl: process.env.OPENAI_API_URL || "https://api.openai.com/v1/audio/transcriptions",
	whisperApiKey: process.env.WHISPER_API_KEY || "", // Default: ""

	// TTS removed for MVP (v2 feature)

	// Transcription
	transcriptionEnabled: getEnvBooleanWithDefault("TRANSCRIPTION_ENABLED", false), // Default: false
	transcriptionMode: getEnvTranscriptionMode(), // Default: local
	transcriptionLanguage: process.env.TRANSCRIPTION_LANGUAGE || "" // Default: null
};

/**
 * Get the max model tokens from the environment variable
 * @returns The max model tokens from the environment variable or 4096
 */
function getEnvMaxModelTokens() {
	const envValue = process.env.MAX_MODEL_TOKENS;
	if (envValue == undefined || envValue == "") {
		return 4096;
	}

	return parseInt(envValue);
}

/**
 * Get an environment variable as a boolean with a default value
 * @param key The environment variable key
 * @param defaultValue The default value
 * @returns The value of the environment variable or the default value
 */
function getEnvBooleanWithDefault(key: string, defaultValue: boolean): boolean {
	const envValue = process.env[key]?.toLowerCase();
	if (envValue == undefined || envValue == "") {
		return defaultValue;
	}

	return envValue == "true";
}

/**
 * Get the blacklist categories for prompt moderation from the environment variable
 * @returns Blacklisted categories for prompt moderation
 */
function getEnvPromptModerationBlacklistedCategories(): string[] {
	const envValue = process.env.PROMPT_MODERATION_BLACKLISTED_CATEGORIES;
	if (envValue == undefined || envValue == "") {
		return ["hate", "hate/threatening", "self-harm", "sexual", "sexual/minors", "violence", "violence/graphic"];
	} else {
		return JSON.parse(envValue.replace(/'/g, '"'));
	}
}

/**
 * Get the transcription mode from the environment variable
 * @returns The transcription mode
 */
function getEnvTranscriptionMode(): TranscriptionMode {
	const envValue = process.env.TRANSCRIPTION_MODE?.toLowerCase();
	if (envValue == undefined || envValue == "") {
		return TranscriptionMode.Local;
	}

	return envValue as TranscriptionMode;
}

/**
 * Get the AWS Polly voice engine from the environment variable
 * @returns The voice engine
 */
function getEnvAWSPollyVoiceEngine(): AWSPollyEngine {
	const envValue = process.env.AWS_POLLY_VOICE_ENGINE?.toLowerCase();
	if (envValue == undefined || envValue == "") {
		return AWSPollyEngine.Standard;
	}

	return envValue as AWSPollyEngine;
}

export default config;
