import { t as tr } from "../i18n";

/**
 * Video minh hoạ nhỏ (tự lặp, vẽ bằng canvas 2D — không cần file video) cho từng thẻ trong "Luật chơi".
 * Thẻ n ↔ phân cảnh n:  1 cốt truyện · 2 biệt kích · 3 gián điệp · 4 điều khiển · 5 bắn nhầm · 6 một lượt chơi · 7 mã hoá (blockchain).
 * Kịch bản mỗi cảnh nằm ngay trên hàm vẽ của nó. Chữ trên clip lấy từ i18n (khoá "clip.*"); chỉ chạy khi thẻ đang hiện trên màn hình.
 */
const W = 480, H = 270;
type G = CanvasRenderingContext2D;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const R = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const FONT = 'system-ui,"Segoe UI",Roboto,sans-serif';

const TS = 1.4;   // hệ số phóng chữ trên clip (clip hiển thị ~60% kích thước thật)
const SQ = ["#3f8f4a", "#3a6aa8", "#b0603a", "#8a5ab0", "#b0a63a", "#3a9a8a", "#8a8f9a"];   // màu quân phục: [0] = bạn

/* ───────────── bộ vẽ chung ───────────── */
interface SO { c?: string; s?: number; dir?: number; ph?: number; gun?: boolean; dead?: boolean; sit?: boolean; a?: number; flash?: number; hurt?: number; spy?: boolean; arms?: number; you?: boolean }
/** Lính khối: chân y = 0, mặt hướng +x (dir = -1 lật lại). */
function soldier(g: G, x: number, y: number, o: SO = {}) {
  const s = o.s ?? 1, dir = o.dir ?? 1, c = o.c ?? SQ[1], ph = o.ph ?? 0, l = Math.sin(ph) * 3.2;
  g.save(); g.globalAlpha = o.a ?? 1; g.translate(x, y - (o.dead ? 5 * s : 0)); g.scale(dir * s, s); if (o.dead) g.rotate(Math.PI / 2);
  const body = o.hurt ? "#e84" : c, dk = "#23271c";
  if (o.sit) { R(g, -6, -5, 12, 5, "#2d3326"); R(g, 2, -5, 9, 4, "#2d3326"); R(g, 9, -5, 3, 5, "#161814"); }
  else { R(g, -5 + l * 0.5, -9, 4, 9 - Math.max(0, l), "#2d3326"); R(g, 1 - l * 0.5, -9, 4, 9 - Math.max(0, -l), "#2d3326"); R(g, -5 + l * 0.5, -1.5, 5, 1.5, "#161814"); R(g, 1 - l * 0.5, -1.5, 5, 1.5, "#161814"); }
  const ty = o.sit ? -15 : -20;
  R(g, -6, ty, 12, 11, body); R(g, -6, ty + 9, 12, 2, dk); R(g, -6, ty, 12, 2, "#ffffff22");
  if (o.spy) { R(g, -6, ty - 1, 12, 3, "#c22"); R(g, -7, ty, 2, 8, "#c22"); }
  R(g, -4.5, ty - 9, 9, 9, "#e8b98a"); R(g, 1.5, ty - 6, 2, 2, "#111"); R(g, -6, ty - 11, 12, 5, o.spy ? "#222" : "#4b5a35"); R(g, -6, ty - 7, 4, 2, o.spy ? "#222" : "#4b5a35");
  if (o.spy) R(g, -4.5, ty - 4, 9, 4, "#1a1a1a");
  if (o.you) { g.fillStyle = "#ffd24d"; g.beginPath(); g.moveTo(-3, ty - 19); g.lineTo(3, ty - 19); g.lineTo(0, ty - 14); g.fill(); }
  if (o.gun || (o.arms ?? 0) > 0) {
    R(g, 2, ty + 2, 11, 3.2, body); R(g, 12, ty + 2, 3, 3.2, "#e8b98a");
    if (o.gun) { R(g, 10, ty + 1, 13, 3, "#1b1b1b"); R(g, 8, ty + 3, 4, 5, "#1b1b1b"); if (o.flash) { g.fillStyle = "#ffe36a"; g.beginPath(); g.moveTo(23, ty + 2.5); g.lineTo(33, ty - 1); g.lineTo(30, ty + 2.5); g.lineTo(33, ty + 6); g.fill(); R(g, 23, ty + 1.2, 4, 2.6, "#fff"); } }
  } else { R(g, -8, ty + 1, 3, 9, body); R(g, 5, ty + 1, 3, 9, body); R(g, 5, ty + 9, 3, 2, "#e8b98a"); }
  g.restore();
}
function sky(g: G, a: string, b: string, h = H) { const k = g.createLinearGradient(0, 0, 0, h); k.addColorStop(0, a); k.addColorStop(1, b); g.fillStyle = k; g.fillRect(0, 0, W, h); }
function cloud(g: G, x: number, y: number, s: number, c: string) { g.fillStyle = c; for (const [dx, dy, r] of [[0, 0, 22], [24, 6, 18], [-24, 8, 16], [8, -10, 16]]) { g.beginPath(); g.ellipse(x + dx * s, y + dy * s, r * s * 1.3, r * s * 0.7, 0, 0, 7); g.fill(); } }
function sea(g: G, y: number, t: number, c1 = "#14395a", c2 = "#1d5a86", h = H - y) {
  R(g, 0, y, W, h, c1);
  for (let r = 0; r < Math.ceil(h / 9); r++) for (let k = 0; k < 14; k++) { const x = ((k * 44 + r * 17 + t * (10 + r * 2)) % (W + 40)) - 20; R(g, x, y + 5 + r * 9, 18 + (r % 3) * 6, 2, c2); }
}
function palm(g: G, x: number, y: number, s: number, t: number) {
  const sw = Math.sin(t * 1.4 + x) * 2;
  for (let i = 0; i < 6; i++) R(g, x + i * 0.9 * s + sw * i * 0.12, y - i * 8 * s, 5 * s, 9 * s, i % 2 ? "#6b4a2a" : "#7a5632");
  const tx = x + 5 * s + sw * 0.7, ty = y - 48 * s;
  for (const [dx, dy, w] of [[-26, 2, 26], [-20, -7, 22], [4, 2, 26], [3, -8, 22], [-8, -12, 16]]) R(g, tx + dx * s, ty + dy * s, w * s, 5 * s, "#2f7d3a");
}
function fire(g: G, x: number, y: number, t: number, s = 1) {
  R(g, x - 12 * s, y - 2 * s, 24 * s, 4 * s, "#5a3a1e"); R(g, x - 8 * s, y - 5 * s, 16 * s, 3 * s, "#6b4524");
  for (let i = 0; i < 5; i++) { const f = 10 + 8 * Math.abs(Math.sin(t * 9 + i * 2)); R(g, x - 8 * s + i * 3.5 * s, y - 5 * s - f * s, 4 * s, f * s, i % 2 ? "#ff9a2a" : "#ff6a1a"); }
  R(g, x - 3 * s, y - 14 * s, 6 * s, 8 * s, "#ffe27a");
  g.fillStyle = "rgba(255,150,50,.14)"; g.beginPath(); g.ellipse(x, y - 8 * s, 60 * s, 34 * s, 0, 0, 7); g.fill();
}
function chute(g: G, x: number, y: number, s: number, t: number, c = "#9aa77c") {
  const sw = Math.sin(t * 2 + x) * 3 * s; g.save(); g.translate(x + sw, y); g.scale(s, s);
  g.strokeStyle = "#ccc8"; g.lineWidth = 0.8; for (const k of [-26, -13, 0, 13, 26]) { g.beginPath(); g.moveTo(k, -34); g.lineTo(0, -4); g.stroke(); }
  for (let i = 0; i < 7; i++) { const u = (i / 6) * 2 - 1; R(g, u * 28 - 5, -46 + 12 * u * u, 10, 12, i % 2 ? c : "#82906a"); }
  g.restore();
}
function key(g: G, x: number, y: number, w: number, label: string, down: number, hot = "#ffd24d") {
  const d = down > 0.5 ? 1 : 0, h = 22;
  R(g, x, y + 4, w, h, "#10142e");                              // thân phím (chiều sâu)
  R(g, x, y + d * 3, w, h, down > 0.5 ? hot : "#2b3578"); R(g, x + 2, y + 2 + d * 3, w - 4, h - 6, down > 0.5 ? "#fff3b0" : "#3b479a");
  g.fillStyle = down > 0.5 ? "#222" : "#fff"; g.font = `700 ${label.length > 2 ? 12 : 15}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, x + w / 2, y + h / 2 + d * 3);
}
function txt(g: G, s: string, x: number, y: number, size = 13, color = "#fff", align: CanvasTextAlign = "center", font = FONT, weight = 700, mw?: number) {
  g.font = `${weight} ${size * TS}px ${font}`; g.textAlign = align; g.textBaseline = "middle"; g.lineJoin = "round"; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineWidth = 3; if (mw) { g.strokeText(s, x, y, mw); g.fillStyle = color; g.fillText(s, x, y, mw); } else { g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y); }
}
const emo = (g: G, s: string, x: number, y: number, size = 16) => { g.font = `${size}px ${EMOJI}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.fillText(s, x, y); };
function bubble(g: G, x: number, y: number, s: string, a = 1) {
  g.save(); g.globalAlpha = a; g.font = `700 ${11 * TS}px ${FONT}`; const w = g.measureText(s).width + 14;
  g.fillStyle = "#fff"; g.beginPath(); g.roundRect(x - w / 2, y - 24, w, 24, 7); g.fill(); g.beginPath(); g.moveTo(x - 4, y - 1); g.lineTo(x + 2, y - 1); g.lineTo(x - 2, y + 6); g.fill();
  g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, x, y - 9); g.restore();
}
function chip(g: G, s: string, x: number, y: number, c = "#000a", fg = "#fff") {
  g.font = `700 ${11 * TS}px ${FONT}`; const w = g.measureText(s).width + 20; g.fillStyle = c; g.beginPath(); g.roundRect(x - w / 2, y - 14, w, 28, 14); g.fill(); g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, x, y + 0.5);
}
function flash(g: G, k: number, c = "255,255,255") { if (k > 0.01) { g.fillStyle = `rgba(${c},${clamp(k)})`; g.fillRect(0, 0, W, H); } }
function rain(g: G, t: number, n = 60, a = 0.35) { g.strokeStyle = `rgba(190,210,255,${a})`; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < n; i++) { const x = (hash(i) * (W + 80) - t * 90 * (0.8 + hash(i + 9) * 0.4) * 0.35 + 800) % (W + 80), y = ((hash(i + 3) * H + t * 520 * (0.7 + hash(i + 7) * 0.5)) % (H + 20)) - 10; g.moveTo(x, y); g.lineTo(x - 5, y + 14); } g.stroke(); }
function tree(g: G, x: number, y: number, s: number, dark = 0) {
  R(g, x - 4 * s, y - 60 * s, 8 * s, 60 * s, `rgb(${58 - dark},${40 - dark},${26 - dark})`);
  for (const [dx, dy, w, h] of [[-22, -88, 44, 22], [-30, -70, 60, 20], [-16, -104, 32, 20]]) R(g, x + dx * s, y + dy * s, w * s, h * s, `rgb(${30 - dark},${84 - dark * 2},${42 - dark})`);
}
function keyHint(g: G, x: number, y: number, label: string, t: number) { const p = 0.5 + 0.5 * Math.sin(t * 9); R(g, x - 11, y - 11, 22, 22, `rgba(255,210,77,${0.35 + 0.4 * p})`); R(g, x - 9, y - 9, 18, 16, "#2b3578"); R(g, x - 9, y + 7, 18, 2, "#10142e"); txt(g, label, x, y - 1, 12, "#fff"); }

