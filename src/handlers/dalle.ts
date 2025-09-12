import { MessageMedia } from "whatsapp-web.js";
import { openai } from "../providers/openai";
import { aiConfig } from "../handlers/ai-config";
import config from "../config";
import * as cli from "../cli/ui";

// Moderation
import { moderateIncomingPrompt } from "./moderation";

const handleMessageDALLE = async (message: any, prompt: any) => {
	try {
		const start = Date.now();

		cli.print(`[DALL-E] Received prompt from ${message.from}: ${prompt}`);

		// Prompt Moderation
		if (config.promptModerationEnabled) {
			try {
				await moderateIncomingPrompt(prompt);
			} catch (error: any) {
				message.reply(error.message);
				return;
			}
		}

		// Validate image size for DALL-E 3
		const validSizes = ["1024x1024", "1792x1024", "1024x1792"];
		if (!validSizes.includes(aiConfig.dalle.size)) {
			throw new Error(`Invalid image size for DALL-E 3: ${aiConfig.dalle.size}. Valid sizes are 1024x1024, 1792x1024, or 1024x1792.`);
		}

		// Send the prompt to the API
		const response = await openai.images.generate({
			prompt,
			n: 1,
			size: aiConfig.dalle.size as any,
			response_format: "url",
			model: aiConfig.dalle.model || "dall-e-3",
			quality: aiConfig.dalle.quality || "standard", // Optional: Can be "standard" or "hd" for DALL-E 3
			style: aiConfig.dalle.style || "vivid" // Optional: Can be "vivid" or "natural" for DALL-E 3
		} as any);

		const end = Date.now() - start;

		// Validate the response structure
		if (!response.data || !Array.isArray(response.data) || response.data.length === 0 || !response.data[0].url) {
			console.error("Unexpected OpenAI response:", response.data);
			throw new Error("No image data returned from OpenAI.");
		}

		// Extract the image URL
		const imageUrl = response.data[0].url;

		// Create MessageMedia from the URL
		const image = await MessageMedia.fromUrl(imageUrl, {
			unsafeMime: true
		});

		cli.print(`[DALL-E] Answer to ${message.from} | OpenAI request took ${end}ms`);

		message.reply(image);
	} catch (error: any) {
		console.error("An error occurred in handleMessageDALLE:", error);
		message.reply("An error occurred, please contact the administrator. (" + error.message + ")");
	}
};

export { handleMessageDALLE };
