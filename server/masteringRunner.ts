/**
 * masteringRunner.ts
 * Spawns the Python DSP worker as a child process, streams progress updates
 * back to the DB, and handles LLM-based AI decisions.
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { updateJob } from "./masteringDb";

const DSP_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "dsp");

// ------------------------------------------------------------------ //
// LLM-based AI decisions                                               //
// ------------------------------------------------------------------ //

export async function getAIDecisions(analysis: Record<string, unknown>): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a professional audio mastering engineer AI. 
Analyze the provided audio analysis data and return a JSON mixing/mastering settings object.
You MUST return ONLY valid JSON with this exact structure:
{
  "eq": {
    "highpass_hz": <number 60-120>,
    "lowpass_hz": <number 16000-20000>,
    "low_shelf": {"freq": <number>, "gain_db": <-3 to 3>, "q": 0.707},
    "high_shelf": {"freq": <number>, "gain_db": <-3 to 4>, "q": 0.707},
    "peak_bands": [
      {"freq": <number>, "gain_db": <-6 to 6>, "q": <0.5-3>, "label": "<string>"}
    ]
  },
  "compression": {
    "threshold_db": <-30 to -8>,
    "ratio": <1.5 to 8>,
    "attack_ms": <1 to 50>,
    "release_ms": <50 to 500>,
    "makeup_gain_db": <0 to 6>
  },
  "reverb": {
    "room_size": <0 to 0.5>,
    "damping": <0.3 to 0.8>,
    "wet_level": <0 to 0.15>,
    "dry_level": <0.85 to 1.0>,
    "width": <0.2 to 0.8>
  },
  "stereo": {"width_factor": <0.8 to 1.4>},
  "lufs_target": <-16 to -9>,
  "reasoning": {
    "voice_type": "<bass|baritone|tenor|alto|mezzo|soprano>",
    "genre_detected": "<string>",
    "key_decisions": ["<string>", ...]
  }
}`;

  const userPrompt = `Audio Analysis Report:
${JSON.stringify(analysis, null, 2)}

Based on this analysis, provide professional mastering settings. 
Consider: voice type, dynamic range (crest factor), spectral balance, detected problems, and LUFS.
Target -14 LUFS for streaming. Be precise and musical.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mastering_settings",
          strict: true,
          schema: {
            type: "object",
            properties: {
              eq: {
                type: "object",
                properties: {
                  highpass_hz: { type: "number" },
                  lowpass_hz: { type: "number" },
                  low_shelf: {
                    type: "object",
                    properties: {
                      freq: { type: "number" },
                      gain_db: { type: "number" },
                      q: { type: "number" },
                    },
                    required: ["freq", "gain_db", "q"],
                    additionalProperties: false,
                  },
                  high_shelf: {
                    type: "object",
                    properties: {
                      freq: { type: "number" },
                      gain_db: { type: "number" },
                      q: { type: "number" },
                    },
                    required: ["freq", "gain_db", "q"],
                    additionalProperties: false,
                  },
                  peak_bands: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        freq: { type: "number" },
                        gain_db: { type: "number" },
                        q: { type: "number" },
                        label: { type: "string" },
                      },
                      required: ["freq", "gain_db", "q", "label"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["highpass_hz", "lowpass_hz", "low_shelf", "high_shelf", "peak_bands"],
                additionalProperties: false,
              },
              compression: {
                type: "object",
                properties: {
                  threshold_db: { type: "number" },
                  ratio: { type: "number" },
                  attack_ms: { type: "number" },
                  release_ms: { type: "number" },
                  makeup_gain_db: { type: "number" },
                },
                required: ["threshold_db", "ratio", "attack_ms", "release_ms", "makeup_gain_db"],
                additionalProperties: false,
              },
              reverb: {
                type: "object",
                properties: {
                  room_size: { type: "number" },
                  damping: { type: "number" },
                  wet_level: { type: "number" },
                  dry_level: { type: "number" },
                  width: { type: "number" },
                },
                required: ["room_size", "damping", "wet_level", "dry_level", "width"],
                additionalProperties: false,
              },
              stereo: {
                type: "object",
                properties: { width_factor: { type: "number" } },
                required: ["width_factor"],
                additionalProperties: false,
              },
              lufs_target: { type: "number" },
              reasoning: {
                type: "object",
                properties: {
                  voice_type: { type: "string" },
                  genre_detected: { type: "string" },
                  key_decisions: { type: "array", items: { type: "string" } },
                },
                required: ["voice_type", "genre_detected", "key_decisions"],
                additionalProperties: false,
              },
            },
            required: ["eq", "compression", "reverb", "stereo", "lufs_target", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[AI Decisions] LLM call failed, using rule-based fallback:", err);
  }

  // Fallback: rule-based (will be handled by Python worker)
  return {};
}

// ------------------------------------------------------------------ //
// Main runner                                                          //
// ------------------------------------------------------------------ //

export async function runMasteringJob(
  jobId: string,
  sourceUrl: string,
  analysis?: Record<string, unknown>
): Promise<void> {
  const tmpDir = os.tmpdir();
  const configPath = path.join(tmpDir, `mastering_config_${jobId}.json`);
  const decisionsPath = path.join(tmpDir, `mastering_decisions_${jobId}.json`);

  try {
    // If we already have analysis, get AI decisions first
    let aiDecisions: Record<string, unknown> = {};
    if (analysis && Object.keys(analysis).length > 0) {
      await updateJob(jobId, { status: "analyzing", stage: "AI generating mix decisions", progress: 35 });
      aiDecisions = await getAIDecisions(analysis);
      if (Object.keys(aiDecisions).length > 0) {
        fs.writeFileSync(decisionsPath, JSON.stringify(aiDecisions));
      }
    }

    // Write config for Python worker
    const config = {
      job_id: jobId,
      source_url: sourceUrl,
      output_base_key: `outputs/${jobId}`,
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    // Spawn Python worker
    const env = {
      ...process.env,
      PYTHONPATH: DSP_DIR,
      AI_DECISIONS_FILE: Object.keys(aiDecisions).length > 0 ? decisionsPath : "",
    };

    await new Promise<void>((resolve, reject) => {
      const worker = spawn("python3", [path.join(DSP_DIR, "worker.py"), configPath], {
        env,
        cwd: DSP_DIR,
      });

      let stderrBuf = "";

      worker.stdout.on("data", async (chunk: Buffer) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "progress") {
              await updateJob(jobId, {
                status: msg.progress < 100 ? "processing" : "exporting",
                stage: msg.stage,
                progress: msg.progress,
              }).catch(() => {});
            } else if (msg.type === "analysis") {
              // Analysis done, get AI decisions now if not already done
              if (Object.keys(aiDecisions).length === 0) {
                await updateJob(jobId, { status: "analyzing", stage: "AI generating mix decisions", progress: 38 });
                aiDecisions = await getAIDecisions(msg.data);
                if (Object.keys(aiDecisions).length > 0) {
                  fs.writeFileSync(decisionsPath, JSON.stringify(aiDecisions));
                  // Restart won't work mid-flight, decisions file will be used if worker re-reads it
                }
              }
            } else if (msg.type === "decisions") {
              // Store decisions in DB
              await updateJob(jobId, {
                mixSettings: JSON.stringify(msg.data),
              }).catch(() => {});
            } else if (msg.type === "done") {
              // Upload outputs to storage
              await updateJob(jobId, {
                status: "exporting",
                stage: "Uploading to cloud storage",
                progress: 90,
              });

              // The Python worker already uploaded; store the keys/URLs
              await updateJob(jobId, {
                status: "done",
                stage: "Complete",
                progress: 100,
                outputWavKey: msg.wav_key,
                outputWavUrl: msg.wav_url,
                outputMp3Key: msg.mp3_key,
                outputMp3Url: msg.mp3_url,
                analysisReport: JSON.stringify(msg.analysis),
                mixSettings: JSON.stringify(msg.mix_settings),
              });
              resolve();
            } else if (msg.type === "error") {
              await updateJob(jobId, {
                status: "error",
                stage: "Failed",
                errorMsg: msg.message,
              }).catch(() => {});
              reject(new Error(msg.message));
            }
          } catch {
            // Non-JSON line, ignore
          }
        }
      });

      worker.stderr.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString();
      });

      worker.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python worker exited with code ${code}: ${stderrBuf}`));
        }
      });

      worker.on("error", reject);
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: "error",
      stage: "Failed",
      errorMsg: errMsg,
    }).catch(() => {});
    throw err;
  } finally {
    // Cleanup temp files
    [configPath, decisionsPath].forEach((f) => {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    });
  }
}
