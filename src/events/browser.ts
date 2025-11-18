import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'events:browser' });

function onBrowserLaunched() {
	const launchTime = new Date();
	logger.info({ timestamp: launchTime.toISOString() }, 'Chromium browser successfully launched');
}

export { onBrowserLaunched };
