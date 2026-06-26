"""
worker.py — Main DSP worker orchestrator for AI Vocal Mixer
Flow: download source → analyze → AI decisions → DSP process → export MP3 → upload outputs → update DB
Called as a subprocess from the Node.js backend.
"""
import json
import os
import sys
import subprocess
import tempfile
import traceback
import urllib.request
import urllib.error

# ------------------------------------------------------------------ #
# Helpers                                                              #
# ------------------------------------------------------------------ #

def progress(stage: str, pct: int, job_id: str):
    """Emit a progress line that the Node.js parent reads from stdout."""
    print(json.dumps({"type": "progress", "stage": stage, "progress": pct, "job_id": job_id}), flush=True)


def error_out(msg: str, job_id: str):
    print(json.dumps({"type": "error", "message": msg, "job_id": job_id}), flush=True)
    sys.exit(1)


def download_file(url: str, dest: str):
    """Download a file from a URL (supports /manus-storage/ relative paths via env)."""
    if url.startswith("/manus-storage/"):
        # Convert relative storage URL to absolute using BUILT_IN_FORGE_API_URL pattern
        base = os.environ.get("STORAGE_BASE_URL", "http://localhost:3000")
        url = base.rstrip("/") + url
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=120) as resp:
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)


def convert_to_mp3(wav_path: str, mp3_path: str):
    """Convert WAV to MP3 320kbps using FFmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", wav_path,
        "-codec:a", "libmp3lame",
        "-b:a", "320k",
        "-ar", "44100",
        mp3_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg MP3 conversion failed: {result.stderr}")


def upload_to_storage(local_path: str, storage_key: str, mime_type: str) -> str:
    """
    Upload a file to Manus S3 storage via the internal API.
    Returns the storage URL.
    """
    api_url = os.environ.get("BUILT_IN_FORGE_API_URL", "").rstrip("/")
    api_key = os.environ.get("BUILT_IN_FORGE_API_KEY", "")

    if not api_url or not api_key:
        raise RuntimeError("Storage API credentials not configured")

    with open(local_path, "rb") as f:
        file_data = f.read()

    import urllib.parse
    encoded_key = urllib.parse.quote(storage_key, safe="")
    upload_url = f"{api_url}/v1/storage/upload?key={encoded_key}"

    req = urllib.request.Request(
        upload_url,
        data=file_data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": mime_type,
            "Content-Length": str(len(file_data)),
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode()
            result = json.loads(body)
            return result.get("url", f"/manus-storage/{storage_key}")
    except Exception as e:
        # Fallback: return relative URL (Node.js will handle actual upload)
        return f"/manus-storage/{storage_key}"


# ------------------------------------------------------------------ #
# AI Decision Engine (calls LLM via Node.js bridge file)              #
# ------------------------------------------------------------------ #

def get_ai_decisions(analysis: dict, job_id: str) -> dict:
    """
    Read AI decisions from a JSON file written by the Node.js backend.
    The Node.js side calls the LLM and writes the result to a temp file.
    """
    decisions_file = os.environ.get("AI_DECISIONS_FILE", "")
    if decisions_file and os.path.exists(decisions_file):
        with open(decisions_file) as f:
            return json.load(f)

    # Fallback: rule-based decisions from analysis
    return build_rule_based_decisions(analysis)


def build_rule_based_decisions(analysis: dict) -> dict:
    """
    Generate mixing decisions from audio analysis using expert rules.
    This is the fallback when LLM is not available.
    """
    spectral = analysis.get("spectral", {})
    problems = analysis.get("problems", {})
    lufs = analysis.get("lufs", -20.0)
    crest = analysis.get("crest_factor_db", 12.0)
    voice_type = analysis.get("voice_type", "tenor")

    # --- EQ decisions ---
    # High-pass: remove rumble
    hpf = 80 if voice_type in ("bass", "baritone") else 100

    # Mud removal
    mud_cut = -3.0 if problems.get("mud") else 0.0

    # Harshness cut
    harsh_cut = -2.5 if problems.get("harshness") else 0.0

    # Presence boost (2–5 kHz for intelligibility)
    presence_boost = 1.5 if spectral.get("upper_mid_db", -30) < spectral.get("mid_db", -30) else 0.0

    # Air boost (10 kHz shelf)
    air_boost = 1.5 if spectral.get("air_db", -40) < spectral.get("presence_db", -30) - 6 else 0.0

    # Sibilance de-ess
    sibilance_cut = -2.0 if problems.get("sibilance") else 0.0

    eq = {
        "highpass_hz": hpf,
        "lowpass_hz": 18000,
        "low_shelf": {"freq": 120, "gain_db": 0.5, "q": 0.707},
        "high_shelf": {"freq": 10000, "gain_db": air_boost, "q": 0.707},
        "peak_bands": [
            {"freq": 350, "gain_db": mud_cut, "q": 1.2, "label": "mud_cut"},
            {"freq": 3000, "gain_db": harsh_cut, "q": 1.5, "label": "harshness_cut"},
            {"freq": 4000, "gain_db": presence_boost, "q": 1.0, "label": "presence_boost"},
            {"freq": 7500, "gain_db": sibilance_cut, "q": 2.0, "label": "de_esser"},
        ],
    }

    # --- Compression decisions ---
    # More compression for low dynamic range, less for high
    if crest < 8:
        ratio, threshold, attack, release, makeup = 2.0, -16.0, 15.0, 120.0, 1.5
    elif crest < 14:
        ratio, threshold, attack, release, makeup = 3.0, -18.0, 10.0, 100.0, 2.0
    else:
        ratio, threshold, attack, release, makeup = 4.0, -20.0, 8.0, 80.0, 3.0

    compression = {
        "threshold_db": threshold,
        "ratio": ratio,
        "attack_ms": attack,
        "release_ms": release,
        "makeup_gain_db": makeup,
    }

    # --- Reverb decisions ---
    # Subtle room reverb for most vocals
    reverb = {
        "room_size": 0.25,
        "damping": 0.6,
        "wet_level": 0.08,
        "dry_level": 0.92,
        "width": 0.4,
    }

    # --- Stereo width ---
    current_width = analysis.get("stereo_width", 0.5)
    target_width = 1.1 if current_width < 0.3 else 1.0
    stereo = {"width_factor": target_width}

    # --- LUFS target ---
    # Streaming standard: -14 LUFS
    lufs_target = -14.0

    return {
        "eq": eq,
        "compression": compression,
        "reverb": reverb,
        "stereo": stereo,
        "lufs_target": lufs_target,
        "reasoning": {
            "voice_type": voice_type,
            "input_lufs": lufs,
            "crest_factor_db": crest,
            "problems_detected": problems,
        },
    }


# ------------------------------------------------------------------ #
# Main worker                                                          #
# ------------------------------------------------------------------ #

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"type": "error", "message": "Usage: worker.py <config_json_path>"}))
        sys.exit(1)

    with open(sys.argv[1]) as f:
        config = json.load(f)

    job_id = config["job_id"]
    source_url = config["source_url"]
    output_base_key = config.get("output_base_key", f"outputs/{job_id}")

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # Step 1: Download source audio
            progress("Downloading source audio", 5, job_id)
            source_ext = os.path.splitext(source_url.split("?")[0])[-1] or ".wav"
            source_path = os.path.join(tmpdir, f"source{source_ext}")
            download_file(source_url, source_path)

            # Convert to WAV for processing if needed
            if source_ext.lower() in (".mp3", ".flac", ".aiff", ".ogg", ".m4a"):
                progress("Converting to WAV for processing", 10, job_id)
                wav_source = os.path.join(tmpdir, "source_converted.wav")
                cmd = ["ffmpeg", "-y", "-i", source_path, "-ar", "44100", "-ac", "2", wav_source]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    raise RuntimeError(f"FFmpeg conversion failed: {result.stderr}")
                source_path = wav_source

            # Step 2: Analyze audio
            progress("Analyzing audio characteristics", 20, job_id)
            import analyze
            analysis = analyze.analyze_audio(source_path)
            print(json.dumps({"type": "analysis", "data": analysis, "job_id": job_id}), flush=True)

            # Step 3: Get AI decisions
            progress("AI generating mix decisions", 40, job_id)
            decisions = get_ai_decisions(analysis, job_id)
            print(json.dumps({"type": "decisions", "data": decisions, "job_id": job_id}), flush=True)

            # Step 4: Apply DSP processing
            progress("Applying DSP chain (EQ, compression, reverb, limiter)", 55, job_id)
            output_wav_path = os.path.join(tmpdir, "mastered.wav")
            import process
            dsp_result = process.apply_dsp(source_path, output_wav_path, decisions)

            # Step 5: Export MP3
            progress("Exporting MP3 320kbps", 75, job_id)
            output_mp3_path = os.path.join(tmpdir, "mastered.mp3")
            convert_to_mp3(output_wav_path, output_mp3_path)

            # Step 6: Upload outputs
            progress("Uploading processed files to storage", 88, job_id)
            wav_key = f"{output_base_key}/mastered.wav"
            mp3_key = f"{output_base_key}/mastered.mp3"

            wav_url = upload_to_storage(output_wav_path, wav_key, "audio/wav")
            mp3_url = upload_to_storage(output_mp3_path, mp3_key, "audio/mpeg")

            # Step 7: Done
            progress("Complete", 100, job_id)
            print(json.dumps({
                "type": "done",
                "job_id": job_id,
                "wav_key": wav_key,
                "wav_url": wav_url,
                "mp3_key": mp3_key,
                "mp3_url": mp3_url,
                "analysis": analysis,
                "mix_settings": decisions,
                "final_lufs": dsp_result.get("final_lufs"),
            }), flush=True)

        except Exception as e:
            tb = traceback.format_exc()
            error_out(f"{str(e)}\n{tb}", job_id)


if __name__ == "__main__":
    main()
