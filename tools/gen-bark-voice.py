#!/usr/bin/env python3
"""Render the battlefield barks (src/config/barkLines.json: grenade shouts, "Contact!", "It's the spy!"…) to public/voice/bark/<soldier>_<slug>.mp3
with the SAME per-soldier Kokoro voices + emotion layer as the debate and the tribunal. slug = lower-case text, non-alphanumerics -> "_".

  python tools/gen-bark-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--only 2,5]
"""
import argparse, importlib.util, json, os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import emote
from kokoro_onnx import Kokoro
spec = importlib.util.spec_from_file_location("gm", os.path.join(HERE, "gen-meet-voice.py")); gm = importlib.util.module_from_spec(spec); spec.loader.exec_module(gm)
slug = lambda t: re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", t.lower()))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "voice-src", "bark")); ap.add_argument("--only", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); k = Kokoro(a.model, a.voices)
    lines = json.load(open(os.path.join(HERE, "..", "src", "config", "barkLines.json"), encoding="utf-8"))["lines"]
    for who, (voice, lang, spd) in gm.VOICES.items():
        if a.only and str(who) not in a.only.split(","): continue
        for text in lines:
            dst = os.path.join(a.out, f"{who}_{slug(text)}.mp3")
            if os.path.exists(dst): continue
            pcm, sr = k.create(text, voice=voice, speed=round(spd * 1.10, 3), lang=lang); assert sr == emote.SR
            y = emote.speak(np.asarray(pcm, dtype=np.float64), "shout")
            with tempfile.TemporaryDirectory() as d:
                wav = os.path.join(d, "x.wav"); sf.write(wav, y.astype(np.float32), sr)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", gm.TRIM + ",loudnorm=I=-14:TP=-1.0:LRA=9", "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-q:a", "4", dst], check=True)
            print(f"{who:2} {voice:10} {text}", flush=True)

if __name__ == "__main__":
    main()
