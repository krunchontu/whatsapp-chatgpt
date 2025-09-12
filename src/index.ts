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

// Event handlers
import { onBrowserLaunched } from "./events/browser";
import { onQRReceived } from "./events/qr";
import { onLoadingScreen } from "./events/loading";
import { onAuthenticated } from "./events/authenticated";
import { onAuthenticationFailure } from "./events/authFailure";
import { createReadyHandler } from "./events/ready";
import { onMessageReceived, onMessageCreate } from "./events/message";

// Ready timestamp of the bot
let botReadyTimestamp: Date | null = null;

// Entrypoint
const start = async () => {
	console.debug("[DEBUG] Starting WhatsApp client...");
	console.debug(`[DEBUG] Environment:
                CHROME_BIN: ${process.env.CHROME_BIN || "not set"}
                SESSION_PATH: ${constants.sessionPath}
                WA_VERSION: 2.2412.54`);

	if (!existsSync(constants.sessionPath)) {
		mkdirSync(constants.sessionPath, { recursive: true });
	}

	const wwebVersion = "2.2412.54";
	cli.printIntro();

	// WhatsApp Client
	const client = new Client({
		puppeteer: {
			executablePath: process.platform === "win32" ? undefined : process.env.CHROME_BIN || "/usr/bin/chromium",
			args: puppeteerArgs,
			dumpio: true
		},
		authStrategy: new LocalAuth({
			dataPath: constants.sessionPath
		}),
		webVersionCache: {
			type: "remote",
			remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${wwebVersion}.html`
		}
	});

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

	// WhatsApp initialization with error handling
	try {
		client.initialize();
	} catch (error) {
		cli.printError(`Failed to initialize WhatsApp client: ${error}`);
		process.exit(1);
	}
};

start();

export { botReadyTimestamp };