/* ───────────── 1 · Cốt truyện: bão · đảo · máy bay nổ · 6 đồng đội nhảy dù · 1 kẻ phản bội nhấp nháy đỏ (10 s) ───────────── */
function s1(g: G, t: number) {
  sky(g, "#070b18", "#2a3552"); const fl = Math.max(0, 1 - ((t - 1.0 + 10) % 10) * 4, 1 - ((t - 2.2 + 10) % 10) * 5, 1 - ((t - 6.6 + 10) % 10) * 4);
  for (let i = 0; i < 6; i++) cloud(g, ((i * 130 + t * 14) % (W + 160)) - 80, 40 + (i % 3) * 30, 1.5, "#1a2038");
  g.fillStyle = "#0a0e1a"; g.beginPath(); g.moveTo(120, 205); g.lineTo(170, 168); g.lineTo(240, 160); g.lineTo(320, 172); g.lineTo(370, 205); g.fill();
  palm(g, 215, 172, 0.55, t); palm(g, 275, 175, 0.5, t + 1);
  sea(g, 205, t * 1.8, "#0d2036", "#1a3a5c");
  if (t > 1.2 && t < 4) {                                                            // máy bay bị trúng đạn, nổ từ xa
    const k = seg(t, 1.2, 2.5), px = lerp(470, 380, k), py = lerp(60, 85, k * k); const boom = seg(t, 2.5, 3.6);
    if (t < 2.5) { R(g, px - 18, py, 36, 7, "#9aa"); R(g, px - 6, py - 8, 8, 18, "#889"); for (let i = 0; i < 14; i++) R(g, px + 18 + i * 6, py + 2 - i * 0.2, 6, 5, `rgba(60,60,60,${0.7 - i * 0.05})`); }
    else { g.fillStyle = `rgba(255,${180 - boom * 100},40,${1 - boom})`; g.beginPath(); g.arc(px, py, 10 + boom * 56, 0, 7); g.fill(); for (let i = 0; i < 10; i++) R(g, px + Math.cos(i * 0.9) * boom * 80, py + Math.sin(i * 0.9) * boom * 60 + boom * boom * 60, 5, 5, "#555"); }
    flash(g, t > 2.45 && t < 2.8 ? 0.55 * (1 - (t - 2.45) / 0.35) : 0, "255,200,120");
  }
  const pos = [[240, 0], [90, 24], [170, -10], [330, 14], [400, 36], [40, -18], [455, 6]], tp = seg(t, 3.2, 9.5);   // 7 người: [0] là bạn (to nhất, ở giữa)
  if (t > 3.1) pos.forEach(([px, off], i) => { const yy = lerp(-30, 124 + off + (i ? i % 2 * 10 : 20), ease(Math.min(1, tp * 1.05))); const s = i ? 0.78 : 1.05; chute(g, px, yy, s, t, i ? "#8f9c74" : "#a9bd7a"); soldier(g, px + Math.sin(t * 2 + px) * 3 * s, yy + 38 * s, { c: SQ[i], s: s * 0.95, you: i === 0, arms: 0 }); });
  rain(g, t, 80); flash(g, fl * 0.8, "200,220,255");
  const mode = seg(t, 4.2, 4.6);                                                      // bảng 7 người: 1 biểu tượng đỏ nhấp nháy ngẫu nhiên → chốt vào 1 kẻ phản bội
  if (mode > 0) {
    g.globalAlpha = mode; const bx = W / 2 - 7 * 17; R(g, bx - 8, 8, 7 * 34 + 16, 36, "#000b");
    const spy = 4, run = t < 8.2 ? Math.floor(t * 8) : -1, act = run >= 0 ? Math.floor(hash(run) * 7) : spy;
    for (let i = 0; i < 7; i++) { const on = i === act, x = bx + i * 34 + 3, p = 0.55 + 0.45 * Math.sin(t * 22); R(g, x, 13, 28, 26, on ? `rgba(255,40,40,${on && run < 0 ? 0.55 + 0.4 * Math.sin(t * 10) : p})` : "#1e3a2a"); R(g, x + 9, 19, 10, 10, on ? "#fdd" : "#9fe3b4"); R(g, x + 6, 16, 16, 4, on ? "#a22" : "#4b5a35"); if (on && run < 0) emo(g, "🕵", x + 14, 28, 11); }
    g.globalAlpha = 1; chip(g, t < 8.2 ? "ALPHA · 7" : tr("clip.1.spy"), W / 2, 60, t < 8.2 ? "#000a" : "#a11d", "#fff");
  }
  void mode;
}

