#!/usr/bin/env python3
"""Render the opening-cutscene voice-over to public/voice/<id>.mp3 with Kokoro (neural TTS, 100% offline, male voices).

  pip install kokoro-onnx soundfile            (+ ffmpeg on PATH)
  download kokoro-v1.0.onnx and voices-v1.0.bin from
    https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  python tools/gen-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin

Keep the `en` text here identical to VOICE in src/story.ts. One voice per character.
"""
import argparse, os, subprocess, sys, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

# radio filters (ffmpeg -af)
NET   = "highpass=f=180,lowpass=f=4200,acompressor=threshold=0.1:ratio=3,volume=1.0"
STAT  = "highpass=f=450,lowpass=f=2600,acrusher=bits=9:mode=log:mix=0.5,tremolo=f=11:d=0.35"
AI    = "asetrate=24000*0.86,aresample=24000,atempo=1.1628,aecho=0.8:0.7:14|31:0.45|0.3,acrusher=bits=10:mode=log:mix=0.3,lowpass=f=5200"
PRIV  = "asetrate=24000*0.9,aresample=24000,atempo=1.111,highpass=f=120,lowpass=f=3800,aecho=0.7:0.6:45:0.35"

# id, voice, lang, speed, filter, text            (speaker → voice)
LINES = [
 # BRAVO · team leader — deep British commander
 ("v1",  "bm_george", "en-gb", 1.00, NET,  "Heads up. Someone leaked our coordinates."),
 ("v1b", "bm_george", "en-gb", 1.05, "",   "There's a rat on this plane. I will find you."),
 # DELTA — cold, flat British
 ("v7",  "bm_lewis",  "en-gb", 1.00, "",   "Easy. Maybe the rat is right here."),
 # ECHO — young, shaky, scared
 ("v8",  "am_puck",   "en-us", 1.20, "",   "It can't be one of us... please, not us."),
 # FOXTROT — soft, sad
 ("v9",  "am_liam",   "en-us", 0.95, "",   "I just wanted to go home... to my family."),
 # YOU — calm, neutral
 ("v10", "am_adam",   "en-us", 1.00, "",   "Stay calm. Panic is what the spy wants."),
 # GOLF — smug, deep (the one pressing the beacon)
 ("v11", "am_onyx",   "en-us", 0.95, "",   "Relax. It's just my beacon. Why is everybody staring at me?"),
 # CHARLIE — gruff, aggressive
 ("v2",  "am_fenrir", "en-us", 1.05, "",   "What are you looking at?"),
 ("v2b", "am_fenrir", "en-us", 1.00, "",   "You?"),
 ("v2c", "am_fenrir", "en-us", 1.00, "",   "Or was it you?"),
 ("v12", "bm_george", "en-gb", 1.05, "",   "Nobody moves. Nobody."),
 # beat 1 — jump
 ("v3",  "bm_george", "en-gb", 1.22, NET,  "Save it! Improvise on the ground! MOVE! GO, GO, GO!"),
 # beat 2 — dying radio
 ("v4a", "am_echo",   "en-us", 1.10, STAT, "Mayday... lost formation!..."),
 ("v4b", "am_echo",   "en-us", 1.00, STAT, "Off-course... can't hold..."),
 ("v4c", "am_echo",   "en-us", 1.25, STAT, "...abort, abort—"),
 # beat 3 — suit AI
 ("v5",  "bm_daniel", "en-gb", 0.95, AI,   "Warning. Critical altitude. Emergency auto-deploy engaged."),
 # beat 4 — private channel
 ("v6",  "am_onyx",   "en-us", 0.80, PRIV, "Game on. Good luck surviving... old friends."),
]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "voice")); ap.add_argument("--only", default="")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    k = Kokoro(a.model, a.voices)
    for id_, voice, lang, speed, flt, text in LINES:
        if a.only and id_ not in a.only.split(","): continue
        pcm, sr = k.create(text, voice=voice, speed=speed, lang=lang)
        with tempfile.TemporaryDirectory() as d:
            wav = os.path.join(d, "x.wav"); sf.write(wav, pcm, sr)
            chain = ",".join(x for x in [flt, "loudnorm=I=-16:TP=-1.5:LRA=7"] if x)
            dst = os.path.join(a.out, f"{id_}.mp3")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", chain, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-q:a", "3", dst], check=True)
        dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst], capture_output=True, text=True).stdout.strip()
        print(f"{id_:4} {voice:10} {float(dur):5.2f}s  {text}")

if __name__ == "__main__":
    main()
