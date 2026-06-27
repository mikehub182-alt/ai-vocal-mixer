/**
 * mastering.ts — tRPC router for AI mastering jobs
 */
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as z from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createJob, getJob, listUserJobs, updateJob } from "../masteringDb";
import { storagePut } from "../storage";
import { runMasteringJob } from "../masteringRunner";

const ALLOWED_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/ogg",
];

const MAX_FILE_SIZE_MB = 100;

export const masteringRouter = router({
  /**
   * Upload audio file and kick off mastering job.
   * Accepts base64-encoded file data from the frontend.
   */
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        mimeType: z.string(),
        fileDataBase64: z.string(), // base64 encoded file
        fileSizeBytes: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate MIME type
      const normalizedMime = input.mimeType.toLowerCase().split(";")[0].trim();
      if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported file type: ${input.mimeType}. Supported: WAV, MP3, FLAC, AIFF, OGG`,
        });
      }

      // Validate file size
      const sizeMB = input.fileSizeBytes / (1024 * 1024);
      if (sizeMB > MAX_FILE_SIZE_MB) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File too large: ${sizeMB.toFixed(1)} MB. Maximum: ${MAX_FILE_SIZE_MB} MB`,
        });
      }

      const jobId = nanoid();
      console.log(`[Mastering] Upload: New job ID: ${jobId}, filename: ${input.filename}, size: ${input.fileSizeBytes} bytes`);
      const ext = input.filename.split(".").pop()?.toLowerCase() || "wav";
      const sourceKey = `uploads/${jobId}/source.${ext}`;

      // Decode base64 and upload to storage
      console.log(`[Mastering] Upload: Decoding base64...`);
      const fileBuffer = Buffer.from(input.fileDataBase64, "base64");
      console.log(`[Mastering] Upload: Buffer created (${fileBuffer.length} bytes). Uploading to storage...`);
      const { url: sourceUrl } = await storagePut(sourceKey, fileBuffer, normalizedMime);
      console.log(`[Mastering] Upload: File uploaded. Source URL: ${sourceUrl}`);

      // Create job record
      console.log(`[Mastering] Upload: Creating job record...`);
      await createJob({
        id: jobId,
        userId: ctx.user.id,
        status: "uploading",
        stage: "Uploading audio file",
        progress: 10,
        sourceKey,
        sourceUrl,
        sourceFilename: input.filename,
        sourceMime: normalizedMime,
      });
      console.log(`[Mastering] Upload: Job record created.`);

      // Kick off background processing (fire and forget)
      console.log(`[Mastering] Upload: Scheduling background job...`);
      setImmediate(async () => {
        console.log(`[Mastering] Job ${jobId}: Background job started`);
        try {
          console.log(`[Mastering] Job ${jobId}: Updating status to analyzing...`);
          await updateJob(jobId, { status: "analyzing", stage: "Analyzing audio", progress: 20 });
          console.log(`[Mastering] Job ${jobId}: Calling runMasteringJob...`);
          await runMasteringJob(jobId, sourceUrl);
          console.log(`[Mastering] Job ${jobId}: Background job completed successfully`);
        } catch (err) {
          console.error(`[Mastering] Job ${jobId} failed:`, err);
        }
      });

      console.log(`[Mastering] Upload: Returning jobId ${jobId} to frontend`);
      return { jobId, status: "uploading" };
    }),

  /**
   * Get job status and results.
   */
  getJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await getJob(input.jobId);
      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (job.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      return {
        id: job.id,
        status: job.status,
        stage: job.stage,
        progress: job.progress ?? 0,
        sourceFilename: job.sourceFilename,
        sourceUrl: job.sourceUrl,
        outputWavUrl: job.outputWavUrl,
        outputMp3Url: job.outputMp3Url,
        mixSettings: job.mixSettings ? JSON.parse(job.mixSettings) : null,
        analysisReport: job.analysisReport ? JSON.parse(job.analysisReport) : null,
        errorMsg: job.errorMsg,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    }),

  /**
   * List user's mastering jobs.
   */
  listJobs: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const jobs = await listUserJobs(ctx.user.id, input?.limit ?? 20);
      return jobs.map((job) => ({
        id: job.id,
        status: job.status,
        stage: job.stage,
        progress: job.progress ?? 0,
        sourceFilename: job.sourceFilename,
        outputWavUrl: job.outputWavUrl,
        outputMp3Url: job.outputMp3Url,
        errorMsg: job.errorMsg,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }));
    }),

  /**
   * Delete a job (cleanup).
   */
  deleteJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await getJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      await updateJob(input.jobId, { status: "error", errorMsg: "Deleted by user" });
      return { success: true };
    }),
});
