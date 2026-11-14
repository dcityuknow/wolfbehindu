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

/* ───────────── Âm thanh súng / lựu đạn: lấy nguyên từ game tham khảo (src/engine/sound.js) ───────────── */
const GUN_VOL = 1;        // to/nhỏ tiếng súng ngắn + AK (như game tham khảo)
const SNIPER_VOL = 0.85;  // to/nhỏ tiếng súng ngắm
let gb: GainNode | null = null, bm: { comp: DynamicsCompressorNode; send: GainNode } | null = null, nb2: AudioBuffer | null = null;
function noise2(a: AudioContext) {
  if (nb2) return nb2;
  nb2 = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = nb2.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return nb2;
}
/** Bíp đơn giản (hàm snd() của game tham khảo): tần số giảm dần về 40Hz. */
function snd(f: number, d: number, type: OscillatorType = "square", v = 0.05) {
  const a = A(), o = a.createOscillator(), g = a.createGain(), n = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, n); o.frequency.exponentialRampToValueAtTime(40, n + d);
  g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.001, n + d);
  o.connect(g); g.connect(a.destination); o.start(); o.stop(n + d);
}
/** Bus súng: bộ nén để tiếng to mà không vỡ. */
function gunBus(a: AudioContext) {
  if (gb) return gb;
  const c = a.createDynamicsCompressor(); c.threshold.value = -10; c.ratio.value = 8; c.attack.value = 0.001; c.release.value = 0.12;
  const g = a.createGain(); g.gain.value = GUN_VOL; g.connect(c); c.connect(a.destination);
  return (gb = g);
}
/** Bus nổ: bộ nén + vang vọng 3 giây + dội lặp. */
function boomBus(a: AudioContext) {
  if (bm) return bm;
  const comp = a.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 8; comp.connect(a.destination);
  const n = (a.sampleRate * 3) | 0, ir = a.createBuffer(2, n, a.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
  const cvl = a.createConvolver(); cvl.buffer = ir; const rg = a.createGain(); rg.gain.value = 1.1; cvl.connect(rg); rg.connect(comp);
  const dl = a.createDelay(1), fb = a.createGain(), lp = a.createBiquadFilter(); dl.delayTime.value = 0.23; fb.gain.value = 0.5; lp.type = "lowpass"; lp.frequency.value = 700;
  dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(comp);
  const send = a.createGain(); send.connect(cvl); send.connect(dl);
  return (bm = { comp, send });
}
/** Tiếng súng ngắn / AK của game tham khảo. vol: 1 = to như người chơi bắn. */
function gunShot(rifle: boolean, vol: number) {
  const a = A(), n = a.currentTime, out = a.createGain(), r = 0.95 + Math.random() * 0.1; out.gain.value = vol; out.connect(gunBus(a));
  const s = a.createBufferSource(), fl = a.createBiquadFilter(), ng = a.createGain(), nd = rifle ? 0.09 : 0.12;
  s.buffer = noise2(a); fl.type = "bandpass"; fl.Q.value = 0.8; fl.frequency.setValueAtTime((rifle ? 2000 : 2500) * r, n); fl.frequency.exponentialRampToValueAtTime(500, n + nd);
  ng.gain.setValueAtTime(rifle ? 0.9 : 1, n); ng.gain.exponentialRampToValueAtTime(0.001, n + nd); s.connect(fl); fl.connect(ng); ng.connect(out); s.start(n, Math.random() * 1.5); s.stop(n + nd + 0.02);
  const tone = (ty: OscillatorType, f0: number, f1: number, d: number, v: number) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = ty; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + d);
    g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.001, n + d); o.connect(g); g.connect(out); o.start(n); o.stop(n + d + 0.02);
  };
  tone("square", (rifle ? 420 : 520) * r, 80, rifle ? 0.1 : 0.11, 0.32);   // tiếng nổ chính
  tone("sine", (rifle ? 130 : 160) * r, 45, 0.14, 0.9);                    // cú giật trầm
}
/** Tiếng súng ngắm của game tham khảo: nổ giòn + ục trầm + vang vọng. */
function sniperShot(vol: number) {
  const a = A(), B = boomBus(a), n = a.currentTime, bus = a.createGain(); bus.gain.value = 1.2 * SNIPER_VOL * vol;
  const sg = a.createGain(); sg.gain.value = 0.8; bus.connect(B.comp); bus.connect(sg); sg.connect(B.send);
  const ns = a.createBufferSource(), hp = a.createBiquadFilter(), lp = a.createBiquadFilter(), ng = a.createGain();
  ns.buffer = noise2(a); hp.type = "highpass"; hp.frequency.value = 500; lp.type = "lowpass";
  lp.frequency.setValueAtTime(7000, n); lp.frequency.exponentialRampToValueAtTime(250, n + 0.7);
  ng.gain.setValueAtTime(1.4, n); ng.gain.exponentialRampToValueAtTime(0.001, n + 0.8);
  ns.connect(hp); hp.connect(lp); lp.connect(ng); ng.connect(bus); ns.start(n); ns.stop(n + 0.8);
  const tone = (ty: OscillatorType, f0: number, f1: number, d: number, v: number) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = ty; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + d * 0.85);
    g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.001, n + d); o.connect(g); g.connect(bus); o.start(n); o.stop(n + d);
  };
  tone("sine", 150, 30, 0.9, 1.5); tone("sawtooth", 900, 70, 0.14, 0.7); tone("square", 320, 50, 0.35, 0.3);
}
/** Tiếng nổ lựu đạn của game tham khảo: nhiều lớp + vang vọng. dist = khoảng cách tới người nghe (m). */
function boom(dist: number) {
  const a = A(), B = boomBus(a), n = a.currentTime, bus = a.createGain();
  bus.gain.value = 0.3 + 2.2 / (1 + dist / 8);   // xa vẫn nghe tiếng ầm, gần thì cực lớn
  bus.connect(B.comp); bus.connect(B.send);
  const ns = a.createBufferSource(), lp = a.createBiquadFilter(), ng = a.createGain(); ns.buffer = noise2(a); lp.type = "lowpass";
  lp.frequency.setValueAtTime(4000, n); lp.frequency.exponentialRampToValueAtTime(90, n + 1.6);
  ng.gain.setValueAtTime(1.3, n); ng.gain.exponentialRampToValueAtTime(0.001, n + 1.8); ns.connect(lp); lp.connect(ng); ng.connect(bus); ns.start(n); ns.stop(n + 1.8);
  const tone = (ty: OscillatorType, f0: number, f1: number, d: number, v: number) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = ty; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + d * 0.85);
    g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.001, n + d); o.connect(g); g.connect(bus); o.start(n); o.stop(n + d);
  };
  tone("sine", 120, 26, 1.4, 1.6); tone("sawtooth", 260, 35, 0.5, 0.6);
}

export const sfx = {
  /** Tiếng bắn: pistol / rifle (AK) / sniper, đúng như game tham khảo. v = hệ số to nhỏ (bot ở xa nhỏ hơn). */
  shot: safe((id: string, v: number = 1) => { if (id === "sniper") sniperShot(v); else gunShot(id === "rifle", v); }),
  empty: safe(() => snd(90, 0.05, "square", 0.04)),
  reload: safe((_dur: number) => snd(300, 0.15, "sine", 0.05)),
  swap: safe(() => hiss(3000, 0.05, 0.22, "bandpass")),
  roll: safe(() => { hiss(700, 0.22, 0.35, "lowpass"); thump(160, 70, 0.12, 0.3, 0.3); }),   // vút gió + tiếp đất
  pin: safe(() => snd(240, 0.08, "sine", 0.03)),            // giật chốt lựu đạn (game tham khảo)
  nadeThrow: safe(() => snd(300, 0.1, "sine", 0.04)),       // vung tay ném
  nadeLaunch: safe(() => snd(200, 0.12, "sine", 0.05)),     // lựu đạn rời tay
  hit: safe(() => thump(900, 400, 0.06, 0.18)),
  explode: safe((dist: number = 0) => boom(dist)),
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
