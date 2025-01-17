import * as cli from "../cli/ui";
import config from "../config";
import { openai, initOpenAI } from "../providers/openai";

/**
 * Handle prompt moderation
 *
 * @param prompt Prompt to moderate
 * @returns true if the prompt is safe, throws an error otherwise
 */
const moderateIncomingPrompt = async (prompt: string) => {
    cli.print(`[MODERATION] Checking user prompt: "${prompt}"`);
    
    try {
        // Ensure OpenAI is initialized
        if (!openai) {
            initOpenAI();
        }

        const moderationResponse = await openai.moderations.create({
            input: prompt
        });

        // Add response validation
        if (!moderationResponse || !moderationResponse.data || !moderationResponse.data.results) {
            cli.print("[MODERATION] Error: Invalid moderation response structure");
            throw new Error("Invalid moderation response from OpenAI API");
        }

        const moderationResponseData = moderationResponse.data;
        const moderationResult = moderationResponseData.results[0];
        
        if (!moderationResult || !moderationResult.categories) {
            cli.print("[MODERATION] Error: Missing categories in moderation result");
            throw new Error("Invalid moderation categories from OpenAI API");
        }

        const moderationResponseCategories = moderationResult.categories;
        const blackListedCategories = config.promptModerationBlacklistedCategories;

        // Improved logging
        cli.print("[MODERATION] Moderation categories:");
        Object.entries(moderationResponseCategories).forEach(([category, value]) => {
            cli.print(`  ${category}: ${value} ${blackListedCategories.includes(category) ? '(monitored)' : ''}`);
        });

        // Check blacklisted categories
        for (const category of blackListedCategories) {
            if (moderationResponseCategories[category]) {
                cli.print(`[MODERATION] Rejected prompt due to category: ${category}`);
                throw new Error(`Prompt was rejected by the moderation system. Reason: ${category}`);
            }
        }

        cli.print("[MODERATION] Prompt approved");
        return true;
    } catch (error) {
        cli.print(`[MODERATION] Error during moderation: ${error.message}`);
        throw error; // Re-throw the error after logging
    }
};

export { moderateIncomingPrompt };
