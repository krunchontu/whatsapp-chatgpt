import * as cli from "../cli/ui";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'events:authenticated' });

function onAuthenticated() {
	const authTime = new Date();
	logger.info({ timestamp: authTime.toISOString() }, 'WhatsApp authentication successful');
	cli.printAuthenticated();
}

export { onAuthenticated };
