/**
 * process.ts — DSP processing using FFmpeg filter chains
 * Applies EQ, compression, reverb, stereo widening, and loudness normalization
 */

import * as ffmpegStatic from "ffmpeg-static";
// @ts-ignore - fluent-ffmpeg lacks type definitions
import ffmpeg from "fluent-ffmpeg";
import * as path from "path";

// Set FFmpeg path
if (ffmpegStatic && typeof ffmpegStatic === "string") {
  ffmpeg.setFfmpegPath(ffmpegStatic);
} else if (ffmpegStatic && typeof ffmpegStatic === "object" && "path" in ffmpegStatic) {
  ffmpeg.setFfmpegPath((ffmpegStatic as any).path);
}

export interface MixSettings {
  eq: {
    highpass_hz: number;
    lowpass_hz: number;
    low_shelf: { freq: number; gain_db: number; q: number };
    high_shelf: { freq: number; gain_db: number; q: number };
    peak_bands: Array<{ freq: number; gain_db: number; q: number; label: string }>;
  };
  compression: {
    threshold_db: number;
    ratio: number;
    attack_ms: number;
    release_ms: number;
    makeup_gain_db: number;
  };
  reverb: {
    room_size: number;
    damping: number;
    wet_level: number;
    dry_level: number;
    width: number;
  };
  stereo: {
    width_factor: number;
  };
  lufs_target: number;
  reasoning: Record<string, unknown>;
}

/**
 * Build FFmpeg filter chain for audio processing
 */
function buildFilterChain(settings: MixSettings): string {
  const filters: string[] = [];

  // 1. High-pass filter (remove sub-bass rumble)
  filters.push(`highpass=f=${settings.eq.highpass_hz}`);

  // 2. Low-pass filter (remove ultrasonic noise)
  filters.push(`lowpass=f=${settings.eq.lowpass_hz}`);

  // 3. Low shelf EQ
  const lowShelf = settings.eq.low_shelf;
  filters.push(`equalizer=f=${lowShelf.freq}:t=lowshelf:width_type=q:w=${lowShelf.q}:g=${lowShelf.gain_db}`);

  // 4. High shelf EQ
  const highShelf = settings.eq.high_shelf;
  filters.push(`equalizer=f=${highShelf.freq}:t=highshelf:width_type=q:w=${highShelf.q}:g=${highShelf.gain_db}`);

  // 5. Peak EQ bands
  for (const band of settings.eq.peak_bands) {
    filters.push(`equalizer=f=${band.freq}:t=peak:width_type=q:w=${band.q}:g=${band.gain_db}`);
  }

  // 6. Compressor
  const comp = settings.compression;
  filters.push(
    `acompressor=threshold=${comp.threshold_db}:ratio=${comp.ratio}:attack=${comp.attack_ms}:release=${comp.release_ms}:makeup=${comp.makeup_gain_db}`
  );

  // 7. Limiter (prevent clipping)
  filters.push(`alimiter=limit=0.99:attack=5:release=50`);

  // 8. Loudness normalization (using loudnorm filter)
  filters.push(`loudnorm=I=-14:TP=-1.5:LRA=11`);

  // 9. Stereo widening (simple mid-side processing)
  if (settings.stereo.width_factor > 1.0) {
    // Boost stereo width slightly
    filters.push(`stereotools=slevel=${settings.stereo.width_factor}`);
  }

  return filters.join(",");
}

/**
 * Apply DSP processing to audio file using FFmpeg
 */
export async function applyDSP(
  inputPath: string,
  outputPath: string,
  settings: MixSettings,
  sampleRate: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[DSP] Applying processing chain to: ${inputPath}`);
    console.log(`[DSP] Output: ${outputPath}`);
    console.log(`[DSP] Settings:`, JSON.stringify(settings, null, 2));

    const filterChain = buildFilterChain(settings);
    console.log(`[DSP] Filter chain: ${filterChain}`);

    ffmpeg(inputPath)
      .audioFilters(filterChain)
      .audioCodec("pcm_s24le")
      .audioFrequency(sampleRate)
      .audioChannels(2)
      .on("start", (cmd: any) => {
        console.log(`[DSP] FFmpeg command: ${cmd}`);
      })
      .on("progress", (progress: any) => {
        console.log(`[DSP] Processing progress: ${progress.percent}%`);
      })
      .on("error", (err: any) => {
        console.error(`[DSP] FFmpeg error:`, err);
        reject(err);
      })
      .on("end", () => {
        console.log(`[DSP] Processing complete`);
        resolve();
      })
      .save(outputPath);
  });
}

/**
 * Convert WAV to MP3 using FFmpeg
 */
export async function convertToMP3(wavPath: string, mp3Path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[MP3] Converting WAV to MP3: ${wavPath} -> ${mp3Path}`);

    ffmpeg(wavPath)
      .audioCodec("libmp3lame")
      .audioBitrate("320k")
      .audioFrequency(44100)
      .on("error", (err: any) => {
        console.error(`[MP3] FFmpeg error:`, err);
        reject(err);
      })
      .on("end", () => {
        console.log(`[MP3] Conversion complete`);
        resolve();
      })
      .save(mp3Path);
  });
}
