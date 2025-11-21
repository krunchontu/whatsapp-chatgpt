import { Message } from "whatsapp-web.js";
import BrowserAgentProvider from "../providers/browser-agent";
import * as cli from "../cli/ui";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'handlers:langchain' });

const browserAgent = new BrowserAgentProvider();

// TODO add conversation ID to build a chat history
const handleMessageLangChain = async (message: Message, prompt: string) => {
	try {
		const start = Date.now();
		const output = await browserAgent.fetch(prompt);
		const end = Date.now() - start;

		cli.print(`[GPT] Answer to ${message.from}: ${output}  | OpenAI request took ${end}ms)`);

		// Default: Text reply
		message.reply(output);
	} catch (error: any) {
		logger.error({
			err: error,
			chatId: message.from,
			prompt
		}, 'LangChain request failed');
		message.reply("An error occurred, please contact the administrator. (" + error.message + ")");
	}
};

export { handleMessageLangChain };
