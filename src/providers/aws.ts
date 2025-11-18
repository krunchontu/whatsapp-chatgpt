import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { Readable } from "stream";
import config from "../config";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger({ module: 'providers:aws' });

/**
 * @param text The sentence to be converted to speech
 * @returns Audio buffer
 */
async function ttsRequest(text: string): Promise<Buffer | null> {
	const client = new PollyClient({
		region: config.awsRegion,
		credentials: {
			accessKeyId: config.awsAccessKeyId,
			secretAccessKey: config.awsSecretAccessKey
		}
	});

	const params = {
		OutputFormat: "mp3",
		Text: text,
		Engine: config.awsPollyEngine,
		VoiceId: config.awsPollyVoiceId
	};

	try {
		const command = new SynthesizeSpeechCommand(params);
		const data = await client.send(command);

		if (data.AudioStream instanceof Readable) {
			const chunks: Buffer[] = [];
			for await (const chunk of data.AudioStream) {
				chunks.push(chunk);
			}
			return Buffer.concat(chunks);
		}
		return null;
	} catch (error) {
		logger.error({
			err: error,
			textLength: text?.length,
			metadata: error.$metadata ? {
				requestId: error.$metadata.requestId,
				cfId: error.$metadata.cfId,
				extendedRequestId: error.$metadata.extendedRequestId
			} : undefined
		}, 'AWS Polly TTS request failed');
		return null;
	}
}

export { ttsRequest };
