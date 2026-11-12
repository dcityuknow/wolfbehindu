/** Âm thanh tổng hợp bằng WebAudio (không cần file mp3). Mọi hàm bọc try/catch: không có âm thanh vẫn chơi được. */
let ac: AudioContext | null = null, nb: AudioBuffer | null = null;
function A(): AudioContext {
  if (!ac) { const C = window.AudioContext || (window as any).webkitAudioContext; ac = new C(); }
  if (ac!.state === "suspended") void ac!.resume();
  return ac!;
}
function noise(a: AudioContext) {
  if (nb) return nb;
  nb = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return nb;
}
let VOL = 1;
function hiss(freq: number, dur: number, vol: number, type: BiquadFilterType = "lowpass", delay = 0) {
  const a = A(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + delay;
  s.buffer = noise(a); f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol * VOL, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
}
function thump(f0: number, f1: number, dur: number, vol: number, delay = 0) {
  const a = A(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol * VOL, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
const safe = <T extends unknown[]>(f: (...a: T) => void) => (...a: T) => { try { f(...a); } catch { /* không có audio */ } };

export const sfx = {
  shot: safe((id: string, v: number = 1) => {
    VOL = v;
    if (id === "pistol") { hiss(3200, 0.12, 0.5); thump(180, 60, 0.12, 0.5); }
    else if (id === "smg") { hiss(4200, 0.08, 0.42); thump(200, 70, 0.08, 0.4); }
    else if (id === "rifle") { hiss(2400, 0.17, 0.6); thump(140, 45, 0.16, 0.6); }
    else { hiss(1500, 0.3, 0.8); thump(100, 35, 0.28, 0.8); hiss(600, 0.35, 0.4, "lowpass", 0.02); }
    VOL = 1;
  }),
  empty: safe(() => hiss(5000, 0.03, 0.25, "highpass")),
  reload: safe((dur: number) => { hiss(2500, 0.05, 0.3, "bandpass"); hiss(3500, 0.05, 0.35, "bandpass", dur * 0.55); hiss(1800, 0.07, 0.4, "bandpass", dur * 0.9); }),
  swap: safe(() => hiss(3000, 0.05, 0.22, "bandpass")),
  pin: safe(() => { hiss(4500, 0.04, 0.3, "highpass"); hiss(3000, 0.06, 0.25, "bandpass", 0.09); }),
  hit: safe(() => thump(900, 400, 0.06, 0.18)),
  explode: safe(() => { hiss(500, 1.1, 1, "lowpass"); thump(90, 25, 0.9, 1); hiss(1800, 0.3, 0.6); }),
};