/* ───────────── 2 · Biệt kích: làm nhiệm vụ (E + thanh tiến độ) → thấy xác → chạy về đống lửa → họp & bỏ phiếu (14 s) ───────────── */
function s2(g: G, t: number) {
  const meet = seg(t, 7.3, 8.2); sky(g, "#2a3b66", "#c98a5a", 130); sea(g, 112, t, "#2c5a86", "#3f7aa8", 40); R(g, 0, 150, W, H - 150, "#d9c28a"); for (let i = 0; i < 30; i++) R(g, hash(i) * W, 156 + hash(i + 4) * 110, 3, 2, "#c4ab74");
  palm(g, 36, 160, 1, t); palm(g, 440, 158, 1.1, t + 2);
  const fx = 300, fy = 214; fire(g, fx, fy, t); const sx = 112, sy = 206;
  const done = t > 3.7; R(g, sx - 15, sy - 22, 30, 22, done ? "#3a5a3a" : "#ff9a1a"); R(g, sx - 15, sy - 22, 30, 4, done ? "#4f8a4f" : "#ffd24d"); if (!done && Math.sin(t * 8) > 0) { g.strokeStyle = "#ffb43a"; g.lineWidth = 2; g.strokeRect(sx - 19, sy - 26, 38, 30); } emo(g, done ? "✅" : "📻", sx, sy - 10, 16);
  const body = { x: 222, y: 238 }; if (t > 3.5) soldier(g, body.x, body.y, { c: SQ[3], dead: true, dir: 1 }); if (t > 3.5) { g.fillStyle = "rgba(160,20,20,.55)"; g.beginPath(); g.ellipse(body.x + 10, body.y - 1, 18, 4, 0, 0, 7); g.fill(); }
  // bạn: chạy tới trạm → E → thanh tiến độ → chạy tới xác → chạy về đống lửa → ngồi
  let hx = 20, ph = 0, sit = false;
  if (t < 1.1) { hx = lerp(20, sx - 28, ease(t / 1.1)); ph = t * 14; } else if (t < 3.7) hx = sx - 28; else if (t < 5.0) { hx = lerp(sx - 28, 196, ease(seg(t, 3.7, 5.0))); ph = t * 14; } else if (t < 5.9) hx = 196; else if (t < 7.3) { hx = lerp(196, fx - 38, ease(seg(t, 5.9, 7.3))); ph = t * 16; } else { hx = fx - 38; sit = t > 7.7; }
  const hy = t >= 5.9 && t < 7.3 ? lerp(238, fy + 8, ease(seg(t, 5.9, 7.3))) : t >= 7.3 ? fy + 8 : t > 3.7 && t < 5.0 ? lerp(sy + 2, 238, seg(t, 3.7, 5.0)) : t >= 5.0 && t < 5.9 ? 238 : sy + 2;
  const seat = (i: number) => { const a = Math.PI * (0.15 + 0.85 * i / 5) + 3.4 * 0; return [fx + Math.cos(a * 1.0 + Math.PI * 0.1) * 70 * (i < 3 ? -1 : 1) * 0 + (i < 3 ? 26 + i * 22 : 26 + (i - 3) * 22) * 1, 0]; };
  void seat;
  const ring = [[262, 232], [300, 238], [342, 232], [372, 214], [352, 192], [250, 194]];                      // chỗ ngồi quanh lửa (6 bot)
  ring.forEach(([rx, ry], i) => {
    const t0 = 8.0 + i * 0.32, k = seg(t, t0, t0 + 1.7), from = i % 2 ? W + 20 : -20, bx = lerp(from, rx, ease(k)), by = lerp(i % 2 ? 214 : 226, ry, ease(k));
    if (t > 7.4) soldier(g, bx, by, { c: SQ[i + 1], ph: k < 1 ? t * 15 : 0, sit: k >= 1, dir: bx < fx ? 1 : -1, s: 0.95 });
    else if (t < 7.4) soldier(g, 30 + i * 70, 176 + (i % 2) * 6, { c: SQ[i + 1], s: 0.7, ph: t * 8 + i, dir: i % 2 ? -1 : 1, a: 0.0 });
  });
  soldier(g, hx, hy, { c: SQ[0], ph, sit, you: true, dir: t > 5.9 || t < 3.7 || t >= 5.0 ? 1 : 1, arms: t > 1.0 && t < 3.7 ? 1 : 0 });
  if (t > 0.9 && t < 3.7) { keyHint(g, hx + 4, hy - 56, "E", t); const k = seg(t, 1.4, 3.6); R(g, hx - 22, hy - 78, 48, 8, "#000a"); R(g, hx - 21, hy - 77, 46 * k, 6, "#5f9"); chip(g, tr("clip.2.task"), hx + 2, hy - 92); }
  if (t > 3.7 && t < 4.4) txt(g, "✔", sx, sy - 40 - (t - 3.7) * 20, 22, "#5f9");
  if (t > 5.0 && t < 5.9) { bubble(g, hx, hy - 52, "!?"); chip(g, "💀 " + tr("clip.2.body"), body.x, body.y - 26, "#a11d"); }
  if (t > 6.5 && t < 7.7) keyHint(g, fx - 38, fy - 62, "E", t);
  if (meet > 0 && t < 11) { const f = Math.sin(t * 12) > 0; flash(g, 0.12 * meet * (f ? 1 : 0.3), f ? "255,40,40" : "40,80,255"); chip(g, "🚨 " + tr("clip.2.meet"), W / 2, 30, "#c11e", "#fff"); }
  if (t > 10.4) {                                                                  // chat + biểu tượng bỏ phiếu trên đầu
    const k = seg(t, 10.4, 11), lines = ["…?!", "🔍", "😠", "👉", "🗳", "…"]; chip(g, "💬 " + tr("clip.2.vote"), W / 2, 30, "#124a8cee", "#fff");
    ring.forEach(([rx, ry], i) => { if (Math.sin(t * 3 + i * 2) > -0.2) bubble(g, rx, ry - 34, lines[(Math.floor(t * 1.4) + i) % 6], k); if (t > 11.6 + i * 0.25) emo(g, "👆", rx + (i < 3 ? 12 : -12), ry - 54 + Math.sin(t * 6 + i) * 2, 14); });
    const sus = ring[4]; g.strokeStyle = `rgba(255,70,70,${0.5 + 0.5 * Math.sin(t * 9)})`; g.lineWidth = 2; g.beginPath(); g.ellipse(sus[0], sus[1] - 14, 18, 26, 0, 0, 7); g.stroke(); if (t > 12.8) chip(g, "⏏ 4/7", sus[0], sus[1] - 70, "#a11d");
  }
}

