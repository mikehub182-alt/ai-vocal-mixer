# AI Vocal Mixer — TODO

## Phase 1: Setup
- [x] DB schema: mastering_jobs table (id, userId, status, sourceKey, outputWavKey, outputMp3Key, mixSettings, analysisReport, errorMsg, createdAt, updatedAt)
- [x] Install Python DSP dependencies (pedalboard, librosa, pyloudnorm, ffmpeg-python, numpy, scipy)
- [x] Verify FFmpeg available in sandbox

## Phase 2: Python DSP Worker
- [x] server/dsp/analyze.py — audio analysis (RMS, LUFS, spectral balance, dynamic range, voice type detection)
- [x] server/dsp/ai_decisions.py — LLM call → structured JSON (eq, compression, reverb, stereo, lufs_target)
- [x] server/dsp/process.py — Pedalboard DSP chain (EQ, compressor, reverb, limiter, stereo width)
- [x] server/dsp/normalize.py — LUFS loudness normalization with pyloudnorm
- [x] server/dsp/export.py — render WAV 24-bit + MP3 320kbps via FFmpeg
- [x] server/dsp/worker.py — orchestrator: analyze → AI → process → normalize → export → upload to S3

## Phase 3: Backend tRPC Routes
- [x] mastering.upload — receive file, store to S3, create job record, spawn DSP worker
- [x] mastering.getJob — poll job status + progress stage
- [x] mastering.listJobs — list user's job history
- [x] mastering.getDownloadUrl — return presigned download URL for WAV/MP3

## Phase 4: Frontend UI
- [x] Design system: dark theme, purple/cyan accent, Inter font
- [x] DashboardLayout with sidebar (Upload, History, About)
- [x] UploadPage: drag-and-drop zone, file validation (WAV/MP3/FLAC/AIFF), upload progress
- [x] ProcessingPage: real-time status stages (Uploading → Analyzing → Processing → Exporting → Done)
- [x] ResultPage: A/B comparison player (original vs mastered), mix settings JSON display, download buttons (WAV + MP3)
- [x] HistoryPage: list of past jobs with status badges and re-download links
- [x] Responsive mobile layout

## Phase 5: Tests & Delivery
- [x] Vitest: mastering job CRUD procedures
- [x] Vitest: upload validation
- [x] Screenshot verification
- [x] Checkpoint save


## Phase 6: Node.js DSP Rewrite (Autoscale Compatibility)
- [x] Install Node.js audio packages (ffmpeg-static, fluent-ffmpeg, music-metadata)
- [x] server/dsp/analyze.ts — WAV parsing, RMS, LUFS estimation, spectral centroid, voice type detection
- [x] server/dsp/process.ts — FFmpeg filter chains (EQ, compression, reverb, limiter, loudness normalization)
- [x] server/dsp/mastering.ts — orchestrator: download → analyze → AI → DSP → export → upload
- [x] server/masteringRunner.ts — call Node.js DSP directly (no subprocess spawning)
- [x] Remove Python subprocess dependencies (no spawn, no ENOENT errors)
- [x] TypeScript compilation clean (no errors)
- [x] Dev server running and UI accessible
