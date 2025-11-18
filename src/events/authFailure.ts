import * as cli from "../cli/ui";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'events:auth-failure' });

function onAuthenticationFailure() {
	logger.error('WhatsApp authentication failed');
	cli.printAuthenticationFailure();
}

export { onAuthenticationFailure };
