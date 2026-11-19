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

/* ───────────── Âm thanh nước: lấy NGUYÊN từ game tham khảo (src/engine/sound.js: splashSnd · wadeSnd · tiếng đạn/lựu đạn xuống nước · lặn · chết đuối) ───────────── */
function tone2(type: OscillatorType, f0: number, f1: number, dur: number, v: number, t0 = 0) {
  const a = A(), n = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + dur);
  g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.001, n + dur); o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + dur + 0.02);
}
function noiseBurst(kind: BiquadFilterType, f0: number, f1: number, dur: number, v: number, q = 1, t0 = 0) {
  const a = A(), n = a.currentTime + t0, s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise2(a); fl.type = kind; fl.Q.value = q; fl.frequency.setValueAtTime(f0, n); fl.frequency.exponentialRampToValueAtTime(f1, n + dur);
  g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(0.001, n + dur); s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(n, Math.random() * 1.5); s.stop(n + dur + 0.02);
}
/** Chạm nước: "tũm" trầm, mềm (big = rơi/nhảy xuống · false = bước lên bờ, hạt nước nhỏ). k = hệ số to nhỏ (xa thì nhỏ). */
function splashSnd(big: boolean, k0 = 1) {
  const r = 0.94 + Math.random() * 0.12, k = (big ? 1 : 0.55) * k0;
  tone2("sine", 300 * r, 85 * r, 0.2, 0.5 * k, 0);                              // "tũm": âm trầm rơi nhanh
  tone2("sine", 170 * r, 380 * r, 0.13, 0.2 * k, 0.05);                         // bọt khí nhỏ nổi lên "bủm"
  noiseBurst("lowpass", 650, 140, big ? 0.28 : 0.18, 0.3 * k, 0.4, 0);          // nước xao nhẹ, đã lọc mềm
  if (big) tone2("sine", 240 * r, 520 * r, 0.09, 0.09 * k0, 0.16);              // giọt nước rơi lại rất khẽ
}
/** Một nhịp quạt nước / bước lội: "bì - bõm" (bọt nhỏ rồi bọt lớn trầm, âm đi lên như bong bóng nước). */
function wadeSnd(k = 1) {
  const r = 0.88 + Math.random() * 0.24;
  tone2("sine", 210 * r, 480 * r, 0.07, 0.3 * k, 0);                            // "bì": bọt nhỏ
  tone2("sine", 110 * r, 280 * r, 0.17, 0.7 * k, 0.09);                         // "bõm": bọt lớn, trầm
  tone2("sine", 330 * r, 720 * r, 0.06, 0.12 * k, 0.21);                        // giọt nước li ti rơi lại
  noiseBurst("lowpass", 800, 160, 0.24, 0.3 * k, 0.5, 0.02);                    // nước xào xạc, mềm, không chói
}
/** Hệ số to nhỏ theo khoảng cách tới người nghe (game tham khảo dùng loa 3D; ở đây chỉ giảm âm lượng). */
const nearK = (d: number) => 2.5 / (1 + d / 8);

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
  /** Nước (từ game tham khảo): xuống/lên nước, quạt nước, lặn, bong bóng, đạn/lựu đạn rơi xuống nước, chết đuối. */
  splash: safe((big: boolean = true, k: number = 1) => splashSnd(big, k)),
  wade: safe((k: number = 1) => wadeSnd(k)),
  dive: safe(() => snd(150, 0.25, "sine", 0.05)),                                        // đầu chìm xuống dưới mặt nước
  bubble: safe(() => tone2("sine", 380 + Math.random() * 260, 980, 0.05, 0.045)),        // bong bóng khí nổi lên khi lặn
  waterShot: safe((dist: number = 0) => { const k = nearK(dist); snd(650, 0.08, "sine", 0.12 * k); snd(260, 0.16, "triangle", 0.1 * k); }),   // đạn chạm mặt nước
  waterBlast: safe((dist: number = 0) => { const k = nearK(dist); splashSnd(true, Math.min(1.6, k)); snd(220, 0.3, "sine", 0.14 * k); snd(120, 0.5, "triangle", 0.12 * k); }),   // lựu đạn nổ dưới nước
  drown: safe(() => snd(110, 0.3, "sawtooth", 0.07)),                                      // hết hơi, bị mất máu
  explode: safe((dist: number = 0) => boom(dist)),
  /** Footstep: v = loudness 0..1 (bots far away are quieter). Soft thud + a little crunch. */
  step: safe((v: number = 1) => { hiss(520 + Math.random() * 220, 0.06, 0.2 * v, "lowpass"); thump(125 + Math.random() * 30, 62, 0.055, 0.2 * v); }),
  /** Emergency siren (body found / meeting called): 4 rising-falling wails. */
  siren: safe(() => {
    const a = A(), o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
    o.type = "sawtooth"; f.type = "lowpass"; f.frequency.value = 2400;
    for (let k = 0; k < 4; k++) { const b = t + k * 0.56; o.frequency.setValueAtTime(600, b); o.frequency.exponentialRampToValueAtTime(1000, b + 0.28); o.frequency.exponentialRampToValueAtTime(600, b + 0.56); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * VOL, t + 0.05); g.gain.setValueAtTime(0.2 * VOL, t + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    o.connect(f); f.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 2.4);
  }),
  /** Murder sting: low thump + two clashing notes (minor second) + a hiss. */
  kill: safe(() => { thump(150, 38, 0.4, 1); hiss(3200, 0.12, 0.5, "highpass"); tone(233, 0.9, 0.14, "sawtooth", 0.04); tone(247, 0.9, 0.14, "sawtooth", 0.04); }),
  coin: safe(() => { tone(1320, 0.09, 0.12, "sine"); tone(1760, 0.22, 0.1, "sine", 0.07); }),
  will: safe(() => { tone(196, 1.3, 0.13, "sine"); tone(294, 1.1, 0.07, "sine", 0.12); }),
  tick: safe(() => tone(980, 0.05, 0.06, "sine")),
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
  breath: safe(() => { hiss(1400, 0.28, 0.14, "bandpass"); hiss(900, 0.3, 0.1, "bandpass", 0.34); }),   // thở gấp
  cut: safe(() => { thump(85, 42, 0.14, 0.4); hiss(2400, 0.07, 0.2, "highpass"); }),                    // cắt cảnh: bụp + vút nhẹ
  thunder: safe((near: boolean) => { hiss(near ? 1100 : 380, near ? 1.5 : 2.6, near ? 1 : 0.7); thump(near ? 70 : 50, 22, near ? 1.3 : 2, near ? 1 : 0.8); if (near) hiss(4500, 0.12, 0.8, "highpass"); }),
  chute: safe(() => { hiss(900, 0.35, 1, "lowpass"); thump(95, 30, 0.5, 1); hiss(3200, 0.12, 0.7, "bandpass", 0.04); }),
  crack: safe(() => { hiss(2800, 0.05, 0.6, "bandpass"); hiss(1800, 0.07, 0.5, "bandpass", 0.08); hiss(3400, 0.04, 0.5, "bandpass", 0.17); }),
  thud: safe(() => { thump(120, 38, 0.3, 1); hiss(260, 0.35, 0.7); }),
  drip: safe(() => thump(1500, 650, 0.06, 0.12)),
  whoosh: safe(() => { hiss(900, 0.28, 0.5, "bandpass"); hiss(2600, 0.18, 0.25, "highpass", 0.03); }),   // camera lia nhanh
  pop: safe(() => { hiss(1500, 0.2, 0.55, "bandpass"); thump(110, 45, 0.28, 0.55); }),                    // dù của đồng đội bung
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

