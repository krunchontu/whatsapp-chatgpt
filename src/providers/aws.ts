import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
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

    const params = {
        OutputFormat: "mp3",
        Text: text,
        Engine: config.awsPollyEngine,
        VoiceId: config.awsPollyVoiceId
    };

    try {
        const command = new SynthesizeSpeechCommand(params);
        const data = await client.send(command);
        
        if (data.AudioStream) {
            return Buffer.from(await data.AudioStream.transformToByteArray());
        }
        return null;
    } catch (error) {
        console.error("An error occurred (TTS request)", error);
        return null;
    }
}

export { ttsRequest };
