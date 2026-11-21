#!/usr/bin/env python3
"""Render the campfire-meeting debate lines to public/voice/meet/<soldier>_<intent><n>.mp3 with Kokoro (neural TTS, offline).
Every soldier gets EVERY line in his own voice, so any of them can accuse / defend / shout and several clips can play at once.

  pip install kokoro-onnx soundfile            (+ ffmpeg on PATH)
  download kokoro-v1.0.onnx and voices-v1.0.bin from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  python tools/gen-meet-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--only 2,5] [--intent accuse]

Lines live in src/config/meetLines.json (shared with the game). Index = callsign index in story.ts (0 You, 1 Bravo ... 10 Kilo).
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(__file__))
import emote   # lớp cảm xúc: cao độ / run giọng / gào / cười / hét (xem tools/emote.py)
from kokoro_onnx import Kokoro

# index -> (voice, lang, base speed)   same voices as the opening cutscene (public/voice/README.txt)
VOICES = {
    0: ("am_adam", "en-us", 1.00), 1: ("bm_george", "en-gb", 1.00), 2: ("am_fenrir", "en-us", 1.05), 3: ("bm_lewis", "en-gb", 1.00),
    4: ("am_puck", "en-us", 1.15), 5: ("am_liam", "en-us", 0.95), 6: ("am_onyx", "en-us", 0.95), 7: ("am_michael", "en-us", 1.05),
    8: ("bm_fable", "en-gb", 1.05), 9: ("am_eric", "en-us", 0.95), 10: ("am_liam", "en-us", 1.12),
}
# speaking-speed multiplier per intent (angry = fast, suspicious = slow)
MOOD = {"accuse": 1.05, "suspect": 0.92, "defend": 1.05, "deflect": 1.00, "shout": 1.10, "agree": 1.00, "panic": 1.12, "mock": 0.97, "laugh": 1.15, "scream": 0.90, "gasp": 1.20, "grunt": 0.95}
# độ to (LUFS): gào/hét to hơn, thì thầm/nghi ngờ nhỏ hơn -> nghe có "sức"
LOUD = {"shout": -13, "scream": -12, "accuse": -15, "panic": -15, "gasp": -19, "suspect": -20, "grunt": -20}
# trim leading/trailing silence so overlapping clips start/stop tight, then normalise loudness
TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "voice", "meet")); ap.add_argument("--only", default=""); ap.add_argument("--intent", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    lines = json.load(open(os.path.join(os.path.dirname(__file__), "..", "src", "config", "meetLines.json"), encoding="utf-8"))
    k = Kokoro(a.model, a.voices)
    for who, (voice, lang, spd) in VOICES.items():
        if a.only and str(who) not in a.only.split(","): continue
        for intent, arr in lines.items():
            if a.intent and intent != a.intent: continue
            for n, ln in enumerate(arr):
                pcm, sr = k.create(ln["en"], voice=voice, speed=round(spd * MOOD[intent], 3), lang=lang)
                assert sr == emote.SR
                pcm = np.asarray(pcm, dtype=np.float64)
                if intent in emote.VOCAL: y = emote.VOCAL[intent](pcm)
                else:
                    y = emote.speak(pcm, intent)
                    if intent == "mock":   # chế giễu: kết bằng tiếng cười khẩy
                        lg = k.create("Heh heh heh. Hah!", voice=voice, speed=round(spd * 1.1, 3), lang=lang)[0]
                        y = emote.cat(y, emote.laugh(np.asarray(lg, dtype=np.float64)) * 0.8, gap=0.06)
                with tempfile.TemporaryDirectory() as d:
                    wav = os.path.join(d, "x.wav"); sf.write(wav, y.astype(np.float32), sr)
                    dst = os.path.join(a.out, f"{who}_{intent}{n}.mp3")
                    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", TRIM + f",loudnorm=I={LOUD.get(intent, -17)}:TP=-1.0:LRA=9", "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-q:a", "4", dst], check=True)
                print(f"{who:2} {voice:10} {intent}{n}  {ln['en']}", flush=True)

if __name__ == "__main__":
    main()
