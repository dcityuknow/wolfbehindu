/** Hàm nhiễu giả ngẫu nhiên (deterministic) — thuần toán học, không phụ thuộc three/DOM. Dùng cho địa hình, rải cây, biến thiên màu. */
export const hash = (x: number, y: number, z = 0) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
export function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t), u = s(xf), v = s(yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number) => vnoise(x, y) * 0.6 + vnoise(x * 2, y * 2) * 0.28 + vnoise(x * 4, y * 4) * 0.12;
/** 4 octave: dùng cho đồi núi quy mô lớn. Giá trị ~0..1. */
export const fbm4 = (x: number, y: number) => (vnoise(x, y) * 0.5 + vnoise(x * 2.03, y * 2.03) * 0.27 + vnoise(x * 4.1, y * 4.1) * 0.15 + vnoise(x * 8.3, y * 8.3) * 0.08);
export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
