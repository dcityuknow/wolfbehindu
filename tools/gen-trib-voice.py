#!/usr/bin/env python3
"""Render the TRIBUNAL / firing-squad lines (src/config/tribunalLines.json) to public/voice/trib/<soldier>_<key>.mp3 with Kokoro,
using the SAME per-soldier voices + emotion layer as the campfire debate (tools/gen-meet-voice.py), so every soldier sounds like himself from A to Z.

  pip install kokoro-onnx soundfile praat-parselmouth scipy numpy      (+ ffmpeg on PATH)
  python tools/gen-trib-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--only 2,5]

Keys: intro0..6 · wait0..5 · ready · before · self · atie · plea0..1 · strip0 · tie0 · begging0 · squad_pos/load/aim/fire · after0 · name<victim slot> (the callsign + "!")
"""
import argparse, importlib.util, json, os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import emote
from kokoro_onnx import Kokoro
spec = importlib.util.spec_from_file_location("gm", os.path.join(HERE, "gen-meet-voice.py")); gm = importlib.util.module_from_spec(spec); spec.loader.exec_module(gm)

EMO_INTENT = {"read": "suspect", "tense": "suspect", "grim": "defend", "shock": "panic", "anger": "accuse", "rage": "shout", "plead": "panic", "idle": "agree"}
SPEED = {"suspect": 0.92, "defend": 1.05, "panic": 1.12, "accuse": 1.05, "shout": 1.10, "roar": 1.10, "agree": 1.0}
LOUD = {"shout": -13, "roar": -12, "accuse": -15, "panic": -15, "suspect": -19}
CALLSIGNS = ["You", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo"]

def jobs():
    d = json.load(open(os.path.join(HERE, "..", "src", "config", "tribunalLines.json"), encoding="utf-8")); J = []
    for i, l in enumerate(d["intro"]): J.append((f"intro{i}", l["en"], EMO_INTENT[l["emo"]]))
    for i, l in enumerate(d["wait"]): J.append((f"wait{i}", l["en"], EMO_INTENT[l["emo"]]))
    a = d["announce"]
    J += [("ready", a["ready"]["en"], "suspect"), ("before", a["before"]["en"], "suspect"), ("self", a["self"]["en"], "panic"), ("atie", a["tie"]["en"], "defend")]
    for i, l in enumerate(d["plea"]): J.append((f"plea{i}", l["en"], "panic"))
    J += [("strip0", d["strip"][0]["en"], "shout"), ("tie0", d["tie"][0]["en"], "shout"), ("begging0", d["begging"][0]["en"], "panic"), ("after0", d["after"][0]["en"], "defend")]
    for s in d["squad"]: J.append((f"squad_{s['key']}", s["en"], "roar" if s["key"] == "fire" else "shout"))
    for v, n in enumerate(CALLSIGNS): J.append((f"name{v}", a["name"]["en"].replace("{0}", n), "shout"))
    return J

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "voice-src", "trib")); ap.add_argument("--only", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); k = Kokoro(a.model, a.voices)
    for who, (voice, lang, spd) in gm.VOICES.items():
        if a.only and str(who) not in a.only.split(","): continue
        for key, text, intent in jobs():
            dst = os.path.join(a.out, f"{who}_{key}.mp3")
            if os.path.exists(dst): continue
            pcm, sr = k.create(text, voice=voice, speed=round(spd * SPEED[intent], 3), lang=lang); assert sr == emote.SR
            y = emote.speak(np.asarray(pcm, dtype=np.float64), intent)
            with tempfile.TemporaryDirectory() as d:
                wav = os.path.join(d, "x.wav"); sf.write(wav, y.astype(np.float32), sr)
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", gm.TRIM + f",loudnorm=I={LOUD.get(intent, -17)}:TP=-1.0:LRA=9", "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-q:a", "4", dst], check=True)
            print(f"{who:2} {voice:10} {key:14} {text}", flush=True)

if __name__ == "__main__":
    main()
