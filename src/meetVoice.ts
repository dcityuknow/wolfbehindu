import { audioCtx } from "./audio";

/**
 * Giọng nói trong cuộc họp: mỗi câu là 1 file mp3 thu sẵn (public/voice/meet/<lính>_<ý><n>.mp3, tạo bởi tools/gen-meet-voice.py),
 * mỗi lính 1 giọng riêng. NHIỀU CLIP PHÁT CÙNG LÚC (cãi nhau chồng tiếng), mỗi người pan trái/phải theo vị trí ô video của họ.
 * Biên độ âm thanh thật (AnalyserNode) điều khiển miệng nhân vật -> mở miệng khớp tiếng.
 * File thiếu/lỗi -> đọc bằng giọng trình duyệt (SpeechSynthesis) + miệng chuyển động giả lập.
 */
export interface Clip { dur: number; level: () => number; stop: () => void }
let bus: DynamicsCompressorNode | null = null;
const live = new Set<Clip>();

function out(a: AudioContext) {
  if (!bus) {
    bus = a.createDynamicsCompressor(); bus.threshold.value = -18; bus.ratio.value = 6; bus.attack.value = 0.005; bus.release.value = 0.2;
    const g = a.createGain(); g.gain.value = 0.95; bus.connect(g); g.connect(a.destination);
  }
  return bus;
}

/** Mức "ồn" tổng của phòng (0..1) để các ô khác phản ứng. */
export const crowdLevel = () => { let m = 0; live.forEach((c) => { m = Math.max(m, c.level()); }); return m; };
export const speakingCount = () => live.size;

const fake = (t0: number, dur: number) => () => { const k = (performance.now() - t0) / 1000; return k > dur ? 0 : 0.28 + 0.22 * Math.abs(Math.sin(k * 13.7)) * (0.6 + 0.4 * Math.sin(k * 5.3)); };

/* ── AUDIO SPRITE ── mỗi lính 1 file public/voice/pack/<lính>.mp3 (tools/pack-voice.py) + index.json {"<lính>": {"meet/accuse0": [bắt_đầu, độ_dài]}}.
 *    Nạp + giải mã MỘT lần vào bộ nhớ, mỗi câu chỉ là 1 lát cắt của AudioBuffer (phát chồng nhau thoải mái, không tải thêm gì). */
type Pack = { buf: AudioBuffer; idx: Record<string, [number, number]> };
const packs = new Map<number, Pack>(), loading = new Map<number, Promise<Pack | null>>();
let indexP: Promise<Record<string, Record<string, [number, number]>> | null> | null = null;
const getIndex = () => (indexP ??= fetch("voice/pack/index.json").then((r) => (r.ok ? r.json() : null)).catch(() => null));
export function loadPack(who: number): Promise<Pack | null> {
  const hit = packs.get(who); if (hit) return Promise.resolve(hit);
  let p = loading.get(who);
  if (!p) {
    p = (async () => {
      try {
        const idx = (await getIndex())?.[String(who)]; if (!idx) return null;
        const ab = await (await fetch(`voice/pack/${who}.mp3`)).arrayBuffer();
        const buf = await audioCtx().decodeAudioData(ab); const pk = { buf, idx }; packs.set(who, pk); return pk;
      } catch { loading.delete(who); return null; }
    })(); loading.set(who, p);
  }
  return p;
}
/** Nạp sẵn giọng của mọi lính (gọi khi vào game / bắt đầu họp) để lúc cần là phát ngay. */
export const preloadVoices = (n = 11) => { for (let i = 0; i < n; i++) void loadPack(i); };

