import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { OpenAI } from "openai";
import ffmpeg from "fluent-ffmpeg";
import config from "../config";
import { getConfig } from "../handlers/ai-config";

export let openai: OpenAI;

export function initOpenAI() {
  openai = new OpenAI({
    apiKey: getConfig("gpt", "apiKey"),
    organization: config.openAIOrganization,
    timeout: 10000,
    maxRetries: 3
  });
}

export async function transcribeOpenAI(audioBuffer: Buffer): Promise<{ text: string; language: string }> {
  const tempdir = os.tmpdir();
  const oggPath = path.join(tempdir, randomUUID() + ".ogg");
  const wavPath = path.join(tempdir, randomUUID() + ".wav");
  
  try {
    fs.writeFileSync(oggPath, audioBuffer);
    await convertOggToWav(oggPath, wavPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: "whisper-1",
      language: config.transcriptionLanguage,
      response_format: "json"
    });

    return {
      text: transcription.text,
      language: config.transcriptionLanguage || ""
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  } finally {
    try {
      fs.unlinkSync(oggPath);
      fs.unlinkSync(wavPath);
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  }
}

async function convertOggToWav(oggPath: string, wavPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(oggPath)
			.toFormat("wav")
			.outputOptions("-acodec pcm_s16le")
			.output(wavPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}
