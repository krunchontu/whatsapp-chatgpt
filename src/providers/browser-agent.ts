import { OpenAI } from "@langchain/openai";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { initializeAgentExecutorWithOptions } from "langchain/agents";

export default class BrowserAgentProvider {
	// Can use other browser tools like RequestGetTool if you do not have a [SerpAPI](https://serpapi.com/) API key.
	tools = [
		new SerpAPI()
		// new RequestsGetTool(),
	];
	// Always select highest probability word in search
	model = new OpenAI({ temperature: 0 });

	fetch = async (query) => {
		const executor = await initializeAgentExecutorWithOptions(
			this.tools,
			this.model,
			{
				agentType: "zero-shot-react-description",
				verbose: true
			}
		);
		const result = await executor.call({ input: query });

		return result.output; // Return the final text instead of result.output
	};
}
