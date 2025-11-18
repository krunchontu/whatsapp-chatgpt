import * as cli from "../cli/ui";
import { initAiConfig } from "../handlers/ai-config";
import { initOpenAI } from "../providers/openai";
import { createChildLogger } from "../lib/logger";
import { ConfigurationError } from "../lib/errors";

const logger = createChildLogger({ module: 'events:ready' });

function createReadyHandler(setBotReadyTimestamp: (date: Date) => void) {
	return () => {
		cli.printOutro();

		const timestamp = new Date();
		setBotReadyTimestamp(timestamp);
		logger.info({ timestamp: timestamp.toISOString() }, 'WhatsApp bot is ready');

		// Initialize AI configuration
		try {
			initAiConfig();
			logger.info('AI configuration initialized successfully');
		} catch (error) {
			logger.error({ err: error }, 'Failed to initialize AI configuration');
			throw new ConfigurationError(
				'Failed to initialize AI configuration',
				'AI_CONFIG',
				{ error }
			);
		}

		// Initialize OpenAI client
		try {
			initOpenAI();
			logger.info('OpenAI client initialized successfully');
		} catch (error) {
			logger.error({ err: error }, 'Failed to initialize OpenAI client');
			throw new ConfigurationError(
				'Failed to initialize OpenAI client',
				'OPENAI',
				{ error }
			);
		}
	};
}

export { createReadyHandler };
