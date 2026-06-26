"""
analyze.py — Audio analysis module for AI Vocal Mixer
Extracts: RMS, LUFS, peak, dynamic range, spectral balance, crest factor,
          voice type estimate, and problem detection flags.
"""
import json
import sys
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from scipy import signal as scipy_signal


def analyze_audio(input_path: str) -> dict:
    """
    Analyze an audio file and return a rich analysis report dict.
    """
    data, sr = sf.read(input_path, always_2d=True)

    # Ensure stereo
    if data.shape[1] == 1:
        data = np.hstack([data, data])

    mono = data.mean(axis=1)
    duration = len(mono) / sr

    # --- Loudness (LUFS) ---
    meter = pyln.Meter(sr)
    try:
        lufs = meter.integrated_loudness(data)
    except Exception:
        lufs = -99.0

    # --- RMS ---
    rms_linear = float(np.sqrt(np.mean(mono ** 2)))
    rms_db = float(20 * np.log10(max(rms_linear, 1e-9)))

    # --- Peak ---
    peak_linear = float(np.max(np.abs(mono)))
    peak_db = float(20 * np.log10(max(peak_linear, 1e-9)))

    # --- Dynamic range (crest factor) ---
    crest_factor_db = float(peak_db - rms_db)

    # --- Clipping detection ---
    clipping = bool(peak_linear >= 0.999)

    # --- DC offset ---
    dc_offset = float(np.mean(mono))
    has_dc_offset = abs(dc_offset) > 0.005

    # --- Spectral analysis ---
    nperseg = min(4096, len(mono))
    freqs, psd = scipy_signal.welch(mono, sr, nperseg=nperseg)

    def band_energy(low, high):
        mask = (freqs >= low) & (freqs < high)
        if not np.any(mask):
            return -60.0
        e = float(np.mean(psd[mask]))
        return float(20 * np.log10(max(e, 1e-20)))

    spectral = {
        "sub_bass_db": band_energy(20, 80),
        "bass_db": band_energy(80, 250),
        "low_mid_db": band_energy(250, 800),
        "mid_db": band_energy(800, 2500),
        "upper_mid_db": band_energy(2500, 5000),
        "presence_db": band_energy(5000, 8000),
        "air_db": band_energy(8000, 20000),
    }

    # --- Spectral centroid (brightness indicator) ---
    centroid_frames = []
    hop = 512
    frame_len = 2048
    for start in range(0, len(mono) - frame_len, hop):
        frame = mono[start:start + frame_len]
        spectrum = np.abs(np.fft.rfft(frame))
        f_bins = np.fft.rfftfreq(frame_len, 1 / sr)
        denom = np.sum(spectrum)
        if denom > 0:
            centroid_frames.append(float(np.sum(f_bins * spectrum) / denom))
    spectral_centroid = float(np.mean(centroid_frames)) if centroid_frames else 1500.0

    # --- Voice type estimation from spectral centroid ---
    if spectral_centroid < 200:
        voice_type = "bass"
    elif spectral_centroid < 350:
        voice_type = "baritone"
    elif spectral_centroid < 500:
        voice_type = "tenor"
    elif spectral_centroid < 700:
        voice_type = "alto"
    elif spectral_centroid < 1000:
        voice_type = "mezzo"
    else:
        voice_type = "soprano"

    # --- Mud detection (250–500 Hz excess) ---
    mud_excess = spectral["low_mid_db"] - spectral["mid_db"]
    has_mud = mud_excess > 6.0

    # --- Harshness detection (2–5 kHz excess) ---
    harshness_excess = spectral["upper_mid_db"] - spectral["mid_db"]
    has_harshness = harshness_excess > 8.0

    # --- Sibilance detection (5–9 kHz) ---
    sibilance_excess = spectral["presence_db"] - spectral["upper_mid_db"]
    has_sibilance = sibilance_excess > 6.0

    # --- Stereo width ---
    side = data[:, 0] - data[:, 1]
    mid = data[:, 0] + data[:, 1]
    side_rms = float(np.sqrt(np.mean(side ** 2)))
    mid_rms = float(np.sqrt(np.mean(mid ** 2)))
    stereo_width = float(side_rms / max(mid_rms, 1e-9))

    return {
        "duration_seconds": round(duration, 2),
        "sample_rate": sr,
        "channels": data.shape[1],
        "lufs": round(float(lufs), 2),
        "rms_db": round(rms_db, 2),
        "peak_db": round(peak_db, 2),
        "crest_factor_db": round(crest_factor_db, 2),
        "spectral": spectral,
        "spectral_centroid_hz": round(spectral_centroid, 1),
        "voice_type": voice_type,
        "stereo_width": round(stereo_width, 3),
        "problems": {
            "clipping": clipping,
            "dc_offset": has_dc_offset,
            "mud": has_mud,
            "harshness": has_harshness,
            "sibilance": has_sibilance,
        },
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: analyze.py <input_path>"}))
        sys.exit(1)
    result = analyze_audio(sys.argv[1])
    print(json.dumps(result))
