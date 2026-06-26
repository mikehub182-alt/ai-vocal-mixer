"""
process.py — Real DSP processing pipeline using Pedalboard
Applies: EQ (HighpassFilter, LowpassFilter, PeakFilter bands),
         Compressor, Reverb, Limiter, Stereo Width
"""
import json
import sys
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from pedalboard import (
    Pedalboard,
    HighpassFilter,
    LowpassFilter,
    PeakFilter,
    Compressor,
    Reverb,
    LowShelfFilter,
    HighShelfFilter,
    Limiter,
    Gain,
)


def apply_dsp(input_path: str, output_path: str, settings: dict) -> dict:
    """
    Apply the full DSP chain to input_path and write to output_path (WAV).
    settings: dict with keys eq, compression, reverb, stereo, lufs_target
    Returns a summary dict.
    """
    data, sr = sf.read(input_path, always_2d=True)
    original_channels = data.shape[1]

    # Ensure stereo for processing
    if original_channels == 1:
        data = np.hstack([data, data])

    audio = data.T.astype(np.float32)  # shape: (channels, samples)

    # ------------------------------------------------------------------ #
    # 1. EQ Chain                                                          #
    # ------------------------------------------------------------------ #
    eq_settings = settings.get("eq", {})
    eq_plugins = []

    hpf_freq = eq_settings.get("highpass_hz", 80.0)
    if hpf_freq and hpf_freq > 20:
        eq_plugins.append(HighpassFilter(cutoff_frequency_hz=float(hpf_freq)))

    lpf_freq = eq_settings.get("lowpass_hz", 18000.0)
    if lpf_freq and lpf_freq < 20000:
        eq_plugins.append(LowpassFilter(cutoff_frequency_hz=float(lpf_freq)))

    low_shelf = eq_settings.get("low_shelf", {})
    if low_shelf:
        eq_plugins.append(LowShelfFilter(
            cutoff_frequency_hz=float(low_shelf.get("freq", 120)),
            gain_db=float(low_shelf.get("gain_db", 0)),
            q=float(low_shelf.get("q", 0.707)),
        ))

    high_shelf = eq_settings.get("high_shelf", {})
    if high_shelf:
        eq_plugins.append(HighShelfFilter(
            cutoff_frequency_hz=float(high_shelf.get("freq", 10000)),
            gain_db=float(high_shelf.get("gain_db", 0)),
            q=float(high_shelf.get("q", 0.707)),
        ))

    for band in eq_settings.get("peak_bands", []):
        gain_db = float(band.get("gain_db", 0))
        if abs(gain_db) > 0.1:
            eq_plugins.append(PeakFilter(
                cutoff_frequency_hz=float(band.get("freq", 1000)),
                gain_db=gain_db,
                q=float(band.get("q", 1.0)),
            ))

    if eq_plugins:
        board_eq = Pedalboard(eq_plugins)
        audio = board_eq(audio, sr)

    # ------------------------------------------------------------------ #
    # 2. Compression                                                       #
    # ------------------------------------------------------------------ #
    comp_settings = settings.get("compression", {})
    threshold_db = float(comp_settings.get("threshold_db", -18.0))
    ratio = float(comp_settings.get("ratio", 3.0))
    attack_ms = float(comp_settings.get("attack_ms", 10.0))
    release_ms = float(comp_settings.get("release_ms", 100.0))
    makeup_db = float(comp_settings.get("makeup_gain_db", 2.0))

    board_comp = Pedalboard([
        Compressor(
            threshold_db=threshold_db,
            ratio=ratio,
            attack_ms=attack_ms,
            release_ms=release_ms,
        ),
        Gain(gain_db=makeup_db),
    ])
    audio = board_comp(audio, sr)

    # ------------------------------------------------------------------ #
    # 3. Reverb (optional, wet/dry controlled)                            #
    # ------------------------------------------------------------------ #
    reverb_settings = settings.get("reverb", {})
    wet_level = float(reverb_settings.get("wet_level", 0.0))
    if wet_level > 0.01:
        board_reverb = Pedalboard([
            Reverb(
                room_size=float(reverb_settings.get("room_size", 0.3)),
                damping=float(reverb_settings.get("damping", 0.5)),
                wet_level=wet_level,
                dry_level=float(reverb_settings.get("dry_level", 0.9)),
                width=float(reverb_settings.get("width", 0.5)),
            )
        ])
        audio = board_reverb(audio, sr)

    # ------------------------------------------------------------------ #
    # 4. Stereo Width                                                      #
    # ------------------------------------------------------------------ #
    stereo_settings = settings.get("stereo", {})
    width_factor = float(stereo_settings.get("width_factor", 1.0))
    if abs(width_factor - 1.0) > 0.05 and audio.shape[0] == 2:
        mid = (audio[0] + audio[1]) * 0.5
        side = (audio[0] - audio[1]) * 0.5 * width_factor
        audio[0] = mid + side
        audio[1] = mid - side

    # ------------------------------------------------------------------ #
    # 5. LUFS Normalization                                               #
    # ------------------------------------------------------------------ #
    lufs_target = float(settings.get("lufs_target", -14.0))
    audio_out = audio.T  # back to (samples, channels)

    meter = pyln.Meter(sr)
    try:
        current_lufs = meter.integrated_loudness(audio_out)
        if current_lufs > -70 and not np.isinf(current_lufs):
            gain_needed = lufs_target - current_lufs
            gain_linear = 10 ** (gain_needed / 20.0)
            audio_out = audio_out * gain_linear
    except Exception:
        pass

    # ------------------------------------------------------------------ #
    # 6. Limiter (brick-wall at -0.3 dBFS)                               #
    # ------------------------------------------------------------------ #
    audio_for_limiter = audio_out.T.astype(np.float32)
    board_limiter = Pedalboard([
        Limiter(threshold_db=-0.3, release_ms=50.0)
    ])
    audio_for_limiter = board_limiter(audio_for_limiter, sr)
    audio_out = audio_for_limiter.T

    # Clip guard
    audio_out = np.clip(audio_out, -1.0, 1.0)

    # Write output WAV (24-bit)
    sf.write(output_path, audio_out, sr, subtype="PCM_24")

    # Measure final LUFS
    try:
        final_lufs = float(meter.integrated_loudness(audio_out))
    except Exception:
        final_lufs = lufs_target

    return {
        "output_path": output_path,
        "sample_rate": sr,
        "channels": audio_out.shape[1],
        "final_lufs": round(final_lufs, 2),
        "settings_applied": settings,
    }


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: process.py <input> <output_wav> <settings_json>"}))
        sys.exit(1)
    with open(sys.argv[3]) as f:
        settings = json.load(f)
    result = apply_dsp(sys.argv[1], sys.argv[2], settings)
    print(json.dumps(result))
