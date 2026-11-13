/**
 * Địa hình đảo (v27): bản đồ độ cao dạng khối (voxel) — đồi lượn sóng, vách đá thẳng đứng ra biển, dãy núi tuyết phía Bắc, vịnh cát phía Nam.
 * Thuần toán học (không phụ thuộc three/DOM) nên chạy thử được bằng node. Mặc định mọi toạ độ là mét; x = Đông, z = Nam (+z), y = lên.
 * Độ cao H(ix,iz) là số NGUYÊN = mặt trên của khối tại ô [ix,ix+1)×[iz,iz+1). Mực nước biển ở y = WATER_Y (-0.75), đất liền luôn có H ≥ 0.
 */
import { fbm, fbm4, vnoise, hash, smooth, lerp } from "./noise";

export const ISLE = 64;                                   // bán kính đảo (m): gấp ĐÔI bản cũ (32) → diện tích gấp 4
export const WATER_Y = -0.75;
export const NG = 92;                                     // nửa cạnh lưới độ cao (m)
export const STEP = 1;                                    // leo được tối đa 1 khối mỗi bước (tự bước lên như Minecraft)
export const dist6 = (x: number, z: number) => Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(z), 6), 1 / 6);
/** Bán kính bờ biển theo hướng (nhấp nhô để bờ tự nhiên). */
export const limit = (x: number, z: number) => {
  const a = Math.atan2(z, x);
  return ISLE + 3.4 * Math.sin(a * 3 + 1) + 2.4 * Math.sin(a * 5 + 2) + 1.6 * Math.sin(a * 7) + (fbm(x * 0.02 + 9, z * 0.02 + 4) - 0.5) * 7;
};

/* ───────────── Bố cục các điểm quan trọng (đã nhân đôi so với bản cũ) ───────────── */
export const CAMP: [number, number] = [0, 0];                                                    // lửa trại = nơi họp
export const STATION_XZ: [number, number][] = [[-40, -22], [40, -22], [-40, 34], [40, 34], [0, -32]];   // radio, decode, water, fire, supply
export const VENT_XZ: [number, number][] = [[36, 4], [-36, 4], [4, 38]];
export const HUT_XZ: [number, number][] = [[-52, 10], [-52, -10]];
export const HAMMOCK_XZ: [number, number] = [-48, 50];
export const RUINS_XZ: [number, number] = [52, -12];
export const ROCK_XZ: [number, number, number][] = [[50, 22, 1.1], [43, 29, 0.8], [-24, -42, 0.9]];
export const WRECK_XZ: [number, number] = [-24, 56];
export const VOLCANO_XZ: [number, number] = [44, 46];
export const BEACH_XZ: [number, number] = [12, 49];                                              // trại bãi biển cạnh cầu tàu
export const SUPPLY_CRATES_XZ: [number, number] = [-10, -38];

/** Mặt phẳng được san bằng quanh công trình. [x, z, bán kính phẳng, (tuỳ chọn) bán kính ao] — ao: lõm xuống 2 khối và có nước. */
export const PADS: { x: number; z: number; r: number; pond?: number }[] = [
  { x: CAMP[0], z: CAMP[1], r: 9 },
  ...STATION_XZ.map(([x, z]) => ({ x, z, r: 4.5 })),
  ...VENT_XZ.map(([x, z]) => ({ x, z, r: 3.5 })),
  ...HUT_XZ.map(([x, z]) => ({ x, z, r: 5.5 })),
  { x: HAMMOCK_XZ[0], z: HAMMOCK_XZ[1], r: 6 },
  { x: RUINS_XZ[0], z: RUINS_XZ[1], r: 7 },
  ...ROCK_XZ.map(([x, z]) => ({ x, z, r: 4 })),
  { x: WRECK_XZ[0], z: WRECK_XZ[1], r: 7 },
  { x: VOLCANO_XZ[0], z: VOLCANO_XZ[1], r: 6.5 },
  { x: BEACH_XZ[0], z: BEACH_XZ[1], r: 7 },
  { x: SUPPLY_CRATES_XZ[0], z: SUPPLY_CRATES_XZ[1], r: 3.5 },
  { x: 22, z: 16, r: 8, pond: 5 }, { x: -16, z: 28, r: 7.5, pond: 4.5 }, { x: 18, z: -18, r: 7, pond: 4 },
];
const PAD_BLEND = 5;
/** Quả đồi tròn trên cao nguyên: [x, z, bán kính, độ cao thêm]. */
const DOMES: [number, number, number, number][] = [[-30, -2, 16, 17], [28, 30, 12, 8], [-30, 22, 10, 7], [8, -20, 10, 7], [50, 2, 10, 9], [-8, 44, 8, 5]];

