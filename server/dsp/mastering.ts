/**
 * mastering.ts — Main mastering orchestrator using Node.js modules
 * Coordinates: download → analyze → AI decisions → DSP → export → upload
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { analyzeAudio, type AudioAnalysis } from "./analyze";
import { applyDSP, convertToMP3, type MixSettings } from "./process";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

/**
 * Download file from URL
 */
async function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(filePath);

    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          downloadFile(response.headers.location as string, filePath).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
}

/**
 * Generate mix settings using AI LLM
 */
async function generateMixSettings(analysis: AudioAnalysis): Promise<MixSettings> {
  console.log(`[MASTERING] Generating mix settings via AI LLM`);

  const prompt = `You are a professional audio mastering engineer. Analyze this audio and provide precise mixing settings.

Audio Analysis:
- Duration: ${analysis.duration_seconds}s
- Sample Rate: ${analysis.sample_rate}Hz
- Channels: ${analysis.channels}
- LUFS: ${analysis.lufs}
- RMS: ${analysis.rms_db}dB
- Peak: ${analysis.peak_db}dB
- Crest Factor: ${analysis.crest_factor_db}dB
- Voice Type: ${analysis.voice_type}
- Spectral Centroid: ${analysis.spectral_centroid_hz}Hz
- Problems: ${JSON.stringify(analysis.problems)}

Return a JSON object with precise mastering settings for this audio.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a professional audio mastering engineer. Respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mix_settings",
          strict: true,
          schema: {
            type: "object",
            properties: {
              eq: { type: "object" },
              compression: { type: "object" },
              reverb: { type: "object" },
              stereo: { type: "object" },
              lufs_target: { type: "number" },
              reasoning: { type: "object" },
            },
            required: ["eq", "compression", "reverb", "stereo", "lufs_target", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from LLM");

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const settings = JSON.parse(contentStr) as MixSettings;
    console.log(`[MASTERING] Mix settings generated successfully`);
    return settings;
  } catch (err) {
    console.error(`[MASTERING] LLM error, using default settings:`, err);
    // Return sensible defaults
    return {
      eq: {
        highpass_hz: 100,
        lowpass_hz: 18000,
        low_shelf: { freq: 120, gain_db: 0.5, q: 0.707 },
        high_shelf: { freq: 10000, gain_db: 1.5, q: 0.707 },
        peak_bands: [
          { freq: 350, gain_db: -3.0, q: 1.2, label: "mud_cut" },
          { freq: 3000, gain_db: 0.0, q: 1.5, label: "harshness_cut" },
          { freq: 4000, gain_db: 1.5, q: 1.0, label: "presence_boost" },
          { freq: 7500, gain_db: 0.0, q: 2.0, label: "de_esser" },
        ],
      },
      compression: {
        threshold_db: -18.0,
        ratio: 3.0,
        attack_ms: 10.0,
        release_ms: 100.0,
        makeup_gain_db: 2.0,
      },
      reverb: {
        room_size: 0.25,
        damping: 0.6,
        wet_level: 0.08,
        dry_level: 0.92,
        width: 0.4,
      },
      stereo: {
        width_factor: 1.1,
      },
      lufs_target: -14.0,
      reasoning: {
        voice_type: analysis.voice_type,
        input_lufs: analysis.lufs,
        crest_factor_db: analysis.crest_factor_db,
        problems_detected: analysis.problems,
        key_decisions: ["Using default settings due to LLM unavailability"],
      },
    };
  }
}

/**
 * Main mastering job orchestrator
 */
export async function runMastering(
  jobId: string,
  sourceUrl: string,
  tempDir: string,
  userId: number
): Promise<{
  status: "success" | "error";
  wavUrl?: string;
  mp3Url?: string;
  analysis?: AudioAnalysis;
  mixSettings?: MixSettings;
  error?: string;
}> {
  try {
    console.log(`[MASTERING] Job ${jobId}: Starting mastering process`);
    console.log(`[MASTERING] Source URL: ${sourceUrl}`);

    // Ensure temp directory exists
    fs.mkdirSync(tempDir, { recursive: true });

    // Step 1: Download source audio
    console.log(`[MASTERING] Step 1: Downloading source audio`);
    const sourceFile = path.join(tempDir, "source.wav");
    await downloadFile(sourceUrl, sourceFile);
    console.log(`[MASTERING] Source downloaded: ${sourceFile}`);

    // Step 2: Analyze audio
    console.log(`[MASTERING] Step 2: Analyzing audio`);
    const analysis = await analyzeAudio(sourceFile);
    console.log(`[MASTERING] Analysis complete. LUFS: ${analysis.lufs}`);

    // Step 3: Generate mix settings via AI
    console.log(`[MASTERING] Step 3: Generating mix settings`);
    const mixSettings = await generateMixSettings(analysis);
    console.log(`[MASTERING] Mix settings ready`);

    // Step 4: Apply DSP processing
    console.log(`[MASTERING] Step 4: Applying DSP processing`);
    const masteredFile = path.join(tempDir, "mastered.wav");
    await applyDSP(sourceFile, masteredFile, mixSettings, analysis.sample_rate);
    console.log(`[MASTERING] DSP processing complete`);

    // Step 5: Convert to MP3
    console.log(`[MASTERING] Step 5: Converting to MP3`);
    const mp3File = path.join(tempDir, "mastered.mp3");
    await convertToMP3(masteredFile, mp3File);
    console.log(`[MASTERING] MP3 conversion complete`);

    // Step 6: Upload outputs to storage
    console.log(`[MASTERING] Step 6: Uploading to storage`);

    const wavBuffer = fs.readFileSync(masteredFile);
    const { url: wavUrl } = await storagePut(`outputs/${jobId}/mastered.wav`, wavBuffer, "audio/wav");
    console.log(`[MASTERING] WAV uploaded: ${wavUrl}`);

    const mp3Buffer = fs.readFileSync(mp3File);
    const { url: mp3Url } = await storagePut(`outputs/${jobId}/mastered.mp3`, mp3Buffer, "audio/mpeg");
    console.log(`[MASTERING] MP3 uploaded: ${mp3Url}`);

    console.log(`[MASTERING] Job ${jobId}: Complete!`);

    return {
      status: "success",
      wavUrl,
      mp3Url,
      analysis,
      mixSettings,
    };
  } catch (err) {
    const errorMsg = String(err);
    console.error(`[MASTERING] Job ${jobId}: Error:`, err);
    return {
      status: "error",
      error: errorMsg,
    };
  }
}
