// Suppress punycode deprecation warning
process.removeAllListeners("warning");

import qrcode from "qrcode";
import { Client, Message, Events, LocalAuth } from "whatsapp-web.js";

// Constants
import constants from "./constants";

// Command Modules
import { GeneralModule } from "./commands/general";
import { TranslateModule } from "./commands/translate";

// CLI
import * as cli from "./cli/ui";
import { handleIncomingMessage } from "./handlers/message";

// Config
import { initAiConfig } from "./handlers/ai-config";
import { initOpenAI } from "./providers/openai";

// Ready timestamp of the bot
let botReadyTimestamp: Date | null = null;

// Entrypoint
const start = async () => {
	console.debug("[DEBUG] Starting WhatsApp client...");
	console.debug(`[DEBUG] Environment: 
		CHROME_BIN: ${process.env.CHROME_BIN || "not set"}
		SESSION_PATH: ${constants.sessionPath}
		WA_VERSION: 2.2412.54`);

	const wwebVersion = "2.2412.54";
	cli.printIntro();

	// WhatsApp Client
	const client = new Client({
		puppeteer: {
			executablePath: process.platform === "win32" ? undefined : process.env.CHROME_BIN || "/usr/bin/chromium",
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				"--disable-accelerated-2d-canvas",
				"--no-first-run",
				"--no-zygote",
				"--single-process",
				"--disable-gpu",
				"--remote-debugging-port=9222",
				"--disable-software-rasterizer",
				"--disable-background-networking",
				"--disable-background-timer-throttling",
				"--disable-breakpad",
				"--disable-client-side-phishing-detection",
				"--disable-component-update",
				"--disable-default-apps",
				"--disable-domain-reliability",
				"--disable-extensions",
				"--disable-features=AudioServiceOutOfProcess",
				"--disable-hang-monitor",
				"--disable-ipc-flooding-protection",
				"--disable-popup-blocking",
				"--disable-prompt-on-repost",
				"--disable-renderer-backgrounding",
				"--disable-sync",
				"--force-color-profile=srgb",
				"--metrics-recording-only",
				"--safebrowsing-disable-auto-update",
				"--enable-automation",
				"--password-store=basic",
				"--use-mock-keychain",
				"--headless=new"
			],
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

	// Browser launch confirmation
	client.on("browser_launched", () => {
		const launchTime = new Date();
		console.log("Chromium browser successfully launched");
		console.debug(`[DEBUG] Browser launch time: ${launchTime.toISOString()}`);
	});

	// WhatsApp auth
	client.on(Events.QR_RECEIVED, (qr: string) => {
		const qrTime = new Date();
		console.log("");
		console.debug(`[DEBUG] QR received at: ${qrTime.toISOString()}`);
		qrcode.toString(
			qr,
			{
				type: "terminal",
				small: true,
				margin: 2,
				scale: 1
			},
			(err, url) => {
				if (err) throw err;
				cli.printQRCode(url);
			}
		);
	});

	// WhatsApp loading
	client.on(Events.LOADING_SCREEN, (percent) => {
		if (percent == "0") {
			cli.printLoading();
		}
	});

	// WhatsApp authenticated
	client.on(Events.AUTHENTICATED, () => {
		const authTime = new Date();
		cli.printAuthenticated();
		console.debug(`[DEBUG] Authenticated at: ${authTime.toISOString()}`);
	});

	// WhatsApp authentication failure
	client.on(Events.AUTHENTICATION_FAILURE, () => {
		cli.printAuthenticationFailure();
	});

	// WhatsApp ready
	client.on(Events.READY, () => {
		// Print outro
		cli.printOutro();

		// Set bot ready timestamp
		botReadyTimestamp = new Date();
		console.debug(`[DEBUG] Bot ready at: ${botReadyTimestamp.toISOString()}`);

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

		// Command modules are registered in initAiConfig()
	});

	// WhatsApp message
	client.on(Events.MESSAGE_RECEIVED, async (message: any) => {
		// Ignore if message is from status broadcast
		if (message.from == constants.statusBroadcast) return;

		// Ignore if it's a quoted message, (e.g. Bot reply)
		if (message.hasQuotedMsg) return;

		await handleIncomingMessage(message);
	});

	// Reply to own message
	client.on(Events.MESSAGE_CREATE, async (message: Message) => {
		// Ignore if message is from status broadcast
		if (message.from == constants.statusBroadcast) return;

		// Ignore if it's a quoted message, (e.g. Bot reply)
		if (message.hasQuotedMsg) return;

		// Ignore if it's not from me
		if (!message.fromMe) return;

		await handleIncomingMessage(message);
	});

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
