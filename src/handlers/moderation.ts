import * as cli from "../cli/ui";
import config from "../config";
import { openai, initOpenAI } from "../providers/openai";

// Custom moderation parameters
interface CustomModerationParams {
	[key: string]: boolean;
}

// Moderation response interface
interface ModerationResponse {
	flagged: boolean;
	reason?: string;
	categories?: { [key: string]: boolean };
}

/**
 * Check moderation using OpenAI's Moderation API
 */
async function checkModerationFlag(expression: string): Promise<ModerationResponse> {
	try {
		// Ensure OpenAI is initialized
		if (!openai) {
			initOpenAI();
		}

		const moderationResponse = await openai.moderations.create({
			input: expression
		});

		if (!moderationResponse || !moderationResponse.results) {
			throw new Error("Invalid moderation response structure");
		}

		const result = moderationResponse.results[0];
		return {
			flagged: result.flagged,
			categories: result.categories as unknown as Record<string, boolean>
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		cli.print(`[MODERATION] Error checking moderation: ${message}`);
		throw error;
	}
}

/**
 * Custom moderation using GPT-4
 */
async function customModeration(content: string, parameters: CustomModerationParams): Promise<ModerationResponse> {
	try {
		if (!openai) {
			initOpenAI();
		}

		const promptText = `Assess this content for inappropriate material based on these parameters: ${JSON.stringify(parameters)}.
        Return JSON with: flagged (boolean), reason (string), and parameters (object with parameter:boolean pairs).
        Content: ${content}`;

		const response = await openai.chat.completions.create({
			model: config.openAIModel,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: "You are a content moderation assistant." },
				{ role: "user", content: promptText }
			]
		});

		const responseContent = response.choices[0].message.content;
		return JSON.parse(responseContent ?? "{}");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		cli.print(`[CUSTOM MODERATION] Error: ${message}`);
		throw error;
	}
}

/**
 * Execute moderation with both input and output checks
 */
async function executeModeration(userInput: string, llmResponse?: string): Promise<boolean> {
	try {
		// Input moderation
		const inputModeration = await checkModerationFlag(userInput);
		if (inputModeration.flagged) {
			cli.print(`[MODERATION] Input flagged: ${JSON.stringify(inputModeration.categories)}`);
			return false;
		}

		// Output moderation if response provided
		if (llmResponse) {
			const outputModeration = await checkModerationFlag(llmResponse);
			if (outputModeration.flagged) {
				cli.print(`[MODERATION] Output flagged: ${JSON.stringify(outputModeration.categories)}`);
				return false;
			}

			// Custom moderation example
			const customParams = {
				political_content: true,
				misinformation: true
			};
			const customModerationResult = await customModeration(llmResponse, customParams);
			if (customModerationResult.flagged) {
				cli.print(`[CUSTOM MODERATION] Output flagged: ${customModerationResult.reason}`);
				return false;
			}
		}

		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		cli.print(`[MODERATION] Error during moderation: ${message}`);
		throw error;
	}
}

async function moderateIncomingPrompt(prompt: string): Promise<void> {
	const result = await checkModerationFlag(prompt);
	if (result.flagged) {
		throw new Error("Prompt flagged by moderation");
	}
}

export { executeModeration, checkModerationFlag, customModeration, moderateIncomingPrompt };
