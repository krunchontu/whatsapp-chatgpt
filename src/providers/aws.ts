import { PollyClient, SynthesizeSpeechCommand, type SynthesizeSpeechCommandInput, type VoiceId } from "@aws-sdk/client-polly";
import { Readable } from "stream";
import config from "../config";

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

	const params: SynthesizeSpeechCommandInput = {
		OutputFormat: "mp3",
		Text: text,
		Engine: config.awsPollyEngine,
		VoiceId: config.awsPollyVoiceId as VoiceId
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
		console.error("An error occurred (TTS request)", error);
		if (typeof error === "object" && error && "$metadata" in error) {
			const metadata = (error as any).$metadata;
			console.log({
				requestId: metadata.requestId,
				cfId: metadata.cfId,
				extendedRequestId: metadata.extendedRequestId
			});
		}
		return null;
	}
}

export { ttsRequest };