const sea = (t: number) => (t > -4 ? -1 : t > -9 ? -2 : -3);
/** Độ cao liên tục (chưa làm tròn, chưa san bằng). Biển trả số nguyên âm. */
function baseH(x: number, z: number): number {
  const rad = dist6(x, z), t = limit(x, z) - rad + (fbm(x * 0.17 + 1.3, z * 0.17 + 7.7) - 0.5) * 2.4;
  if (t <= 0) return sea(t + (hash(Math.floor(x), Math.floor(z), 3) - 0.5) * 1.6);
  let da = Math.abs(Math.atan2(z, x) - Math.PI / 2); if (da > Math.PI) da = Math.PI * 2 - da;
  const cove = 1 - smooth(0.22, 0.85, da);                                 // vịnh cát phía Nam: bờ thoải, bốn phía còn lại là vách đá
  const rise = lerp(3.2 * t, 0.36 * t, cove);
  let P = 14 + (fbm4(x * 0.03 + 11, z * 0.03 + 3) - 0.5) * 13;           // cao nguyên lượn sóng
  for (const [dx, dz, r, h] of DOMES) { const u = Math.hypot(x - dx, z - dz) / r; if (u < 1) P += h * Math.pow(1 - u * u, 1.5); }
  const north = smooth(-0.55, 0.5, -z / (rad || 1)), ring = smooth(27, 50, rad) * north;      // dãy núi ôm cung phía Bắc
  const r1 = 1 - Math.abs(2 * vnoise(x * 0.055 + 5, z * 0.055 + 2) - 1), r2 = 1 - Math.abs(2 * vnoise(x * 0.12 + 1, z * 0.12 + 9) - 1);
  const ridge = Math.min(1, 0.68 * r1 + 0.32 * r2);
  P += ring * (8 + 36 * Math.pow(ridge, 2) + (fbm(x * 0.2, z * 0.2) - 0.5) * 6);
  return Math.min(P, rise);
}
const padH = new Map<number, number>();
const padHeight = (i: number) => { let h = padH.get(i); if (h === undefined) { const p = PADS[i]; h = Math.max(1, Math.round(baseH(p.x, p.z))); padH.set(i, h); } return h; };
function heightAt(x: number, z: number): number {
  let h = baseH(x, z);
  if (h < 0) return h;
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i], d = Math.hypot(x - p.x, z - p.z); if (d >= p.r + PAD_BLEND) continue;
    h = lerp(h, padHeight(i), 1 - smooth(p.r, p.r + PAD_BLEND, d));
  }
  for (let i = 0; i < PADS.length; i++) {
    const p = PADS[i]; if (!p.pond) continue;
    if (Math.hypot(x - p.x, z - p.z) < p.pond + (hash(Math.floor(x), Math.floor(z), 9) - 0.5) * 0.9) return padHeight(i) - 2;   // lòng ao
  }
  return Math.max(0, Math.round(h));
}

/* ───────────── lưới độ cao ───────────── */
const W2 = NG * 2;
const HT = new Int16Array(W2 * W2);
for (let ix = -NG; ix < NG; ix++) for (let iz = -NG; iz < NG; iz++) HT[(ix + NG) * W2 + iz + NG] = heightAt(ix + 0.5, iz + 0.5);
/** Độ cao khối tại ô nguyên (ix, iz). Ngoài lưới = đáy biển. */
export const H = (ix: number, iz: number) => (ix < -NG || ix >= NG || iz < -NG || iz >= NG ? -3 : HT[(ix + NG) * W2 + iz + NG]);

