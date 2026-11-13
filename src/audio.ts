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

/** Âm thanh cho cảnh mở đầu: bíp của kẻ nội gián, tim đập, sấm, dù bung, rừng đêm + tiếng nền (động cơ / gió / mưa) chạy vòng lặp. */
let amb: { lo: GainNode; lof: BiquadFilterNode; hi: GainNode; hif: BiquadFilterNode; s1: AudioBufferSourceNode; s2: AudioBufferSourceNode } | null = null;
const tone = (f: number, dur: number, vol: number, type: OscillatorType = "square", delay = 0) => {
  const a = A(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
};
export const cineSfx = {
  static: safe((d: number, v: number = 0.5) => hiss(2600, d, v, "highpass")),
  squelch: safe(() => { hiss(3500, 0.05, 0.35, "bandpass"); tone(1300, 0.04, 0.08, "sine", 0.05); }),   // bấm nút nói bộ đàm
  beep: safe((vol: number = 1) => tone(1760, 0.16, 0.2 * vol)),                                  // tiếng bíp bộ phát tín hiệu (khớp giây 0:08 và 0:58)
  alarm: safe(() => { tone(2400, 0.09, 0.16); tone(2400, 0.09, 0.16, "square", 0.14); }),   // đồng hồ độ cao cảnh báo
  heart: safe(() => { thump(68, 38, 0.2, 0.9); thump(58, 36, 0.22, 0.65, 0.21); }),
  thunder: safe((near: boolean) => { hiss(near ? 1100 : 380, near ? 1.5 : 2.6, near ? 1 : 0.7); thump(near ? 70 : 50, 22, near ? 1.3 : 2, near ? 1 : 0.8); if (near) hiss(4500, 0.12, 0.8, "highpass"); }),
  chute: safe(() => { hiss(900, 0.35, 1, "lowpass"); thump(95, 30, 0.5, 1); hiss(3200, 0.12, 0.7, "bandpass", 0.04); }),
  crack: safe(() => { hiss(2800, 0.05, 0.6, "bandpass"); hiss(1800, 0.07, 0.5, "bandpass", 0.08); hiss(3400, 0.04, 0.5, "bandpass", 0.17); }),
  thud: safe(() => { thump(120, 38, 0.3, 1); hiss(260, 0.35, 0.7); }),
  drip: safe(() => thump(1500, 650, 0.06, 0.12)),
  cricket: safe(() => { for (let i = 0; i < 5; i++) tone(4300, 0.04, 0.035, "sine", i * 0.07); }),
  /** Bật nền âm thanh (vòng lặp nhiễu qua 2 bộ lọc: dải thấp = động cơ/sấm ì ầm, dải cao = gió/mưa). */
  ambStart: safe(() => {
    if (amb) return; const a = A(), mk = (type: BiquadFilterType, f: number) => { const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(); s.buffer = noise(a); s.loop = true; fl.type = type; fl.frequency.value = f; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(); return { s, fl, g }; };
    const l = mk("lowpass", 170), h = mk("highpass", 1500); amb = { lo: l.g, lof: l.fl, hi: h.g, hif: h.fl, s1: l.s, s2: h.s };
  }),
  ambSet: safe((lo: number, loF: number, hi: number, hiF: number) => {
    if (!amb) return; const t = A().currentTime; amb.lo.gain.setTargetAtTime(lo, t, 0.15); amb.lof.frequency.setTargetAtTime(loF, t, 0.15); amb.hi.gain.setTargetAtTime(hi, t, 0.15); amb.hif.frequency.setTargetAtTime(hiF, t, 0.15);
  }),
  ambStop: safe(() => { if (!amb) return; const m = amb; amb = null; const t = A().currentTime; m.lo.gain.setTargetAtTime(0, t, 0.15); m.hi.gain.setTargetAtTime(0, t, 0.15); setTimeout(() => { try { m.s1.stop(); m.s2.stop(); } catch { /* đã dừng */ } }, 900); }),
};