/* ───────────── 3 · Gián điệp: rình sau lưng kẻ đi lẻ → Q ám sát → chui hang bí mật, trồi lên hang khác (ngoại phạm) (12 s) ───────────── */
function s3(g: G, t: number) {
  sky(g, "#050912", "#0f2236"); for (let i = 0; i < 24; i++) R(g, hash(i) * W, hash(i + 2) * 90, 2, 2, "#cfe");
  for (let i = 0; i < 9; i++) tree(g, ((i * 70 - t * 3) % (W + 80) + W + 80) % (W + 80) - 20, 160, 0.7, 14); R(g, 0, 160, W, H - 160, "#0d1f12");
  for (let i = 0; i < 9; i++) tree(g, i * 62 + 10, 228, 1, 0); R(g, 0, 226, W, H - 226, "#16301c"); for (let i = 0; i < 40; i++) R(g, hash(i) * W, 230 + hash(i + 1) * 40, 3, 2, "#244a2c");
  const pitA = { x: 400, y: 238 }, pitB = { x: 74, y: 238 }, dark = t > 6.9 && t < 7.9 ? 1 - Math.abs((t - 7.4) / 0.5) : 0;
  const pit = (p: { x: number; y: number }) => { g.fillStyle = "rgba(40,160,255,.22)"; g.beginPath(); g.ellipse(p.x, p.y - 4, 44, 14, 0, 0, 7); g.fill(); g.fillStyle = "#031e33"; g.beginPath(); g.ellipse(p.x, p.y, 20, 7, 0, 0, 7); g.fill(); g.strokeStyle = `rgba(110,210,255,${0.6 + 0.3 * Math.sin(t * 5)})`; g.lineWidth = 2; g.stroke(); for (let i = 0; i < 6; i++) R(g, p.x - 14 + hash(i) * 28, p.y - 6 - ((t * 20 + i * 11) % 30), 2, 2, "#8ff"); };
  pit(pitA); pit(pitB);
  // nạn nhân đi lẻ (đèn pin) · gián điệp rình phía sau, bám theo
  const vx = t < 4.2 ? lerp(120, 250, t / 4.2) : 250, sp = t < 4.0 ? lerp(-10, 214, ease(seg(t, 0, 4.0))) : t < 4.6 ? lerp(214, 236, seg(t, 4.0, 4.6)) : t < 6.6 ? lerp(236, pitA.x - 6, ease(seg(t, 4.6, 6.6))) : t < 7.4 ? pitA.x - 6 : t < 9.2 ? pitB.x + 4 + 0 : lerp(pitB.x + 4, 150, ease(seg(t, 9.2, 10.4)));
  const vict = (t < 4.5 ? { dead: false } : { dead: true });
  if (!vict.dead) { g.fillStyle = "rgba(255,240,170,.16)"; g.beginPath(); g.moveTo(vx + 10, 206); g.lineTo(vx + 90, 186); g.lineTo(vx + 90, 238); g.fill(); }
  soldier(g, vx, 236, { c: SQ[2], ph: t < 4.2 ? t * 7 : 0, dead: vict.dead, dir: 1 }); if (vict.dead) { g.fillStyle = "rgba(160,20,20,.6)"; g.beginPath(); g.ellipse(vx + 8, 236, 20, 4, 0, 0, 7); g.fill(); }
  const showSpy = t < 6.95 || t > 7.7, hide = t > 6.5 && t < 7.0 ? 1 - seg(t, 6.5, 7.0) : 1, ey = t > 7.7 ? lerp(8, 0, seg(t, 7.7, 8.3)) : 0;
  if (showSpy) {
    const lunge = t > 3.95 && t < 4.5 ? 1 : 0;
    g.save(); g.beginPath(); g.rect(0, 0, W, t > 6.5 && t < 7.0 ? 236 + 14 * (1 - hide) : t > 7.7 && t < 8.4 ? 236 + ey : H); g.clip();
    soldier(g, sp, 236 + (t > 6.5 && t < 7.0 ? (1 - hide) * 26 : t > 7.7 ? ey * 3 : 0), { c: "#4a1a24", spy: true, ph: (t < 4.0 || (t > 4.6 && t < 6.6) || t > 9.2) ? t * (t > 4.6 && t < 6.6 ? 16 : 7) : 0, gun: false, arms: lunge, s: t < 3.9 ? 0.96 : 1 });
    g.restore();
  }
  if (t > 2.6 && t < 4.0) { keyHint(g, sp + 2, 178, "Q", t); chip(g, "🕵 " + tr("clip.3.stab"), sp + 2, 156, "#a11d"); }
  if (t > 3.95 && t < 4.3) { g.strokeStyle = `rgba(255,255,255,${1 - (t - 3.95) / 0.35})`; g.lineWidth = 4; g.beginPath(); g.arc(vx, 215, 22, -1, 0.9); g.stroke(); flash(g, 0.4 * (1 - (t - 3.95) / 0.35), "255,60,60"); }
  if (t > 4.4 && t < 5.2) txt(g, "☠", vx, 190 - (t - 4.4) * 14, 20, "#f55");
  if (t > 5.8 && t < 6.9) { keyHint(g, pitA.x, 198, "E", t); chip(g, "🕳 " + tr("clip.3.burrow"), pitA.x, 172, "#0a5a8cee"); }
  // bản đồ nhỏ: 2 hang nối nhau, chấm gián điệp chạy giữa chúng
  if (t > 5.8) { R(g, 372, 10, 98, 52, "#000b"); g.strokeStyle = "#35b"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(386, 40); g.lineTo(456, 26); g.stroke(); g.setLineDash([]); R(g, 383, 37, 6, 6, "#4cf"); R(g, 453, 23, 6, 6, "#4cf"); const m = seg(t, 6.9, 7.6); R(g, lerp(456, 386, m) - 3, lerp(26, 40, m) - 3, 6, 6, "#f44"); R(g, 410, 52, 5, 5, "#a33"); }
  flash(g, 0, ""); if (dark > 0) { g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, 0, W, H); }
  if (t > 10.4) { chip(g, "✔ " + tr("clip.3.alibi"), 150, 160, "#1a7a3aee", "#fff"); soldier(g, 120, 236, { c: SQ[5], dir: 1, s: 0.96 }); soldier(g, 186, 236, { c: SQ[6], dir: -1, s: 0.96 }); }
}

