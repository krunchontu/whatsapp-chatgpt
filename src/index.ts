// Suppress punycode deprecation warning
process.removeAllListeners("warning");

import { Client, Events, LocalAuth } from "whatsapp-web.js";
import { existsSync, mkdirSync } from "fs";

// Constants
import constants from "./constants";

// CLI
import * as cli from "./cli/ui";

// Config
import { puppeteerArgs } from "./config/puppeteer";

// Logging and error handling
import { logger, createChildLogger } from "./lib/logger";
import { setupGlobalErrorHandlers } from "./middleware/errorHandler";
import { ConfigurationError } from "./lib/errors";
import { initSentry } from "./lib/sentry";
import { initRedis, closeRedis } from "./lib/redis";
import { initRateLimiters } from "./middleware/rateLimiter";
import { setWhatsAppClient } from "./lib/whatsapp-client";
import { createTranscriptionWorker } from "./queue/workers/transcription.worker";
import { startConversationCleanup } from "./db/cleanup-scheduler";

// Event handlers
import { onBrowserLaunched } from "./events/browser";
import { onQRReceived } from "./events/qr";
import { onLoadingScreen } from "./events/loading";
import { onAuthenticated } from "./events/authenticated";
import { onAuthenticationFailure } from "./events/authFailure";
import { createReadyHandler } from "./events/ready";
import { onMessageReceived, onMessageCreate } from "./events/message";

// Create logger for this module
const appLogger = createChildLogger({ module: 'index' });

// Ready timestamp of the bot
let botReadyTimestamp: Date | null = null;

// Entrypoint
const start = async () => {
	// Setup global error handlers
	setupGlobalErrorHandlers();

	// Initialize Sentry error tracking (production only)
	initSentry();

	// Initialize Redis (for rate limiting and job queues)
	appLogger.debug('Initializing Redis client');
	initRedis();

	// Initialize rate limiters
	appLogger.debug('Initializing rate limiters');
	initRateLimiters();

	// Start conversation cleanup scheduler (daily job)
	appLogger.debug('Starting conversation cleanup scheduler');
	startConversationCleanup();

	appLogger.info('Starting WhatsApp ChatGPT bot');
	appLogger.debug({
		chromeBin: process.env.CHROME_BIN || 'not set',
		sessionPath: constants.sessionPath,
		waVersion: '2.2412.54',
		platform: process.platform,
		nodeVersion: process.version
	}, 'Environment configuration');

	// Ensure session directory exists
	try {
		if (!existsSync(constants.sessionPath)) {
			appLogger.info({ path: constants.sessionPath }, 'Creating session directory');
			mkdirSync(constants.sessionPath, { recursive: true });
		}
	} catch (error) {
		throw new ConfigurationError(
			'Failed to create session directory',
			'SESSION_PATH',
			{ path: constants.sessionPath, error }
		);
	}

	const wwebVersion = "2.2412.54";
	cli.printIntro();

	// WhatsApp Client
	appLogger.debug('Initializing WhatsApp Web client');
	const client = new Client({
		puppeteer: {
			executablePath: process.platform === "win32" ? undefined : process.env.CHROME_BIN || "/usr/bin/chromium",
			args: puppeteerArgs,
			dumpio: false // Reduce noise in logs
		},
		authStrategy: new LocalAuth({
			dataPath: constants.sessionPath
		}),
		webVersionCache: {
			type: "remote",
			remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`
		}
	});

	// Set global WhatsApp client for workers and handlers
	setWhatsAppClient(client);

	// Register event handlers
	appLogger.debug('Registering event handlers');
	client.on("browser_launched", onBrowserLaunched);
	client.on(Events.QR_RECEIVED, onQRReceived);
	client.on(Events.LOADING_SCREEN, onLoadingScreen);
	client.on(Events.AUTHENTICATED, onAuthenticated);
	client.on(Events.AUTHENTICATION_FAILURE, onAuthenticationFailure);
	client.on(
		Events.READY,
		createReadyHandler((ts) => (botReadyTimestamp = ts))
	);
	client.on(Events.MESSAGE_RECEIVED, onMessageReceived);
	client.on(Events.MESSAGE_CREATE, onMessageCreate);

	// Initialize transcription worker (if Redis enabled)
	if (config.redis.enabled) {
		try {
			appLogger.info('Starting transcription worker');
			createTranscriptionWorker();
		} catch (error) {
			appLogger.error({ err: error }, 'Failed to start transcription worker');
			// Don't exit - worker is optional, bot can still function
		}
	} else {
		appLogger.warn('Redis disabled, transcription worker will not start');
	}

	// WhatsApp initialization with error handling
	try {
		appLogger.info('Initializing WhatsApp client');
		client.initialize();
	} catch (error) {
		appLogger.fatal({ err: error }, 'Failed to initialize WhatsApp client');
		cli.printError(`Failed to initialize WhatsApp client: ${error}`);
		process.exit(1);
	}
};

start().catch((error) => {
	appLogger.fatal({ err: error }, 'Fatal error during startup');
	cli.printError(`Fatal startup error: ${error}`);
	process.exit(1);
});

export { botReadyTimestamp };
