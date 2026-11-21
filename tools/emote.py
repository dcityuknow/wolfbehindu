"""Lớp CẢM XÚC đặt lên giọng đọc phẳng của Kokoro (Praat/parselmouth + numpy): đổi cao độ, biên độ ngữ điệu, tốc độ, formant,
run giọng, hơi thở, gào bể tiếng, tiếng cười / hét / hít hơi. Không cần model nào khác — chỉnh số trong EMO / VOCAL bên dưới rồi chạy lại gen-meet-voice.py."""
import numpy as np, parselmouth
from parselmouth.praat import call
from scipy import signal

SR = 24000
rng = np.random.default_rng(7)

def snd(x): return parselmouth.Sound(np.asarray(x, dtype=np.float64), sampling_frequency=SR)
def f0_median(s):
    a = s.to_pitch(pitch_floor=60, pitch_ceiling=550).selected_array["frequency"]; a = a[a > 0]
    return float(np.median(a)) if len(a) else 130.0

def retune(x, pitch=1.0, rng_=1.0):
    """chỉnh cao độ THẬT theo thang log: trung vị x pitch, biên độ lên/xuống của ngữ điệu x rng_ (an toàn: kẹp 65..650 Hz)"""
    s = snd(x); med = f0_median(s); m = call(s, "To Manipulation", 0.01, 60, 550); pt = call(m, "Extract pitch tier"); n = int(call(pt, "Get number of points"))
    if n < 3: return x
    new = call("Create PitchTier", "p", s.xmin, s.xmax)
    for k in range(n):
        t = call(pt, "Get time from index", k + 1); v = call(pt, "Get value at index", k + 1)
        call(new, "Add point", t, float(np.clip(med * pitch * (v / med) ** rng_, 65, 650)))
    call([m, new], "Replace pitch tier"); return np.asarray(call(m, "Get resynthesis (overlap-add)").values[0])

def gender(x, pitch=1.0, rng_=1.0, formant=1.0, dur=1.0):
    """pitch = nhân cao độ trung vị · rng_ = nhân biên độ ngữ điệu · formant = dời cộng hưởng (>1 sáng/căng) · dur = nhân thời lượng"""
    y = x
    if formant != 1.0 or dur != 1.0:
        s = snd(x); y = np.asarray(call(s, "Change gender", 60, 550, formant, 0, 1.0, dur).values[0])   # 0 = giữ cao độ; chỉ dời formant + tốc độ
    return retune(y, pitch, rng_) if (pitch != 1.0 or rng_ != 1.0) else y

def wobble(x, hz=6.0, depth=0.03, jitter=0.0, glide=0.0):
    """run giọng THẬT (đổi cao độ theo thời gian): vibrato hz/depth, jitter ngẫu nhiên, glide = trượt cao độ cả câu (+ lên / - xuống)"""
    s = snd(x); m = call(s, "To Manipulation", 0.01, 60, 550); pt = call(m, "Extract pitch tier"); n = int(call(pt, "Get number of points"))
    if n < 3: return x
    ts = [call(pt, "Get time from index", k + 1) for k in range(n)]; vs = [call(pt, "Get value at index", k + 1) for k in range(n)]; T = max(ts) - min(ts) + 1e-6
    new = call("Create PitchTier", "p", s.xmin, s.xmax)
    for t, v in zip(ts, vs):
        f = 1 + depth * np.sin(2 * np.pi * hz * t) + jitter * rng.normal() + glide * ((t - ts[0]) / T)
        call(new, "Add point", t, max(60.0, v * f))
    call([m, new], "Replace pitch tier"); return np.asarray(call(m, "Get resynthesis (overlap-add)").values[0])

def tremolo(x, hz, depth): t = np.arange(len(x)) / SR; return x * (1 - depth + depth * 0.5 * (1 + np.sin(2 * np.pi * hz * t)))
def rough(x, hz=70, depth=0.35): t = np.arange(len(x)) / SR; return x * (1 - depth * 0.5 * (1 + np.sign(np.sin(2 * np.pi * hz * t))))   # "gầm gừ / vỡ tiếng"
def saturate(x, drive): return np.tanh(x * drive) / np.tanh(drive)
def env(x, ms=25): k = max(1, int(SR * ms / 1000)); return np.convolve(np.abs(x), np.ones(k) / k, mode="same")
def bright(x, gain=0.6, fc=2200): sos = signal.butter(2, fc, "hp", fs=SR, output="sos"); return x + gain * signal.sosfilt(sos, x)
def darken(x, fc=3200): sos = signal.butter(2, fc, "lp", fs=SR, output="sos"); return signal.sosfilt(sos, x)
def breath(x, level, lo=1200, hi=7000):
    n = rng.normal(size=len(x)); sos = signal.butter(2, [lo, hi], "bp", fs=SR, output="sos"); n = signal.sosfilt(sos, n)
    e = env(x, 40); e = e / (e.max() + 1e-9); return x + level * n * (e ** 1.5) * (np.abs(x).max() + 1e-9)