/* ───────────── 5 · Bắn nhầm đồng đội: các góc bắn (súng ngắn · ống ngắm · lựu đạn) rồi bắn nhầm → bị trả đũa → ván kết thúc (14 s) ───────────── */
function s5(g: G, t: number) {
  if (t < 6.6) {
    const cut = Math.floor(t / 2.2), u = t - cut * 2.2;
    sky(g, "#2b3b63", "#b98a60", 150); R(g, 0, 150, W, H - 150, "#c8b27c");
    if (cut === 0) {                                                                // súng ngắn
      palm(g, 410, 170, 1.1, t); R(g, 380, 190, 14, 30, "#a33"); R(g, 380, 188, 14, 4, "#fff");
      soldier(g, 90, 232, { c: SQ[0], gun: true, flash: u % 0.7 < 0.1 ? 1 : 0, s: 1.7, dir: 1 }); if (u > 0.5) { const tt = (u - 0.1) % 0.7; if (tt < 0.12) R(g, 160 + tt * 2000, 195, 40, 2, "#fff8"); }
      chip(g, "🔫 " + tr("clip.5.pistol"), 90, 40);
    } else if (cut === 1) {                                                         // ống ngắm
      sea(g, 128, t, "#27507a", "#3a7aaa", 40); palm(g, 90, 160, 0.7, t); const k = ease(seg(u, 0, 1.2)), recoil = u > 1.5 && u < 1.7 ? (1.7 - u) * 40 : 0;
      g.save(); g.translate(W / 2, H / 2 + recoil * -1); g.scale(1.9, 1.9); g.translate(-W / 2, -H / 2 - 20); soldier(g, lerp(150, 238, k) + Math.sin(t * 6) * 0.8, 206, { c: SQ[3], ph: t * 6, s: 1, dir: 1 }); g.restore();
      g.fillStyle = "#000"; g.beginPath(); g.rect(0, 0, W, H); g.moveTo(W / 2 + 112, H / 2); g.arc(W / 2, H / 2, 112, 0, 7); g.fill("evenodd"); g.strokeStyle = "#111"; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, 112, 0, 7); g.stroke();
      g.strokeStyle = "#111"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - 112, H / 2); g.lineTo(W / 2 + 112, H / 2); g.moveTo(W / 2, H / 2 - 112); g.lineTo(W / 2, H / 2 + 112); g.stroke(); g.strokeStyle = "#f33"; g.beginPath(); g.arc(W / 2, H / 2, 9, 0, 7); g.stroke(); if (u > 1.5 && u < 1.8) flash(g, 0.35);
      chip(g, "🎯 " + tr("clip.5.scope"), W / 2, 34);
    } else {                                                                        // lựu đạn: giữ chuột giật chốt → ném → nổ
      soldier(g, 84, 232, { c: SQ[0], arms: 1, s: 1.7, dir: 1 }); const hold = seg(u, 0, 0.9), th = seg(u, 0.9, 1.6);
      if (u < 0.9) { R(g, 40, 70, 96, 10, "#000a"); R(g, 41, 71, 94 * hold, 8, "#ffd24d"); chip(g, "💣 " + tr("clip.5.nade"), 88, 52); }
      if (u > 0.9 && u < 1.7) { const gx = lerp(110, 340, th), gy = 160 - Math.sin(th * Math.PI) * 90 + th * 40; R(g, gx - 4, gy - 4, 8, 8, "#3a4a2a"); R(g, gx - 1, gy - 6, 2, 2, "#ccc"); }
      if (u >= 1.7) { const e = seg(u, 1.7, 2.2); g.fillStyle = `rgba(255,${200 - e * 120},40,${1 - e})`; g.beginPath(); g.arc(340, 214, 14 + e * 60, 0, 7); g.fill(); flash(g, 0.5 * (1 - e), "255,180,80"); }
    }
    if (u < 0.1) flash(g, 0.6 - u * 6); g.fillStyle = "#000"; g.fillRect(0, 0, W, 16); g.fillRect(0, H - 16, W, 16);
    return;
  }
  const v = t - 6.6; sky(g, "#2b3b63", "#c98a5a", 140); sea(g, 120, t, "#2c5a86", "#3f7aa8", 30); R(g, 0, 140, W, H - 140, "#d9c28a"); palm(g, 430, 160, 1.1, t); palm(g, 40, 160, 1, t);
  const shake = v > 2.4 && v < 3.4 ? (Math.random() - 0.5) * 8 : 0; g.save(); g.translate(shake, shake * 0.6);
  const hurtT = v > 1.0 && v < 1.35, youDown = v > 3.0;
  soldier(g, 120, 226, { c: SQ[0], gun: !youDown, flash: v > 0.6 && v < 0.75 ? 1 : 0, dead: youDown, you: true, s: 1.3 });
  soldier(g, 300, 226, { c: SQ[2], dir: v > 1.6 ? -1 : 1, gun: v > 2.2, flash: v > 2.4 && v < 2.55 ? 1 : (v > 2.7 && v < 2.8 ? 1 : 0), hurt: hurtT ? 1 : 0, s: 1.3, ph: v < 0.6 ? t * 7 : 0 });
  if (v > 0.6 && v < 0.9) R(g, 160, 205, 126, 2, "#fff9"); if (v > 2.4 && v < 2.6) R(g, 135, 207, 140, 2, "#fff9");
  g.restore();
  if (v > 1.6 && v < 3.0) bubble(g, 300, 160, tr("clip.5.ouch"));
  if (v > 3.6) { const k = Math.min(1, (v - 3.6) * 3), bl = Math.sin(v * 14) > -0.3 ? 1 : 0.6; g.fillStyle = `rgba(170,10,10,${0.25 * k})`; g.fillRect(0, 0, W, H); g.fillStyle = `rgba(0,0,0,${0.6 * k})`; g.fillRect(0, 90, W, 90);
    txt(g, "⚠ " + tr("clip.5.banner"), W / 2, 118, 17, `rgba(255,${80 * bl},${70 * bl},${k})`); txt(g, tr("clip.5.over"), W / 2, 150, 13, "#fff"); }
}

