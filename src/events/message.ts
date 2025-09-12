import { Message } from "whatsapp-web.js";
import constants from "../constants";
import { handleIncomingMessage } from "../handlers/message";

async function onMessageReceived(message: Message) {
	if (message.from == constants.statusBroadcast) return;
	if (message.hasQuotedMsg) return;
	await handleIncomingMessage(message);
}

async function onMessageCreate(message: Message) {
	if (message.from == constants.statusBroadcast) return;
	if (message.hasQuotedMsg) return;
	if (!message.fromMe) return;
	await handleIncomingMessage(message);
}

export { onMessageReceived, onMessageCreate };
