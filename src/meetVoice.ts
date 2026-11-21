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

/** Phát 1 câu. gain 0..1.5, pan -1..1. onEnd gọi đúng 1 lần khi xong / bị dừng. */
export function playClip(url: string, o: { text: string; gain: number; pan: number; lang?: string; pitch?: number; onEnd: () => void }): Clip {
  let ended = false, el: HTMLAudioElement | null = null, an: AnalyserNode | null = null, usedTTS = false;
  const t0 = performance.now(), buf = new Uint8Array(256);
  const clip: Clip = { dur: 0.6 + o.text.length * 0.06, level: fake(t0, 0.6 + o.text.length * 0.06), stop: () => end() };
  function end() { if (ended) return; ended = true; live.delete(clip); try { el?.pause(); if (usedTTS) speechSynthesis.cancel(); } catch { /* bỏ qua */ } clip.level = () => 0; o.onEnd(); }
  const tts = () => {
    if (ended || usedTTS) return; usedTTS = true; const dur = 0.6 + o.text.length * 0.06; clip.dur = dur; clip.level = fake(performance.now(), dur);
    try {
      if (typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance(o.text); u.lang = o.lang || "en-US"; u.pitch = o.pitch ?? 1; u.rate = 1.1; u.volume = Math.min(1, o.gain); u.onend = end; u.onerror = end; speechSynthesis.speak(u); return; }
    } catch { /* thử timer */ }
    setTimeout(end, dur * 1000);
  };
  try {
    const a = audioCtx(); void a.resume();
    el = new Audio(url); el.preload = "auto";
    try {
      const src = a.createMediaElementSource(el); an = a.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.4;
      const g = a.createGain(); g.gain.value = o.gain; const pn = a.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan));
      src.connect(an); an.connect(g); g.connect(pn); pn.connect(out(a));
    } catch { el.volume = Math.min(1, o.gain); }
    el.addEventListener("loadedmetadata", () => { if (isFinite(el!.duration) && el!.duration > 0) clip.dur = el!.duration; });
    el.addEventListener("ended", end); el.addEventListener("error", tts);
    clip.level = () => { if (!an) return fake(t0, clip.dur)(); an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; } return Math.min(1, Math.sqrt(s / buf.length) * 4.2); };
    void el.play().catch(tts);
    live.add(clip);
  } catch { live.add(clip); tts(); }
  return clip;
}

/** Người chơi gõ chữ -> đọc bằng giọng trình duyệt (ngôn ngữ của game). */
export function speakText(text: string, lang: string, onEnd: () => void): Clip {
  const dur = 0.6 + text.length * 0.07, t0 = performance.now(); let ended = false;
  const clip: Clip = { dur, level: fake(t0, dur), stop: () => end() };
  function end() { if (ended) return; ended = true; live.delete(clip); clip.level = () => 0; onEnd(); }
  live.add(clip);
  try {
    if (typeof speechSynthesis !== "undefined") { const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.onend = end; u.onerror = end; speechSynthesis.speak(u); setTimeout(end, dur * 1000 + 4000); return clip; }
  } catch { /* timer */ }
  setTimeout(end, dur * 1000); return clip;
}

export function stopAllVoices() { [...live].forEach((c) => c.stop()); try { if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); } catch { /* bỏ qua */ } }
