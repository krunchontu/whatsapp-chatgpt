import * as cli from "../cli/ui";
import { initAiConfig } from "../handlers/ai-config";
import { initOpenAI } from "../providers/openai";

function createReadyHandler(setBotReadyTimestamp: (date: Date) => void) {
	return () => {
		cli.printOutro();

		const timestamp = new Date();
		setBotReadyTimestamp(timestamp);
		console.debug(`[DEBUG] Bot ready at: ${timestamp.toISOString()}`);

		try {
			initAiConfig();
			console.debug("[DEBUG] AI config initialized successfully");
		} catch (error) {
			console.error("[DEBUG] Failed to initialize AI config:", error);
		}

		try {
			initOpenAI();
			console.debug("[DEBUG] OpenAI initialized successfully");
		} catch (error) {
			console.error("[DEBUG] Failed to initialize OpenAI:", error);
		}
	};
}

export { createReadyHandler };