/** Ao nước trên cao nguyên (mỗi ao: tâm, bán kính, mực nước). */
export const PONDS = PADS.map((p, i) => ({ p, i })).filter(({ p }) => p.pond).map(({ p, i }) => ({ x: p.x, z: p.z, r: p.pond!, y: padHeight(i) - 0.8 }));
const isPondCell = (ix: number, iz: number) => { const h = H(ix, iz); for (const o of PONDS) if (h < o.y - 0.5 && Math.hypot(ix + 0.5 - o.x, iz + 0.5 - o.z) < o.r + 1.5) return true; return false; };
export const isPond = (x: number, z: number) => isPondCell(Math.floor(x), Math.floor(z));

/** Cầu tàu nhô ra biển phía Nam (đặt tại chỗ bờ biển cắt x = DOCK.x). */
export const DOCK = (() => {
  const x = 12; let z = 30; while (z < NG - 2 && H(Math.floor(x), Math.floor(z)) >= 0) z += 0.5;
  return { x, hw: 1.2, z0: z - 3, z1: z + 20 };
})();
const onDock = (x: number, z: number) => Math.abs(x - DOCK.x) <= DOCK.hw - 0.3 && z >= DOCK.z0 && z <= DOCK.z1;
export const DOCK_Y = 0;
/** Mặt đất tại (x, z): độ cao khối (số nguyên), hoặc mặt cầu tàu (0). Mọi nhân vật đứng ở y = groundAt. */
export const groundAt = (x: number, z: number) => (onDock(x, z) ? DOCK_Y : H(Math.floor(x), Math.floor(z)));
/** Đứng được: là đất liền (không phải biển / lòng ao). */
export const walkable = (x: number, z: number) => onDock(x, z) || (H(Math.floor(x), Math.floor(z)) >= 0 && !isPond(x, z));
export const CAMP_Y = H(0, 0);

/** Độ dốc cục bộ = chênh lệch cao nhất giữa ô và 4 ô kề. */
export const slopeAt = (ix: number, iz: number) => { const h = H(ix, iz); return Math.max(Math.abs(H(ix + 1, iz) - h), Math.abs(H(ix - 1, iz) - h), Math.abs(H(ix, iz + 1) - h), Math.abs(H(ix, iz - 1) - h)); };

/** Bước từ (fx,fz) sang (tx,tz): đi được nếu đích là đất liền và không cao hơn mặt đứng (hoặc độ cao hiện tại nếu đang nhảy) quá STEP. */
export function canStep(fx: number, fz: number, y: number, tx: number, tz: number) {
  if (!walkable(tx, tz)) return false;
  return groundAt(tx, tz) <= Math.max(groundAt(fx, fz), y) + STEP + 1e-3;
}

/* ───────────── tia cắt địa hình (đạn, tầm nhìn, camera) ───────────── */
/** Đi dọc tia (o + d·t) tìm điểm đầu tiên nằm DƯỚI mặt đất. Trả t hoặc -1. d phải chuẩn hoá. */
export function terrainRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, step = 0.4) {
  let prev = 0;
  for (let t = step; t <= maxT + step; t += step) {
    const tt = Math.min(t, maxT), x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
    if (y < groundAt(x, z)) { let a = prev, b = tt; for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m < groundAt(ox + dx * m, oz + dz * m)) b = m; else a = m; } return b; }
    prev = tt; if (tt >= maxT) break;
  }
  return -1;
}
/** Địa hình có chắn đường nhìn giữa hai điểm không? (bỏ qua 1 chút ngay đầu tia để khỏi tự vướng đất dưới chân) */
export function losBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz); if (L < 0.5) return false;
  return terrainRay(ax, ay, az, dx / L, dy / L, dz / L, L - 0.2, 0.5) >= 0;
}
void hash;