/** Gió trên núi: thân gió ù ù (noise lọc thấp) + tiếng rít (noise băng hẹp Q cao, tần số trôi theo cơn gió), cả hai nhấp nhô theo các cơn gió giật (LFO chậm).
 *  set(level 0..1): 0 = im lặng, 1 = bão sát đỉnh. Tự tạo node ở lần gọi đầu có level > 0. */
let wind: { g1: GainNode; lp: AudioBufferSourceNode | null; f1: BiquadFilterNode; d1: GainNode; g2: GainNode; f2: BiquadFilterNode; d2: GainNode; df: GainNode; srcs: AudioScheduledSourceNode[] } | null = null;
export const windSfx = {
  set: safe((level: number) => {
    if (!wind) {
      if (level < 0.01) return;
      const a = A(), mk = (off: number) => { const s = a.createBufferSource(); s.buffer = noise(a); s.loop = true; s.start(0, off); return s; };
      const n1 = mk(0.1), n2 = mk(0.55), f1 = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g1 = a.createGain(), g2 = a.createGain();
      f1.type = "lowpass"; f1.frequency.value = 300; f2.type = "bandpass"; f2.Q.value = 9; f2.frequency.value = 900; g1.gain.value = 0; g2.gain.value = 0;
      n1.connect(f1); f1.connect(g1); g1.connect(a.destination); n2.connect(f2); f2.connect(g2); g2.connect(a.destination);
      const lfo = (hz: number) => { const o = a.createOscillator(); o.frequency.value = hz; o.start(); return o; };
      const l1 = lfo(0.23), l2 = lfo(0.37), l3 = lfo(0.15), d1 = a.createGain(), d2 = a.createGain(), df = a.createGain();
      l1.connect(d1); d1.connect(g1.gain); l2.connect(d2); d2.connect(g2.gain); l3.connect(df); df.connect(f2.frequency);   // cơn gió giật: nhấp nhô âm lượng + tần số tiếng rít
      wind = { g1, lp: null, f1, d1, g2, f2, d2, df, srcs: [n1, n2, l1, l2, l3] };
    }
    const w = wind, a = A(), t = a.currentTime, L = Math.max(0, Math.min(1, level)), body = 0.55 * Math.pow(L, 1.4) * VOL, whistle = 0.7 * Math.pow(L, 2.2) * VOL;
    w.g1.gain.setTargetAtTime(body, t, 0.35); w.d1.gain.setTargetAtTime(body * 0.45, t, 0.35); w.f1.frequency.setTargetAtTime(260 + 520 * L, t, 0.35);
    w.g2.gain.setTargetAtTime(whistle, t, 0.35); w.d2.gain.setTargetAtTime(whistle * 0.5, t, 0.35); w.f2.frequency.setTargetAtTime(700 + 900 * L, t, 0.35); w.df.gain.setTargetAtTime(160 + 420 * L, t, 0.35);
  }),
  stop: safe(() => { if (!wind) return; const w = wind; wind = null; const t = A().currentTime; w.g1.gain.setTargetAtTime(0, t, 0.2); w.g2.gain.setTargetAtTime(0, t, 0.2); setTimeout(() => { for (const s of w.srcs) { try { s.stop(); } catch { /* đã dừng */ } } }, 900); }),
};

/** Tiếng nền khi lặn: ù ù trầm của nước (noise lọc thấp). set(level 0..1) — 0 = tắt. */
let uwAmb: { g: GainNode; s: AudioBufferSourceNode } | null = null;
export const underSfx = {
  set: safe((level: number) => {
    if (!uwAmb) {
      if (level < 0.01) return;
      const a = A(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noise(a); s.loop = true; f.type = "lowpass"; f.frequency.value = 240; g.gain.value = 0; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
      uwAmb = { g, s };
    }
    uwAmb.g.gain.setTargetAtTime(0.16 * Math.max(0, Math.min(1, level)) * VOL, A().currentTime, 0.12);
  }),
};
