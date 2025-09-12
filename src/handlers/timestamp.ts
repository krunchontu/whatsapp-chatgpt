import { Message } from "whatsapp-web.js";
import * as cli from "../cli/ui";
import { botReadyTimestamp } from "../index";

function shouldIgnoreByTimestamp(message: Message): boolean {
	if (message.timestamp == null) return false;
	const messageTimestamp = new Date(message.timestamp * 1000);

	if (botReadyTimestamp == null) {
		cli.print("Ignoring message because bot is not ready yet: " + message.body);
		return true;
	}

	if (messageTimestamp < botReadyTimestamp) {
		cli.print("Ignoring old message: " + message.body);
		return true;
	}

	return false;
}

export { shouldIgnoreByTimestamp };
