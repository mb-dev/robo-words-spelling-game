"""Record every clip in manifest.json with Kokoro, as small AAC files.

Run with the Kokoro environment (it must live at a short path, see README):
  ~/.cache/kokoro-tts/.venv/bin/python tools/make_audio.py
Existing clips are skipped, so it is safe to re-run after adding words.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model

VOICE = "af_heart"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio"
manifest = json.loads((ROOT / "tools" / "manifest.json").read_text())
only = set(sys.argv[1:])

model = load_model("mlx-community/Kokoro-82M-bf16")
made = skipped = 0
problems = []
with tempfile.TemporaryDirectory() as tmp:
    wav = Path(tmp) / "clip.wav"
    for item in manifest:
        target = OUT / (item["path"] + ".m4a")
        if only and item["path"] not in only:
            continue
        if target.exists() and not only:
            skipped += 1
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            parts = [np.array(r.audio) for r in model.generate(text=item["text"], voice=VOICE, speed=item.get("speed", 1.0), lang_code="a")]
            audio = np.concatenate(parts) if parts else np.zeros(0)
            seconds = len(audio) / model.sample_rate
            if seconds < 0.25 or float(np.abs(audio).max()) < 0.02:
                problems.append(f"{item['path']}: too short or silent ({seconds:.2f}s)")
            audio_write(str(wav), audio, model.sample_rate, format="wav")
            subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", str(wav), str(target)], check=True, capture_output=True)
            made += 1
            if made % 100 == 0:
                print(f"{made} recorded", flush=True)
        except Exception as error:  # keep going; report at the end
            problems.append(f"{item['path']}: {error}")
print(f"done: {made} recorded, {skipped} already there, {len(problems)} problems")
for p in problems:
    print("PROBLEM", p)