def fade(x, a=0.006, b=0.02):
    x = x.copy(); na, nb = int(SR * a), int(SR * b); x[:na] *= np.linspace(0, 1, na); x[-nb:] *= np.linspace(1, 0, nb); return x
def norm(x, peak=0.9): return x / (np.abs(x).max() + 1e-9) * peak
def cat(*a, gap=0.0): z = np.zeros(int(SR * gap)); out = []; [out.extend([p, z]) for p in a]; return np.concatenate(out[:-1] if gap else out)

# ── giọng NÓI theo cảm xúc ──  pitch · biên độ ngữ điệu · formant · thời lượng | run giọng | gào/gầm | hơi thở | độ sáng
EMO = {
    "accuse":  dict(p=1.14, r=1.7, f=1.05, d=0.90, drive=3.0, br=1.0, wob=(0, 0, 0.012, 0.0)),
    "shout":   dict(p=1.32, r=1.9, f=1.09, d=0.86, drive=5.0, rough=(65, 0.30), br=1.2, wob=(0, 0, 0.02, 0.0)),
    "roar":    dict(p=1.36, r=2.2, f=1.10, d=1.35, drive=7.0, rough=(58, 0.38), br=1.4, wob=(0, 0, 0.026, 0.05)),   # "SHUT THE FUCK UP": gào bể tiếng, to nhất game
    "panic":   dict(p=1.42, r=1.8, f=1.10, d=0.84, drive=1.6, trem=(7.0, 0.30), breath=0.18, br=0.5, wob=(6.5, 0.05, 0.03, 0.10)),
    "defend":  dict(p=1.18, r=1.5, f=1.05, d=0.94, drive=1.2, trem=(5.0, 0.14), breath=0.10, br=0.2, wob=(5.5, 0.025, 0.012, 0.03)),
    "mock":    dict(p=1.06, r=2.3, f=1.00, d=1.14, drive=1.0, br=0.3, wob=(3.2, 0.05, 0.0, 0.0)),
    "deflect": dict(p=0.95, r=1.6, f=0.98, d=1.06, drive=1.0, br=0.0, wob=(0, 0, 0.0, -0.04)),
    "suspect": dict(p=0.90, r=0.85, f=0.97, d=1.14, drive=1.0, breath=0.16, dark=3400, wob=(0, 0, 0.0, -0.06)),
    "agree":   dict(p=1.02, r=1.35, f=1.0, d=0.98, drive=1.0, br=0.1, wob=(0, 0, 0, 0)),
}
def speak(x, intent):
    c = EMO[intent]; y = gender(x, c["p"], c["r"], c["f"], c["d"])
    hz, dep, jit, gl = c["wob"]
    if hz or jit or gl: y = wobble(y, hz or 5.0, dep, jit, gl)
    if "rough" in c: y = rough(y, *c["rough"])
    if "trem" in c: y = tremolo(y, *c["trem"])
    if c.get("br"): y = bright(y, 0.5 * c["br"])
    if "dark" in c: y = darken(y, c["dark"])
    if c["drive"] > 1.05: y = saturate(y, c["drive"])
    if c.get("breath"): y = breath(y, c["breath"])
    return fade(norm(y))

# ── TIẾNG KHÔNG LỜI (đầu vào = Kokoro đọc "Ha ha ha…", "Aaaah!"…) ──
def laugh(x):
    y = gender(x, 1.22, 2.1, 1.02, 0.78); y = wobble(y, 0, 0, 0.03, -0.18)          # giọng cao vút, tụt dần như cười hết hơi
    y = tremolo(y, 7.2, 0.62); y = breath(y, 0.12); return fade(norm(saturate(y, 1.6)))   # nhịp "ha-ha-ha" ngắt quãng
def scream(x):
    y = gender(x, 1.62, 1.25, 1.14, 1.25); y = wobble(y, 6.0, 0.045, 0.02, 0.10)      # rít cao, vibrato, vống lên
    y = rough(y, 80, 0.28); y = bright(y, 0.9, 1800); y = saturate(y, 7.0); return fade(norm(y))
def inhale(dur=0.26):
    n = int(SR * dur); t = np.linspace(0, 1, n); e = np.sin(np.pi * t ** 0.7) ** 1.5
    z = signal.sosfilt(signal.butter(2, [500, 5200], "bp", fs=SR, output="sos"), rng.normal(size=n)); return z * e * 0.28
def gasp(x): y = gender(x, 1.28, 1.5, 1.07, 0.85); return fade(cat(inhale(), norm(saturate(y, 1.3), 0.8), gap=0.0))   # hít hơi + "Hả?!"
def grunt(x): y = gender(x, 0.88, 0.7, 0.95, 1.15); return fade(norm(breath(darken(y, 3000), 0.12)))
VOCAL = {"laugh": laugh, "scream": scream, "gasp": gasp, "grunt": grunt}
