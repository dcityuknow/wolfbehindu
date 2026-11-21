#!/usr/bin/env python3
"""Render the "SHUT UP + trial" scene lines (src/config/trialLines.json) to public/voice/meet/ with Kokoro, one clip per soldier voice.

  silence / opinion / backSus / backClear / againstSus / againstClear   ->  <soldier>_<intent><n>.mp3
  pointSus / pointClear  (say the target's NAME)                         ->  <soldier>_<intent><n>_<target>.mp3   (target = callsign index 0..10, never the soldier himself)

  pip install kokoro-onnx soundfile praat-parselmouth scipy numpy      (+ ffmpeg on PATH)
  python tools/gen-trial-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--only 2,5] [--intent silence]

Same 11 voices as gen-meet-voice.py. Missing files are not a problem: the game falls back to the browser voice.
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(__file__))
import emote
from kokoro_onnx import Kokoro

VOICES = {
    0: ("am_adam", "en-us", 1.00), 1: ("bm_george", "en-gb", 1.00), 2: ("am_fenrir", "en-us", 1.05), 3: ("bm_lewis", "en-gb", 1.00),
    4: ("am_puck", "en-us", 1.15), 5: ("am_liam", "en-us", 0.95), 6: ("am_onyx", "en-us", 0.95), 7: ("am_michael", "en-us", 1.05),
    8: ("bm_fable", "en-gb", 1.05), 9: ("am_eric", "en-us", 0.95), 10: ("am_liam", "en-us", 1.12),
}
CALLSIGNS = ["You", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo"]
# intent -> emotion preset in emote.EMO, speaking speed, loudness (LUFS)
EMO = {"silence": "roar", "opinion": "deflect", "pointSus": "accuse", "pointClear": "agree", "backSus": "agree", "backClear": "agree", "againstSus": "defend", "againstClear": "accuse"}
MOOD = {"silence": 0.78, "opinion": 0.98, "pointSus": 1.0, "pointClear": 0.95, "backSus": 1.0, "backClear": 1.0, "againstSus": 1.05, "againstClear": 1.08}
LOUD = {"silence": -11.5, "pointSus": -14, "againstClear": -15, "againstSus": -16}
NAMED = {"pointSus", "pointClear"}
TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"

def render(k, who, text, intent, dst):
    voice, lang, spd = VOICES[who]
    pcm, sr = k.create(text, voice=voice, speed=round(spd * MOOD[intent], 3), lang=lang); assert sr == emote.SR
    y = emote.speak(np.asarray(pcm, dtype=np.float64), EMO[intent])
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "x.wav"); sf.write(wav, y.astype(np.float32), sr)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", TRIM + f",loudnorm=I={LOUD.get(intent, -17)}:TP=-3.5:LRA=9", "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-q:a", "5", dst], check=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "voice", "meet")); ap.add_argument("--only", default=""); ap.add_argument("--intent", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    lines = json.load(open(os.path.join(os.path.dirname(__file__), "..", "src", "config", "trialLines.json"), encoding="utf-8"))
    k = Kokoro(a.model, a.voices)
    for who in VOICES:
        if a.only and str(who) not in a.only.split(","): continue
        for intent, arr in lines.items():
            if a.intent and intent != a.intent: continue
            for n, ln in enumerate(arr):
                if intent in NAMED:
                    for tg in range(len(CALLSIGNS)):
                        if tg == who: continue
                        txt = ln["en"].replace("{n}", CALLSIGNS[tg]); render(k, who, txt, intent, os.path.join(a.out, f"{who}_{intent}{n}_{tg}.mp3")); print(f"{who:2} {intent}{n}_{tg}  {txt}", flush=True)
                else:
                    render(k, who, ln["en"], intent, os.path.join(a.out, f"{who}_{intent}{n}.mp3")); print(f"{who:2} {intent}{n}  {ln['en']}", flush=True)

if __name__ == "__main__":
    main()
