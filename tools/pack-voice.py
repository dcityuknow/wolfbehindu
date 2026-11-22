#!/usr/bin/env python3
"""Gộp mọi clip lẻ (voice-src/{meet,trib,bark}/<lính>_<khoá>.mp3) thành "audio sprite": MỖI LÍNH 1 FILE public/voice/pack/<lính>.mp3
+ 1 bảng chỉ mục public/voice/pack/index.json  {"<lính>": {"meet/accuse0": [giây_bắt_đầu, độ_dài], ...}}.
Game nạp 11 file này 1 lần, giải mã vào bộ nhớ rồi cắt phát từng câu (src/meetVoice.ts) — thay cho ~1.100 file mp3 lẻ.

  python tools/gen-meet-voice.py / gen-trib-voice.py / gen-bark-voice.py   (ghi vào voice-src/)   ->   python tools/pack-voice.py
"""
import json, os, re, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
SRC = os.path.join(ROOT, "voice-src"); OUT = os.path.join(ROOT, "public", "voice", "pack"); SR = 24000; GAP = 0.25

def decode(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.int16)

def main():
    os.makedirs(OUT, exist_ok=True); files = {}
    for kind in ("meet", "trib", "bark"):
        d = os.path.join(SRC, kind)
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            m = re.match(r"^(\d+)_(.+)\.mp3$", f)
            if m: files.setdefault(int(m.group(1)), []).append((f"{kind}/{m.group(2)}", os.path.join(d, f)))
    index = {}; gap = np.zeros(int(SR * GAP), dtype=np.int16)
    for who, items in sorted(files.items()):
        parts = [gap]; pos = len(gap); idx = {}
        for key, path in items:
            pcm = decode(path); idx[key] = [round(pos / SR, 4), round(len(pcm) / SR, 4)]
            parts += [pcm, gap]; pos += len(pcm) + len(gap)
        raw = os.path.join(OUT, f"{who}.raw"); np.concatenate(parts).tofile(raw)
        dst = os.path.join(OUT, f"{who}.mp3")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", raw, "-codec:a", "libmp3lame", "-q:a", "5", dst], check=True)
        os.remove(raw); index[str(who)] = idx
        print(f"{who:2}: {len(idx)} clip -> {dst} ({os.path.getsize(dst) // 1024} KB)")
    json.dump(index, open(os.path.join(OUT, "index.json"), "w"), separators=(",", ":"))

if __name__ == "__main__":
    main()