/* ───────────── 4 · Điều khiển: phím sáng lên 3D, lính làm theo: đi · nhảy · lăn · đổi góc nhìn · bơi · bấm Kiểm tra nhiệm vụ (12 s) ───────────── */
function s4(g: G, t: number) {
  sky(g, "#0a1026", "#1a2a55"); for (let i = 0; i < 40; i++) R(g, hash(i) * W, hash(i + 5) * H, 2, 2, "#fff3");
  // bàn phím (trái)
  const down = (a: number, b: number) => (t >= a && t < b ? 1 : 0), kx = 14, ky = 88;
  key(g, kx + 36, ky, 30, "W", down(0.3, 1.8) || down(5.8, 8.6)); key(g, kx, ky + 30, 30, "A", down(1.0, 1.4)); key(g, kx + 36, ky + 30, 30, "S", 0); key(g, kx + 72, ky + 30, 30, "D", down(0.3, 1.8) * 1 || down(6.0, 8.6));
  key(g, kx, ky + 66, 102, "SPACE", down(2.4, 2.8)); key(g, kx, ky + 102, 48, "SHIFT", down(3.6, 4.0 + 0.2)); key(g, kx + 54, ky + 102, 30, "V", down(4.8, 5.1)); key(g, kx + 90, ky + 102, 30, "E", down(5.2, 5.5));
  emo(g, "🚶", kx + 118, ky + 12, 14); emo(g, "🦘", kx + 112, ky + 79, 14); emo(g, "🌀", kx + 128, ky + 113, 14); emo(g, "👁", kx + 56, ky + 138, 13);
  // màn hình game mini (phải)
  const vx = 168, vy = 18, vw = 296, vh = 222; g.save(); g.beginPath(); g.roundRect(vx, vy, vw, vh, 10); g.clip(); g.translate(vx, vy);
  const fpp = t > 5.1 && t < 7.0; sky(g, "#2a3b66", "#c98a5a", 100); sea(g, 86, t, "#2c5a86", "#3f7aa8", 120); R(g, 0, 110, vw * 0.62, vh - 110, "#d9c28a"); const shore = vw * 0.62; R(g, shore, 100, vw - shore, vh - 100, "#2c5a86"); for (let i = 0; i < 10; i++) R(g, shore + ((i * 31 + t * 18) % (vw - shore)), 118 + (i % 4) * 22, 22, 2, "#6aa8d4");
  R(g, 190 - 0, 80, 0, 0, "#000"); palm(g, 36, 130, 0.9, t); R(g, 150, 150, 26, 20, "#ff9a1a"); emo(g, "📻", 163, 160, 12);
  let px = 20, py = 168, ph = 0, jump = 0, roll = 0, swim = 0;
  if (t < 1.8) { px = lerp(20, 100, t / 1.8); ph = t * 12; } else if (t < 5.8) { px = lerp(100, 140, seg(t, 1.8, 5.8)); } else if (t < 8.6) { px = lerp(140, 262, seg(t, 5.8, 8.6)); ph = t * 16; } else px = 262;
  if (t > 2.4 && t < 3.2) jump = Math.sin(seg(t, 2.4, 3.2) * Math.PI) * 30; if (t > 3.6 && t < 4.4) { roll = seg(t, 3.6, 4.4); px += roll * 30; }
  swim = t > 7.3 ? seg(t, 7.3, 7.9) : 0;
  const shown = fpp ? 0 : 1;
  if (shown) { if (swim > 0.3) { R(g, px - 10, py - 4 + Math.sin(t * 6) * 1.5, 20, 6, "#e8b98a"); R(g, px - 8, py - 10, 8, 7, "#4b5a35"); g.strokeStyle = "#cdf"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(px, py + 2, 18 + Math.sin(t * 5) * 3, 5, 0, 0, 7); g.stroke(); } else { g.save(); if (roll) { g.translate(px, py - 10 - jump); g.rotate(roll * Math.PI * 2); g.translate(-px, -(py - 10 - jump)); } soldier(g, px, py - jump, { c: SQ[0], ph, s: 1.5, you: true }); g.restore(); } }
  else { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(0, 0, vw, 14); g.strokeStyle = "#fff9"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(vw / 2 - 10, vh / 2); g.lineTo(vw / 2 + 10, vh / 2); g.moveTo(vw / 2, vh / 2 - 10); g.lineTo(vw / 2, vh / 2 + 10); g.stroke(); chip(g, "👁 1st", vw / 2, 30); R(g, vw - 70, vh - 52, 56, 12, "#222"); R(g, vw - 130, vh - 44, 70, 8, "#1b1b1b"); }
  if (t > 5.1 && t < 5.5) { g.fillStyle = `rgba(255,255,255,${0.5 * (1 - (t - 5.1) / 0.4)})`; g.fillRect(0, 0, vw, vh); }
  if (t > 5.2 && t < 5.9) keyHint(g, 163, 130, "E", t);
  const btnPulse = t > 9 ? 0.5 + 0.5 * Math.sin(t * 8) : 0; g.fillStyle = `rgba(255,210,77,${0.25 + 0.35 * btnPulse})`; g.beginPath(); g.roundRect(vw - 148, vh - 36, 138, 26, 8); g.fill(); g.fillStyle = "#1d2350"; g.beginPath(); g.roundRect(vw - 146, vh - 34, 134, 22, 7); g.fill(); txt(g, tr("clip.4.check"), vw - 79, vh - 23, 10.5, "#fff");
  if (t > 9.0) { const cx = lerp(vw - 40, vw - 80, seg(t, 9, 9.8)), cy = lerp(vh - 80, vh - 22, seg(t, 9, 9.8)); g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + 16); g.lineTo(cx + 4.5, cy + 12); g.lineTo(cx + 9, cy + 19); g.lineTo(cx + 12, cy + 17); g.lineTo(cx + 7.5, cy + 10.5); g.lineTo(cx + 13, cy + 10); g.closePath(); g.fill(); g.stroke(); }
  if (t > 10.1) { const k = seg(t, 10.1, 10.6); g.fillStyle = `rgba(0,0,0,${0.55 * k})`; g.fillRect(0, 0, vw, vh); for (let i = 0; i < 18; i++) { const a = i * 0.7 + t, r = 30 + k * 90; R(g, vw / 2 + Math.cos(a) * r, vh / 2 + Math.sin(a) * r * 0.6, 5, 5, ["#ffd24d", "#5f9", "#6af", "#f66"][i % 4]); } txt(g, "🏆 " + tr("clip.4.win"), vw / 2, vh / 2, 22 * k, "#ffd24d"); }
  g.restore(); g.strokeStyle = "#34407a"; g.lineWidth = 2; g.beginPath(); g.roundRect(vx, vy, vw, vh, 10); g.stroke();
}

