/** Hàm vẽ 2D dùng chung cho lớp chữ/HUD phủ lên các clip 3D (toạ độ thiết kế 480×270, ruleStage.ts tự phóng to theo kích thước canvas). */
export type G = CanvasRenderingContext2D;
export const OW = 480, OH = 270;
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const ease = (x: number) => x * x * (3 - 2 * x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const FONT = 'system-ui,"Segoe UI",Roboto,sans-serif';
const TS = 1.1;   // clip giờ hiển thị rộng cả trang nên chữ không cần phóng nhiều

export function txt(g: G, s: string, x: number, y: number, size = 13, color = "#fff", mw?: number, align: CanvasTextAlign = "center") {
  g.font = `700 ${size * TS}px ${FONT}`; g.textAlign = align; g.textBaseline = "middle"; g.lineJoin = "round"; g.strokeStyle = "rgba(0,0,0,.8)"; g.lineWidth = 3.5;
  if (mw) { g.strokeText(s, x, y, mw); g.fillStyle = color; g.fillText(s, x, y, mw); } else { g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y); }
}
export const emo = (g: G, s: string, x: number, y: number, size = 16) => { g.font = `${size}px ${EMOJI}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff"; g.fillText(s, x, y); };
export function chip(g: G, s: string, x: number, y: number, c = "#000a", fg = "#fff") {
  g.font = `700 ${11 * TS}px ${FONT}`; const w = g.measureText(s).width + 20; g.fillStyle = c; g.beginPath(); g.roundRect(x - w / 2, y - 14, w, 28, 14); g.fill();
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, x, y + 0.5);
}
export function bubble(g: G, x: number, y: number, s: string, a = 1) {
  g.save(); g.globalAlpha = a; g.font = `700 ${11 * TS}px ${FONT}`; const w = g.measureText(s).width + 16;
  g.fillStyle = "#fff"; g.beginPath(); g.roundRect(x - w / 2, y - 26, w, 24, 7); g.fill(); g.beginPath(); g.moveTo(x - 4, y - 3); g.lineTo(x + 3, y - 3); g.lineTo(x - 1, y + 4); g.fill();
  g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, x, y - 14); g.restore();
}
export function flash(g: G, k: number, c = "255,255,255") { if (k > 0.01) { g.fillStyle = `rgba(${c},${clamp(k)})`; g.fillRect(0, 0, OW, OH); } }
/** Phím bàn phím: down = 0..1 (1 = đang nhấn, phím lún xuống + sáng vàng). */
export function key(g: G, x: number, y: number, w: number, label: string, down: number) {
  const d = down > 0.5 ? 1 : 0, h = 20;
  g.fillStyle = "#10142e"; g.fillRect(x, y + 4, w, h); g.fillStyle = d ? "#ffd24d" : "#2b3578"; g.fillRect(x, y + d * 3, w, h); g.fillStyle = d ? "#fff3b0" : "#3b479a"; g.fillRect(x + 2, y + 2 + d * 3, w - 4, h - 6);
  g.fillStyle = d ? "#222" : "#fff"; g.font = `700 ${label.length > 2 ? 10 : 13}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, x + w / 2, y + h / 2 + d * 3);
}
export function keyHint(g: G, x: number, y: number, label: string, t: number) {
  const p = 0.5 + 0.5 * Math.sin(t * 9); g.fillStyle = `rgba(255,210,77,${0.35 + 0.4 * p})`; g.fillRect(x - 12, y - 12, 24, 24); g.fillStyle = "#2b3578"; g.fillRect(x - 10, y - 10, 20, 17); g.fillStyle = "#10142e"; g.fillRect(x - 10, y + 7, 20, 3);
  txt(g, label, x, y - 2, 10, "#fff");
}
export function bar(g: G, x: number, y: number, w: number, k: number, c = "#5f9") { g.fillStyle = "#000b"; g.fillRect(x, y, w, 9); g.fillStyle = c; g.fillRect(x + 1, y + 1, (w - 2) * clamp(k), 7); }
export function cursor(g: G, x: number, y: number) { g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.lineTo(x + 4.5, y + 12); g.lineTo(x + 9, y + 19); g.lineTo(x + 12, y + 17); g.lineTo(x + 7.5, y + 10.5); g.lineTo(x + 13, y + 10); g.closePath(); g.fill(); g.stroke(); }
