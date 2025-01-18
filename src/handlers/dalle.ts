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

        // Send the prompt to the API
        const response = await openai.images.generate({
            prompt: prompt,
            n: 1,
            size: aiConfig.dalle.size as CreateImageRequestSizeEnum,
            response_format: "url",
            model: aiConfig.dalle.model || "dall-e-3"
        });

        const end = Date.now() - start;

        // Validate the response structure
        if (!response.data || response.data.length === 0) {
            console.error('Unexpected OpenAI response:', response.data);
            throw new Error('No image data returned from OpenAI.');
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