/* ───────────── 6 · Một lượt chơi: vòng lặp 4 bước, quân bài chạy quanh (12 s) ───────────── */
function s6(g: G, t: number) {
  sky(g, "#0a1026", "#17224a"); const cx = W / 2, cy = 138, rx = 150, ry = 78;
  const nodes = [["🚶", tr("clip.6.a"), "#3b8f55"], ["💀", tr("clip.6.b"), "#b03a3a"], ["🗳", tr("clip.6.c"), "#3a6ab0"], ["⏏", tr("clip.6.d"), "#b0873a"]] as const;
  const lap = t / 5.0, prog = lap % 1, cur = Math.floor(prog * 4), pos = (u: number) => [cx + Math.cos(u * Math.PI * 2 - Math.PI / 2) * rx, cy + Math.sin(u * Math.PI * 2 - Math.PI / 2) * ry] as const;
  g.strokeStyle = "#34407a"; g.lineWidth = 3; g.setLineDash([6, 6]); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < 4; i++) { const [x, y] = pos((i + 0.5) / 4); const a = ((i + 0.5) / 4) * Math.PI * 2; g.fillStyle = "#7f8fe0"; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.fill(); g.restore(); }
  nodes.forEach(([e, label, col], i) => { const [x, y] = pos(i / 4), on = i === cur; g.fillStyle = on ? col : "#141b44"; g.strokeStyle = on ? "#fff" : col; g.lineWidth = on ? 3 : 2; g.beginPath(); g.roundRect(x - 58, y - 22, 116, 44, 12); g.fill(); g.stroke(); emo(g, e, x - 38, y, 20); g.font = `700 ${12.5}px ${FONT}`; g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(label, x - 22, y, 78); });
  const [tx, ty] = pos(prog); soldier(g, tx, ty + 18, { c: SQ[0], s: 0.9, ph: t * 10, you: true });
  txt(g, "🔁 " + tr("clip.6.round", Math.floor(lap) + 1), cx, cy - 4, 15, "#ffd24d");
  if (Math.floor(lap) >= 1 && t % 5 > 3.6) { chip(g, "🏁 " + tr("clip.6.check"), cx, cy + 22, "#1a7a3aee"); }
  if (t > 10.2) { const k = Math.sin(t * 10) > 0; chip(g, "🎖 " + tr("clip.6.win"), cx, 30, k ? "#1a7a3aee" : "#0d4a22ee"); }
}

