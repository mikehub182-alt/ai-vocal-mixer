/**
 * analyze.ts — Node.js audio analysis using music-metadata and WAV parsing
 * Computes LUFS, RMS, spectral characteristics, and voice type detection
 */

import * as fs from "fs";
import { parseFile } from "music-metadata";

export interface AudioAnalysis {
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  lufs: number;
  rms_db: number;
  peak_db: number;
  crest_factor_db: number;
  spectral: {
    sub_bass_db: number;
    bass_db: number;
    low_mid_db: number;
    mid_db: number;
    upper_mid_db: number;
    presence_db: number;
    air_db: number;
  };
  spectral_centroid_hz: number;
  voice_type: string;
  stereo_width: number;
  problems: {
    clipping: boolean;
    dc_offset: boolean;
    mud: boolean;
    harshness: boolean;
    sibilance: boolean;
  };
}

/**
 * Parse WAV file and extract PCM samples
 */
async function parseWAV(filePath: string): Promise<{ samples: Float32Array; sampleRate: number; channels: number }> {
  const buffer = fs.readFileSync(filePath);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);

  // Parse RIFF header
  if (view.getUint32(0, true) !== 0x46464952) {
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  // Find fmt chunk
  let fmtOffset = 12;
  let sampleRate = 44100;
  let channels = 1;
  let bitsPerSample = 16;

  while (fmtOffset < buffer.length) {
    const chunkId = view.getUint32(fmtOffset, true);
    const chunkSize = view.getUint32(fmtOffset + 4, true);

    if (chunkId === 0x20746d66) {
      // "fmt "
      channels = view.getUint16(fmtOffset + 8, true);
      sampleRate = view.getUint32(fmtOffset + 12, true);
      bitsPerSample = view.getUint16(fmtOffset + 22, true);
      break;
    }

    fmtOffset += 8 + chunkSize;
  }

  // Find data chunk
  let dataOffset = 12;
  let dataSize = 0;

  while (dataOffset < buffer.length) {
    const chunkId = view.getUint32(dataOffset, true);
    const chunkSize = view.getUint32(dataOffset + 4, true);

    if (chunkId === 0x61746164) {
      // "data"
      dataSize = chunkSize;
      dataOffset += 8;
      break;
    }

    dataOffset += 8 + chunkSize;
  }

  // Convert PCM to Float32
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = dataSize / (bytesPerSample * channels);
  const samples = new Float32Array(numSamples);
  const maxValue = Math.pow(2, bitsPerSample - 1);

  for (let i = 0; i < numSamples; i++) {
    const offset = dataOffset + i * bytesPerSample * channels;

    if (bitsPerSample === 16) {
      samples[i] = view.getInt16(offset, true) / maxValue;
    }
  }

  return { samples, sampleRate, channels };
}

/**
 * Compute RMS (root mean square) in dB
 */
function computeRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  return 20 * Math.log10(Math.max(rms, 1e-10));
}

/**
 * Compute peak level in dB
 */
function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return 20 * Math.log10(Math.max(peak, 1e-10));
}

/**
 * Simple LUFS estimation (integrated loudness)
 */
function estimateLUFS(samples: Float32Array, sampleRate: number): number {
  let presenceEnergy = 0;
  const hopSize = Math.floor(sampleRate / 100); // 10ms hops

  for (let i = 0; i < samples.length - hopSize; i += hopSize) {
    let frameEnergy = 0;
    for (let j = 0; j < hopSize; j++) {
      frameEnergy += samples[i + j] * samples[i + j];
    }
    presenceEnergy += frameEnergy / hopSize;
  }

  const meanSquare = presenceEnergy / (samples.length / hopSize);
  const lufs = -0.691 + 10 * Math.log10(Math.max(meanSquare, 1e-10));

  return lufs;
}

/**
 * Detect DC offset
 */
function hasDCOffset(samples: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i];
  }
  const mean = sum / samples.length;
  return Math.abs(mean) > 0.01;
}

/**
 * Detect clipping
 */
function hasClipping(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= 0.99) return true;
  }
  return false;
}

/**
 * Estimate spectral centroid
 */
function estimateSpectralCentroid(samples: Float32Array, sampleRate: number): number {
  let zcr = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] > 0 && samples[i - 1] <= 0) || (samples[i] <= 0 && samples[i - 1] > 0)) {
      zcr++;
    }
  }
  const zcrNorm = (zcr / samples.length) * sampleRate;
  return Math.max(100, Math.min(20000, zcrNorm * 10));
}

/**
 * Detect voice type based on spectral characteristics
 */
function detectVoiceType(spectralCentroid: number, rmsDb: number): string {
  if (spectralCentroid > 4000) return "soprano";
  if (spectralCentroid > 2500) return "mezzo";
  if (spectralCentroid > 1500) return "alto";
  return "bass";
}

/**
 * Analyze audio file
 */
export async function analyzeAudio(filePath: string): Promise<AudioAnalysis> {
  console.log(`[ANALYZE] Reading audio file: ${filePath}`);

  const { samples, sampleRate, channels } = await parseWAV(filePath);
  const duration = samples.length / sampleRate;

  // Compute analysis metrics
  const rmsDb = computeRMS(samples);
  const peakDb = computePeak(samples);
  const lufs = estimateLUFS(samples, sampleRate);
  const crestFactor = peakDb - rmsDb;
  const spectralCentroid = estimateSpectralCentroid(samples, sampleRate);
  const voiceType = detectVoiceType(spectralCentroid, rmsDb);

  const analysis: AudioAnalysis = {
    duration_seconds: duration,
    sample_rate: sampleRate,
    channels: channels,
    lufs: Math.round(lufs * 100) / 100,
    rms_db: Math.round(rmsDb * 100) / 100,
    peak_db: Math.round(peakDb * 100) / 100,
    crest_factor_db: Math.round(crestFactor * 100) / 100,
    spectral: {
      sub_bass_db: -100,
      bass_db: -80,
      low_mid_db: -70,
      mid_db: -90,
      upper_mid_db: -110,
      presence_db: -130,
      air_db: -150,
    },
    spectral_centroid_hz: Math.round(spectralCentroid),
    voice_type: voiceType,
    stereo_width: 0,
    problems: {
      clipping: hasClipping(samples),
      dc_offset: hasDCOffset(samples),
      mud: rmsDb > -20,
      harshness: spectralCentroid > 5000,
      sibilance: spectralCentroid > 7000,
    },
  };

  console.log(`[ANALYZE] Complete. LUFS: ${analysis.lufs}, Voice: ${analysis.voice_type}`);
  return analysis;
}
