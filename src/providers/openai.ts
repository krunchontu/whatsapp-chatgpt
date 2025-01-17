import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { OpenAI } from "openai";
import { ChatGPTAPI } from 'chatgpt';
import ffmpeg from "fluent-ffmpeg";
import config from "../config";
import { getConfig } from "../handlers/ai-config";

export let openai: OpenAI;
export let chatgpt: ChatGPTAPI;

export function initOpenAI() {
  const apiKey = getConfig("gpt", "apiKey");
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  openai = new OpenAI({
    apiKey: apiKey,
    organization: config.openAIOrganization,
    project: config.openAIProject,
    timeout: 10000,
    maxRetries: 3
  });

  // Initialize ChatGPT client
  chatgpt = new ChatGPTAPI({
    apiKey: apiKey,
    completionParams: {
      model: config.openAIModel,
      temperature: 0.7,
      max_tokens: config.maxModelTokens
    }
  });
}

export async function transcribeOpenAI(audioBuffer: Buffer): Promise<{ text: string; language: string }> {
  const tempdir = os.tmpdir();
  const oggPath = path.join(tempdir, randomUUID() + ".ogg");
  const wavPath = path.join(tempdir, randomUUID() + ".wav");
  
  try {
    // Ensure OpenAI is initialized
    if (!openai) {
      initOpenAI();
    }

    fs.writeFileSync(oggPath, audioBuffer);
    await convertOggToWav(oggPath, wavPath);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: "whisper-1",
      language: config.transcriptionLanguage,
      response_format: "json"
    });

    // Updated response handling
    if (!transcription || typeof transcription !== "object" || !transcription.text) {
      throw new Error("Invalid transcription response from OpenAI API");
    }

    return {
      text: transcription.text,
      language: config.transcriptionLanguage || ""
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error(`Transcription failed: ${error.message}`);
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
