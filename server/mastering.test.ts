import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the mastering DB and runner modules
vi.mock("./masteringDb", () => ({
  createJob: vi.fn().mockResolvedValue(undefined),
  getJob: vi.fn(),
  updateJob: vi.fn().mockResolvedValue(undefined),
  listUserJobs: vi.fn().mockResolvedValue([]),
}));

vi.mock("./masteringRunner", () => ({
  runMasteringJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "uploads/test/source.mp3", url: "/manus-storage/uploads/test/source.mp3" }),
}));

import { createJob, getJob, listUserJobs } from "./masteringDb";

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("mastering.upload", () => {
  it("rejects unsupported MIME type", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.mastering.upload({
        filename: "test.txt",
        mimeType: "text/plain",
        fileDataBase64: btoa("hello"),
        fileSizeBytes: 5,
      })
    ).rejects.toThrow(/Unsupported file type/);
  });

  it("rejects files over 100 MB", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.mastering.upload({
        filename: "big.wav",
        mimeType: "audio/wav",
        fileDataBase64: btoa("x"),
        fileSizeBytes: 101 * 1024 * 1024,
      })
    ).rejects.toThrow(/File too large/);
  });

  it("accepts valid WAV upload and returns jobId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.mastering.upload({
      filename: "vocal.wav",
      mimeType: "audio/wav",
      fileDataBase64: btoa("RIFF...."),
      fileSizeBytes: 1024 * 1024,
    });
    expect(result).toHaveProperty("jobId");
    expect(result.status).toBe("uploading");
    expect(createJob).toHaveBeenCalled();
  });

  it("accepts valid MP3 upload", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.mastering.upload({
      filename: "track.mp3",
      mimeType: "audio/mpeg",
      fileDataBase64: btoa("ID3..."),
      fileSizeBytes: 5 * 1024 * 1024,
    });
    expect(result).toHaveProperty("jobId");
  });
});

describe("mastering.getJob", () => {
  beforeEach(() => {
    vi.mocked(getJob).mockReset();
  });

  it("throws NOT_FOUND for missing job", async () => {
    vi.mocked(getJob).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.mastering.getJob({ jobId: "nonexistent" })
    ).rejects.toThrow(/not found/i);
  });

  it("throws FORBIDDEN for job owned by another user", async () => {
    vi.mocked(getJob).mockResolvedValue({
      id: "job1",
      userId: 999, // different user
      status: "done",
      stage: null,
      progress: 100,
      sourceKey: null,
      sourceUrl: null,
      sourceFilename: "test.wav",
      sourceMime: null,
      outputWavKey: null,
      outputWavUrl: null,
      outputMp3Key: null,
      outputMp3Url: null,
      mixSettings: null,
      analysisReport: null,
      errorMsg: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx(1)); // user 1
    await expect(
      caller.mastering.getJob({ jobId: "job1" })
    ).rejects.toThrow(/Access denied/i);
  });

  it("returns job data for correct owner", async () => {
    const mockJob = {
      id: "job1",
      userId: 1,
      status: "done" as const,
      stage: "Complete",
      progress: 100,
      sourceKey: "uploads/job1/source.wav",
      sourceUrl: "/manus-storage/uploads/job1/source.wav",
      sourceFilename: "vocal.wav",
      sourceMime: "audio/wav",
      outputWavKey: "outputs/job1/mastered.wav",
      outputWavUrl: "/manus-storage/outputs/job1/mastered.wav",
      outputMp3Key: "outputs/job1/mastered.mp3",
      outputMp3Url: "/manus-storage/outputs/job1/mastered.mp3",
      mixSettings: JSON.stringify({ lufs_target: -14 }),
      analysisReport: JSON.stringify({ lufs: -18 }),
      errorMsg: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(getJob).mockResolvedValue(mockJob);
    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.mastering.getJob({ jobId: "job1" });
    expect(result.id).toBe("job1");
    expect(result.status).toBe("done");
    expect(result.outputMp3Url).toBe("/manus-storage/outputs/job1/mastered.mp3");
    expect(result.mixSettings).toEqual({ lufs_target: -14 });
  });
});

describe("mastering.listJobs", () => {
  it("returns empty array when no jobs", async () => {
    vi.mocked(listUserJobs).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.mastering.listJobs();
    expect(result).toEqual([]);
  });

  it("returns job list for authenticated user", async () => {
    vi.mocked(listUserJobs).mockResolvedValue([
      {
        id: "job1",
        userId: 1,
        status: "done" as const,
        stage: "Complete",
        progress: 100,
        sourceKey: null,
        sourceUrl: null,
        sourceFilename: "vocal.wav",
        sourceMime: null,
        outputWavKey: null,
        outputWavUrl: "/manus-storage/outputs/job1/mastered.wav",
        outputMp3Key: null,
        outputMp3Url: "/manus-storage/outputs/job1/mastered.mp3",
        mixSettings: null,
        analysisReport: null,
        errorMsg: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(makeCtx(1));
    const result = await caller.mastering.listJobs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("job1");
    expect(result[0].sourceFilename).toBe("vocal.wav");
  });
});