/** Phát 1 câu. url dạng "voice/<meet|trib|bark>/<lính>_<khoá>.mp3" (tên logic: tra trong pack của lính đó). gain 0..1.5, pan -1..1. onEnd gọi đúng 1 lần khi xong / bị dừng. Thiếu pack -> giọng trình duyệt. */
export function playClip(url: string, o: { text: string; gain: number; pan: number; lang?: string; pitch?: number; onEnd: () => void }): Clip {
  let ended = false, src: AudioBufferSourceNode | null = null, an: AnalyserNode | null = null, usedTTS = false;
  const t0 = performance.now(), buf = new Uint8Array(256), fb = 0.6 + o.text.length * 0.06;
  const clip: Clip = { dur: fb, level: fake(t0, fb), stop: () => end() };
  function end() { if (ended) return; ended = true; live.delete(clip); try { src?.stop(); if (usedTTS) speechSynthesis.cancel(); } catch { /* bỏ qua */ } clip.level = () => 0; o.onEnd(); }
  const tts = () => {
    if (ended || usedTTS) return; usedTTS = true; const dur = 0.6 + o.text.length * 0.06; clip.dur = dur; clip.level = fake(performance.now(), dur);
    try {
      if (typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance(o.text); u.lang = o.lang || "en-US"; u.pitch = o.pitch ?? 1; u.rate = 1.1; u.volume = Math.min(1, o.gain); u.onend = end; u.onerror = end; speechSynthesis.speak(u); }
    } catch { /* thử timer */ }
    setTimeout(end, dur * 1000);
  };
  live.add(clip);
  const m = url.match(/voice\/(meet|trib|bark)\/(\d+)_(.+)\.mp3$/), who = m ? +m[2] : -1, key = m ? `${m[1]}/${m[3]}` : "";
  const play = (pk: Pack | null) => {
    if (ended) return; const e = pk?.idx[key]; if (!pk || !e) return tts();
    try {
      const a = audioCtx(); void a.resume();
      src = a.createBufferSource(); src.buffer = pk.buf; an = a.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.4;
      const g = a.createGain(); g.gain.value = o.gain; const pn = a.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan));
      src.connect(an); an.connect(g); g.connect(pn); pn.connect(out(a));
      const pre = Math.min(0.03, e[0]), len = e[1] + pre + 0.12;   // lề nhỏ chống cắt đầu/đuôi do độ trễ bộ mã hoá; hai bên đều là khoảng lặng
      clip.dur = e[1]; src.onended = end; src.start(0, e[0] - pre, len);
      clip.level = () => { an!.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; } return Math.min(1, Math.sqrt(s / buf.length) * 4.2); };
    } catch { tts(); }
  };
  const ready = who >= 0 ? packs.get(who) : null;
  if (ready) play(ready); else if (who >= 0) void loadPack(who).then(play); else tts();
  return clip;
}

/** Người chơi gõ chữ -> đọc bằng giọng trình duyệt (ngôn ngữ của game). */
export function speakText(text: string, lang: string, onEnd: () => void, o: { pitch?: number; rate?: number; volume?: number } = {}): Clip {
  const dur = 0.6 + text.length * 0.07, t0 = performance.now(); let ended = false;
  const clip: Clip = { dur, level: fake(t0, dur), stop: () => end() };
  function end() { if (ended) return; ended = true; live.delete(clip); clip.level = () => 0; onEnd(); }
  live.add(clip);
  try {
    if (typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.pitch = Math.max(0, Math.min(2, o.pitch ?? 1)); u.rate = Math.max(0.5, Math.min(2, o.rate ?? 1)); u.volume = Math.max(0, Math.min(1, o.volume ?? 1)); u.onend = end; u.onerror = end; speechSynthesis.speak(u); setTimeout(end, dur * 1000 + 4000); return clip; }
  } catch { /* timer */ }
  setTimeout(end, dur * 1000); return clip;
}

export function stopAllVoices() { [...live].forEach((c) => c.stop()); try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch { /* bỏ qua */ } }

/** Câu hô ngoài chiến trường: file mp3 Kokoro của chính lính đó (public/voice/bark/<lính>_<slug>.mp3). */
export const barkUrl = (i: number, text: string) => `voice/bark/${i}_${text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}.mp3`;
let barkCur: Clip | null = null;
export function playBark(i: number, text: string, shout: boolean, pitch: number) {
  barkCur?.stop();
  barkCur = playClip(barkUrl(i, text), { text, gain: shout ? 1.25 : 1, pan: 0, lang: "en-US", pitch, onEnd: () => {} });
}
