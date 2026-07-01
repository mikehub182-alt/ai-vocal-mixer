/**
 * masteringRunner.ts
 * Orchestrates mastering jobs using Node.js DSP modules (no subprocess spawning)
 * Streams progress updates back to the DB
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { updateJob } from "./masteringDb";
import { runMastering } from "./dsp/mastering";

const TEMP_BASE = os.tmpdir();

/**
 * Run mastering job for a given source URL
 * Orchestrates: download → analyze → AI decisions → DSP → export → upload
 */
export async function runMasteringJob(
  jobId: string,
  sourceUrl: string,
  storageBaseUrl: string,
  userId: number
): Promise<void> {
  console.log(`[MasteringRunner] Job ${jobId} started. Source URL: ${sourceUrl}`);

  const tempDir = path.join(TEMP_BASE, `mastering_${jobId}`);

  // Create temp directory
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Update job status to analyzing
    await updateJob(jobId, {
      status: "analyzing",
      stage: "Downloading and analyzing audio",
    });

    // Run mastering process
    console.log(`[MasteringRunner] Job ${jobId}: Starting mastering process`);
    const result = await runMastering(jobId, sourceUrl, tempDir, userId);

    // Update job with final results
    if (result.status === "success") {
      await updateJob(jobId, {
        status: "done",
        stage: "Complete",
        outputWavUrl: result.wavUrl || "",
        outputMp3Url: result.mp3Url || "",
        analysisReport: JSON.stringify(result.analysis || {}),
        mixSettings: JSON.stringify(result.mixSettings || {}),
      });
      console.log(`[MasteringRunner] Job ${jobId}: Mastering completed successfully`);
    } else {
      await updateJob(jobId, {
        status: "error",
        stage: `Error: ${result.error}`,
        errorMsg: result.error || "Unknown error",
      });
      console.error(`[MasteringRunner] Job ${jobId}: Mastering failed: ${result.error}`);
    }
  } catch (err) {
    const errorMsg = String(err);
    console.error(`[MasteringRunner] Job ${jobId}: Unexpected error:`, err);
    await updateJob(jobId, {
      status: "error",
      stage: `Error: ${errorMsg}`,
      errorMsg: errorMsg,
    });
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[MasteringRunner] Failed to cleanup temp dir:`, err);
    }
  }
}
