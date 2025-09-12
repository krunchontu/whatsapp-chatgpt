import { ChatOpenAI } from "@langchain/openai";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { createOpenAIToolsAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

declare global {
	interface ImportMeta {
		env: {
			VITE_SERPAPI_API_KEY: string;
		};
	}
}

export default class BrowserAgentProvider {
	// Can use other browser tools like RequestGetTool if you do not have a [SerpAPI](https://serpapi.com/) API key.
	tools = [
		new SerpAPI(import.meta.env.VITE_SERPAPI_API_KEY)
		// new RequestsGetTool(),
	];
	// Always select highest probability word in search
	model = new ChatOpenAI({ temperature: 0 });

	fetch = async (query: string): Promise<string> => {
		const prompt = ChatPromptTemplate.fromMessages([
			["system", "You are a helpful assistant that can access external tools."],
			["human", "{input}"],
			["placeholder", "{agent_scratchpad}"]
		]);

		const agent = await createOpenAIToolsAgent({
			llm: this.model,
			tools: this.tools,
			prompt
		});
		const executor = new AgentExecutor({
			agent,
			tools: this.tools,
			verbose: true
		});
		const result = await executor.call({ input: query });

		return result.output; // Return the final text instead of result.output
	};
}
