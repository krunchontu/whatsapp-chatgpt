import { Message } from "whatsapp-web.js";
import { aiConfigTarget, aiConfigTypes, aiConfigValues, IAiConfig } from "../types/ai-config";
// Removed for MVP (v2): dalleImageSize, TTSModule, StableDiffusionModule
import { GeneralModule } from "../commands/general";
import { ChatModule } from "../commands/chat";
import { ICommandDefinition } from "../types/commands";
import { GptModule } from "../commands/gpt";
import { TranscriptionModule } from "../commands/transcription";
import { TranslateModule } from "../commands/translate";
import { UsageModule } from "../commands/usage";
import { AuditModule } from "../commands/audit";
import { RoleModule } from "../commands/role";
import { createChildLogger } from "../lib/logger";
import { AuditLogger } from "../services/auditLogger";
import { UserRepository } from "../db/repositories/user.repository";

import config from "../config";

const logger = createChildLogger({ module: 'handlers:ai-config' });

let aiConfig: IAiConfig = {
	// Removed for MVP (v2): dalle config
	commandsMap: {}
};

const initAiConfig = () => {
	// Register commands (removed TTSModule, StableDiffusionModule for MVP - v2 features)
	[ChatModule, GeneralModule, GptModule, TranscriptionModule, TranslateModule, UsageModule, AuditModule, RoleModule].forEach((module) => {
		aiConfig.commandsMap[module.key] = module.register();
	});
};

const handleMessageAIConfig = async (message: Message, prompt: any) => {
	try {
		logger.info({
			chatId: message.from,
			prompt
		}, 'AI config command received');

		const args: string[] = prompt.split(" ");

		/*
			!config
			!config help
		*/
		if (args.length == 1 || prompt === "help") {
			// Available commands
			let helpMessage = "Available commands:\n";
			for (let target in aiConfigTarget) {
				for (let type in aiConfigTypes[target]) {
					helpMessage += `\t${config.aiConfigPrefix} ${target} ${type} <value> - Set ${target} ${type} to <value>\n`;
				}
			}
			for (let module in aiConfig.commandsMap) {
				for (let command in aiConfig.commandsMap[module]) {
					helpMessage += `\t${config.aiConfigPrefix} ${module} ${command} ${aiConfig.commandsMap[module][command].help}\n`;
				}
			}

			// Available values
			helpMessage += "\nAvailable values:\n";
			for (let target in aiConfigTarget) {
				for (let type in aiConfigTypes[target]) {
					helpMessage += `\t${target} ${type}: ${Object.keys(aiConfigValues[target][type]).join(", ")}\n`;
				}
			}
			for (let module in aiConfig.commandsMap) {
				for (let command in aiConfig.commandsMap[module]) {
					if (aiConfig.commandsMap[module][command].hint) {
						let hint = aiConfig.commandsMap[module][command].hint;
						if (typeof hint === "object") {
							hint = Object.keys(hint).join(", ");
						}
						helpMessage += `\t${module} ${command}: ${hint}\n`;
					}
				}
			}
			message.reply(helpMessage);
			return;
		}

		// !config <target> <type> <value>
		if (args.length < 2) {
			message.reply(
				"Invalid number of arguments, please use the following format: <target> <type> <value> or type !config help for more information."
			);
			return;
		}

		const target: string = args[0];
		const type: string = args[1];
		const value: string | undefined = args.length >= 3 ? args.slice(2).join(" ") : undefined;

		if (!(target in aiConfigTarget) && !(target in aiConfig.commandsMap)) {
			message.reply("Invalid target, please use one of the following: " + Object.keys(aiConfigTarget).join(", "));
			return;
		}

		if (target && type && aiConfig.commandsMap[target]) {
			if (aiConfig.commandsMap[target][type]) {
				aiConfig.commandsMap[target][type].execute(message, value);
			} else {
				message.reply("Invalid command, please use one of the following: " + Object.keys(aiConfig.commandsMap[target]).join(", "));
			}
			return;
		}

		if (typeof aiConfigTypes[target] !== "object" || !(type in aiConfigTypes[target])) {
			message.reply("Invalid type, please use one of the following: " + Object.keys(aiConfigTypes[target]).join(", "));
			return;
		}

		if (value === undefined || (typeof aiConfigValues[target][type] === "object" && !(value in aiConfigValues[target][type]))) {
			message.reply("Invalid value, please use one of the following: " + Object.keys(aiConfigValues[target][type]).join(", "));
			return;
		}

		const oldValue = aiConfig[target][type];
		aiConfig[target][type] = value;

		// Log configuration change to audit log
		const user = await UserRepository.findByPhoneNumber(message.from);
		if (user) {
			await AuditLogger.logConfigChange({
				performedBy: user,
				setting: `${target}.${type}`,
				oldValue,
				newValue: value
			});
		}

		message.reply("Successfully set " + target + " " + type + " to " + value);
	} catch (error: any) {
		logger.error({
			err: error,
			chatId: message.from,
			prompt
		}, 'AI config command failed');
		message.reply("An error occurred, please contact the administrator. (" + error.message + ")");
	}
};

export function getCommand(module: string, command: string): ICommandDefinition {
	return aiConfig.commandsMap[module][command];
}

export function getConfig(target: string, type: string): any {
	if (aiConfig.commandsMap[target] && aiConfig.commandsMap[target][type]) {
		if (typeof aiConfig.commandsMap[target][type].data === "function") {
			return aiConfig.commandsMap[target][type].data();
		}
		return aiConfig.commandsMap[target][type].data;
	}
	return aiConfig[target][type];
}

export function executeCommand(target: string, type: string, message: Message, value?: string | undefined) {
	if (aiConfig.commandsMap[target] && aiConfig.commandsMap[target][type]) {
		if (typeof aiConfig.commandsMap[target][type].execute === "function") {
			return aiConfig.commandsMap[target][type].execute(message, value);
		}
	}
}

export { aiConfig, handleMessageAIConfig, initAiConfig };