/* ───────────── 7 · Mã hoá: vai trò là mật mã (FHE) trên chuỗi → hết ván mới công khai (9 s) ───────────── */
function s7(g: G, t: number) {
  sky(g, "#02060a", "#041a10"); for (let c = 0; c < 28; c++) for (let r = 0; r < 12; r++) { const y = ((r * 24 + t * (40 + hash(c) * 60) + hash(c * 3) * 270) % 300) - 20; g.fillStyle = `rgba(60,255,140,${0.05 + 0.18 * hash(c + r)})`; g.font = `10px ui-monospace,monospace`; g.textAlign = "center"; g.fillText("0123456789abcdef"[Math.floor(hash(c * 7 + r + Math.floor(t * 6)) * 16)], c * 17 + 8, y); }
  const spy = 3, rev = ease(seg(t, 5.6, 6.6)), scan = seg(t, 5.0, 6.4);
  for (let i = 0; i < 7; i++) {
    const x = 20 + i * 62, y = 92, flip = clamp(rev * 1.6 - i * 0.1 + (i ? 0 : 0.1) * 0), ww = Math.abs(Math.cos(flip * Math.PI)) * 54, face = flip > 0.5;
    g.save(); g.translate(x + 27, y + 46); g.beginPath(); g.roundRect(-ww / 2, -46, ww, 92, 8); g.fillStyle = face ? (i === spy ? "#5a1414" : "#124a28") : "#07130d"; g.fill(); g.strokeStyle = face ? (i === spy ? "#f55" : "#5f9") : "#2f9a5a"; g.lineWidth = 2; g.stroke();
    if (ww > 20) { g.save(); g.beginPath(); g.rect(-ww / 2 + 2, -44, ww - 4, 88); g.clip(); if (face) { emo(g, i === spy ? "🕵" : "🎖", 0, -6, 24); txt(g, i === spy ? tr("clip.7.spy") : tr("clip.7.crew"), 0, 24, 7, i === spy ? "#f88" : "#8fb", "center", FONT, 700, 50); } else { for (let r = 0; r < 5; r++) { let s = ""; for (let k = 0; k < 5; k++) s += "0123456789abcdef"[Math.floor(hash(i * 31 + r * 7 + k + Math.floor(t * 9)) * 16)]; g.font = "10px ui-monospace,monospace"; g.fillStyle = "#5f9"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, 0, -34 + r * 11); } emo(g, "🔒", 0, 30, 14); } g.restore(); }
    g.restore();
  }
  if (scan > 0 && scan < 1) { R(g, 20 + scan * 430, 80, 3, 118, "#9fffd0"); g.fillStyle = "rgba(100,255,180,.12)"; g.fillRect(20, 80, scan * 430, 118); }
  const head = t < 5 ? tr("clip.7.enc") : tr("clip.7.rev"); chip(g, "🔐 FHE · " + head, W / 2, 50, "#062a18ee", "#7fffb4"); chip(g, t < 5 ? "⛓ Sepolia · Zama" : "✔ KMS", W / 2, 232, "#000a", "#9fe3b4");
}

const SCENES: Record<number, { d: number; f: (g: G, t: number) => void }> = {
  1: { d: 10, f: s1 }, 2: { d: 14, f: s2 }, 3: { d: 12, f: s3 }, 4: { d: 12, f: s4 }, 5: { d: 14, f: s5 }, 6: { d: 12, f: s6 }, 7: { d: 9, f: s7 },
};
export const hasClip = (n: number) => !!SCENES[n];
export const clipHtml = (n: number) => (SCENES[n] ? `<canvas class="clip" data-c="${n}" width="${W}" height="${H}" role="img" aria-hidden="true"></canvas>` : "");
/** Vẽ đúng 1 khung ở giây t (dùng cho kiểm thử / ảnh tĩnh khi người dùng tắt hiệu ứng chuyển động). */
export function drawClip(cv: HTMLCanvasElement, n: number, t: number) {
  const sc = SCENES[n], g = cv.getContext("2d"); if (!sc || !g) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  try { sc.f(g, ((t % sc.d) + sc.d) % sc.d); } catch { /* một khung lỗi không được làm sập cả trang */ }
  g.restore(); g.save(); const v = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.45)"); g.fillStyle = v; g.fillRect(0, 0, W, H);
  R(g, 0, H - 3, W, 3, "#0008"); R(g, 0, H - 3, W * (((t % sc.d) + sc.d) % sc.d) / sc.d, 3, "#ffd24d"); g.restore();
}

/* ───────────── chạy: một vòng rAF chung, chỉ vẽ canvas đang hiện trên màn hình ───────────── */
const live = new Map<HTMLCanvasElement, { n: number; t0: number }>();
let raf = 0, io: IntersectionObserver | null = null;
const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function tick(now: number) {
  raf = 0; if (!document.hidden) for (const [cv, s] of live) drawClip(cv, s.n, (now - s.t0) / 1000);
  if (live.size) raf = requestAnimationFrame(tick);
}
export function mountClips(root: ParentNode = document) {
  root.querySelectorAll<HTMLCanvasElement>("canvas.clip").forEach((cv) => {
    const n = Number(cv.dataset.c), sc = SCENES[n]; if (!sc) return;
    drawClip(cv, n, sc.d * 0.55);                                  // khung đầu (poster) hiện ngay, kể cả khi chưa cuộn tới
    if (calm()) return;
    if (!io) io = new IntersectionObserver((es) => {
      for (const e of es) { const c = e.target as HTMLCanvasElement; if (e.isIntersecting) live.set(c, { n: Number(c.dataset.c), t0: performance.now() }); else live.delete(c); }
      if (live.size && !raf) raf = requestAnimationFrame(tick);
    }, { threshold: 0.15 });
    io.observe(cv);
  });
}
