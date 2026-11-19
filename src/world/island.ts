/**
 * Địa hình đảo (v27): bản đồ độ cao dạng khối (voxel) — đồi lượn sóng, vách đá thẳng đứng ra biển, dãy núi tuyết phía Bắc, vịnh cát phía Nam.
 * Thuần toán học (không phụ thuộc three/DOM) nên chạy thử được bằng node. Mặc định mọi toạ độ là mét; x = Đông, z = Nam (+z), y = lên.
 * Độ cao H(ix,iz) là số NGUYÊN = mặt trên của khối tại ô [ix,ix+1)×[iz,iz+1). Mực nước biển ở y = WATER_Y (-0.75), đất liền luôn có H ≥ 0.
 */
import { fbm, fbm4, vnoise, hash, smooth, lerp } from "./noise";

export const ISLE = 192;                                  // bán kính đảo (m): GẤP 3 bản v27 (64) → đường kính ~385 m, diện tích gấp ~9 lần
export const WATER_Y = -0.75;
export const NG = 256;                                    // nửa cạnh lưới độ cao (m)
export const STEP = 1;                                    // leo được tối đa 1 khối mỗi bước (tự bước lên như Minecraft)
export const CORE_R = 92;                                 // bán kính "khu chơi chính" quanh lửa trại: trạm, hang, nhà, bot tuần tra, lính nhảy dù đều nằm trong đây (đủ để chạy về họp trong CALL_SECONDS)
/** Khoảng cách "mềm" tới tâm (siêu elip p=2.4: gần tròn, hơi vuông) — tên cũ dist6 giữ lại cho các file khác. */
export const dist6 = (x: number, z: number) => Math.pow(Math.pow(Math.abs(x), 2.4) + Math.pow(Math.abs(z), 2.4), 1 / 2.4);
/** Bán kính bờ biển theo hướng: vịnh & mũi đất lớn (nhiễu tần số thấp) + nhấp nhô nhỏ để bờ tự nhiên. */
export const limit = (x: number, z: number) => {
  const a = Math.atan2(z, x);
  return ISLE * (1 + 0.06 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 5 + 2) + 0.025 * Math.sin(a * 7)) + (fbm(x * 0.0075 + 9, z * 0.0075 + 4) - 0.5) * 36 + (fbm(x * 0.03 + 3, z * 0.03 + 8) - 0.5) * 8;
};
/** Điểm trên bờ biển theo hướng `angle` (0 = Đông, π/2 = Nam), lùi vào trong `inset` mét. */
function shoreAt(angle: number, inset: number): [number, number] {
  const ux = Math.cos(angle), uz = Math.sin(angle); let r = 40;
  while (r < ISLE + 80 && dist6(ux * r, uz * r) < limit(ux * r, uz * r)) r += 0.5;
  return [Math.round(ux * (r - inset)), Math.round(uz * (r - inset))];
}

/* ───────────── Bố cục các điểm quan trọng ─────────────
 * KHU CHƠI CHÍNH (bán kính ~85 m quanh lửa trại, = bố cục cũ × 1.45): trạm nhiệm vụ, hang, nhà, đá — bot chạy về họp kịp trong CALL_SECONDS.
 * VÙNG HOANG DÃ phía ngoài: bãi biển + cầu tàu + xác tàu + võng nằm TẬN BỜ NAM, núi tuyết phía Bắc, hồ, rừng thông — để khám phá. */
export const CAMP: [number, number] = [0, 0];                                                    // lửa trại = nơi họp
export const STATION_XZ: [number, number][] = [[-58, -32], [58, -32], [-58, 49], [58, 49], [0, -46]];   // radio, decode, water, fire, supply
export const VENT_XZ: [number, number][] = [[52, 6], [-52, 6], [6, 55]];
export const HUT_XZ: [number, number][] = [[-75, 14], [-75, -14]];
export const RUINS_XZ: [number, number] = [70, -16];
export const ROCK_XZ: [number, number, number][] = [[73, 32, 1.1], [62, 42, 0.8], [-35, -61, 0.9]];
export const VOLCANO_XZ: [number, number] = [56, 58];
export const SUPPLY_CRATES_XZ: [number, number] = [-14, -55];
export const BEACH_XZ: [number, number] = shoreAt(Math.PI / 2 - 0.04, 16);                      // trại bãi biển cạnh cầu tàu (bờ Nam)
export const WRECK_XZ: [number, number] = shoreAt(Math.PI / 2 - 0.42, 13);                       // xác tàu mắc cạn
export const HAMMOCK_XZ: [number, number] = shoreAt(Math.PI / 2 + 0.5, 15);                      // võng dưới bóng cây, bờ Tây-Nam

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
  { x: 32, z: 23, r: 9, pond: 6.5 }, { x: -23, z: 41, r: 8.5, pond: 6 }, { x: 26, z: -27, r: 8, pond: 5.5 },   // 3 ao gần trại
  { x: -118, z: -62, r: 17, pond: 13 }, { x: 118, z: 78, r: 15, pond: 11 },                                     // 2 hồ lớn ngoài hoang dã
];
const PAD_BLEND = 10;                                      // vuốt mặt phẳng vào địa hình xung quanh thật thoải
/** Quả đồi tròn trên cao nguyên: [x, z, bán kính, độ cao thêm]. Bán kính lớn → sườn thoải. */
const DOMES: [number, number, number, number][] = [
  [-44, -3, 42, 19], [41, 44, 31, 9], [-44, 32, 26, 8], [12, -29, 26, 8], [73, 3, 26, 10], [-12, 64, 21, 6],        // khu chơi chính
  [-128, -34, 54, 15], [124, -74, 46, 14], [110, 96, 40, 10], [-104, 104, 38, 9], [4, -118, 52, 14], [-26, 126, 34, 7], [150, 10, 36, 11], [-150, 60, 30, 8],   // hoang dã
];

const sea = (t: number) => (t > -4 ? -1 : t > -9 ? -2 : -3);

/* ───────────── Cao nguyên + núi: tính 1 lần trên lưới, rồi VUỐT MƯỢT ─────────────
 * Địa hình thô (nhiễu + đồi + dãy núi) → làm mờ nhiều lượt (xoá nếp gấp/đỉnh nhọn) → giới hạn độ dốc tối đa (mỗi ô kề nhau chênh < ~0.85 khối)
 * → khi làm tròn thành khối ta được các bậc 1 khối trải rộng 2–4 ô, đồi lượn liền nhau như bản đồ Minecraft thật.
 * Vách đá ra biển (bờ) được cắt SAU bước này nên vẫn dựng đứng. */
const W2 = NG * 2;
const MAX_SLOPE = 0.85;
function rawLand(x: number, z: number): number {
  let P = 14 + (fbm4(x * 0.012 + 11, z * 0.012 + 3) - 0.5) * 16;           // cao nguyên lượn sóng (bước sóng lớn)
  for (const [dx, dz, r, h] of DOMES) { const u = Math.hypot(x - dx, z - dz) / r; if (u < 1) P += h * Math.pow(1 - u * u, 1.5); }
  const rad = dist6(x, z) || 1, north = smooth(-0.55, 0.5, -z / rad), ring = smooth(70, 125, rad) * north;      // dãy núi ôm cung phía Bắc
  if (ring > 0) {
    const r1 = 1 - Math.abs(2 * vnoise(x * 0.02 + 5, z * 0.02 + 2) - 1), r2 = 1 - Math.abs(2 * vnoise(x * 0.045 + 1, z * 0.045 + 9) - 1);
    const ridge = Math.min(1, 0.68 * r1 + 0.32 * r2);
    P += ring * (10 + 44 * Math.pow(ridge, 2) + (fbm(x * 0.08, z * 0.08) - 0.5) * 8);
  }
  return P;
}
const GP = new Float32Array(W2 * W2);
for (let ix = -NG; ix < NG; ix++) for (let iz = -NG; iz < NG; iz++) GP[(ix + NG) * W2 + iz + NG] = rawLand(ix + 0.5, iz + 0.5);
{ // làm mờ: 12 lượt [1 2 1]/4 theo từng trục (σ ≈ 2.4 ô)
  const tmp = new Float32Array(W2 * W2);
  for (let pass = 0; pass < 12; pass++) {
    for (let a = 0; a < W2; a++) for (let b = 0; b < W2; b++) { const i = a * W2 + b; tmp[i] = (GP[Math.max(0, a - 1) * W2 + b] + 2 * GP[i] + GP[Math.min(W2 - 1, a + 1) * W2 + b]) * 0.25; }
    for (let a = 0; a < W2; a++) for (let b = 0; b < W2; b++) { const i = a * W2 + b; GP[i] = (tmp[a * W2 + Math.max(0, b - 1)] + 2 * tmp[i] + tmp[a * W2 + Math.min(W2 - 1, b + 1)]) * 0.25; }
  }
  // giới hạn dốc: chỗ nào chênh hơn MAX_SLOPE thì kéo hai ô lại gần nhau
  for (let it = 0; it < 16; it++) for (let a = 0; a < W2 - 1; a++) for (let b = 0; b < W2 - 1; b++) {
    const i = a * W2 + b;
    for (const j of [i + W2, i + 1]) { const d = GP[i] - GP[j], ad = Math.abs(d); if (ad > MAX_SLOPE) { const e = (ad - MAX_SLOPE) * 0.5 * Math.sign(d); GP[i] -= e; GP[j] += e; } }
  }
}
/** Độ cao đã vuốt mượt, nội suy song tuyến theo toạ độ thực. */
function landAt(x: number, z: number): number {
  const fx = x - 0.5 + NG, fz = z - 0.5 + NG, a = Math.max(0, Math.min(W2 - 2, Math.floor(fx))), b = Math.max(0, Math.min(W2 - 2, Math.floor(fz))), u = Math.max(0, Math.min(1, fx - a)), v = Math.max(0, Math.min(1, fz - b));
  const i = a * W2 + b;
  return lerp(lerp(GP[i], GP[i + W2], u), lerp(GP[i + 1], GP[i + W2 + 1], u), v);
}
/** min trơn (đa thức): bo tròn vai vách đá thay vì gãy góc. */
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0); return Math.min(a, b) - (h * h) / (4 * k); };

/** Độ cao liên tục (chưa làm tròn, chưa san bằng). Biển trả số nguyên âm. */
function baseH(x: number, z: number): number {
  const rad = dist6(x, z), t = limit(x, z) - rad + (fbm(x * 0.11 + 1.3, z * 0.11 + 7.7) - 0.5) * 3.2;
  if (t <= 0) return sea(t + (hash(Math.floor(x), Math.floor(z), 3) - 0.5) * 1.6);
  let da = Math.abs(Math.atan2(z, x) - Math.PI / 2); if (da > Math.PI) da = Math.PI * 2 - da;
  const cove = 1 - smooth(0.35, 1.1, da);                                  // vịnh cát phía Nam: bờ thoải, các phía còn lại là vách đá
  const rise = lerp(3.4 * t, 0.3 * t, cove);
  return smin(landAt(x, z), rise, 3);
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
    const pr = p.pond + (hash(Math.floor(x), Math.floor(z), 9) - 0.5) * 0.9, pd = Math.hypot(x - p.x, z - p.z);
    if (pd < pr) { const u = pd / pr, extra = p.pond >= 10 ? 3 : 2; return padHeight(i) - 2 - Math.round(extra * (1 - u * u)); }   // lòng hồ hình bát: mép nông 2 khối, hồ lớn sâu 5 khối ở giữa, ao nhỏ sâu 4 → bơi lặn được
  }
  return Math.max(0, Math.round(h));
}

/* ───────────── lưới độ cao ───────────── */
const HT = new Int16Array(W2 * W2);
for (let ix = -NG; ix < NG; ix++) for (let iz = -NG; iz < NG; iz++) HT[(ix + NG) * W2 + iz + NG] = heightAt(ix + 0.5, iz + 0.5);
/** Độ cao khối tại ô nguyên (ix, iz). Ngoài lưới = đáy biển. */
export const H = (ix: number, iz: number) => (ix < -NG || ix >= NG || iz < -NG || iz >= NG ? -3 : HT[(ix + NG) * W2 + iz + NG]);

/** Ao nước trên cao nguyên (mỗi ao: tâm, bán kính, mực nước). */
export const PONDS = PADS.map((p, i) => ({ p, i })).filter(({ p }) => p.pond).map(({ p, i }) => ({ x: p.x, z: p.z, r: p.pond!, y: padHeight(i) - 0.8 }));
/** Mặt nạ ao/hồ: chỉ số ao ở từng ô lưới (-1 = không phải nước ao) → tra O(1). */
const PI = new Int8Array(W2 * W2).fill(-1);
PONDS.forEach((o, k) => {
  for (let ix = Math.floor(o.x - o.r - 3); ix <= Math.ceil(o.x + o.r + 3); ix++) for (let iz = Math.floor(o.z - o.r - 3); iz <= Math.ceil(o.z + o.r + 3); iz++) {
    if (ix < -NG || ix >= NG || iz < -NG || iz >= NG) continue;
    if (H(ix, iz) < o.y - 0.5 && Math.hypot(ix + 0.5 - o.x, iz + 0.5 - o.z) < o.r + 1.5) PI[(ix + NG) * W2 + iz + NG] = k;
  }
});
/** Ao/hồ chứa điểm (x, z), hoặc null. */
export const pondAt = (x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); if (ix < -NG || ix >= NG || iz < -NG || iz >= NG) return null; const k = PI[(ix + NG) * W2 + iz + NG]; return k < 0 ? null : PONDS[k]; };
export const isPond = (x: number, z: number) => pondAt(x, z) !== null;
/** Mặt nước tại (x, z): hồ trên cao nguyên có mực riêng, còn lại là mực biển. */
export const surfaceAt = (x: number, z: number) => pondAt(x, z)?.y ?? WATER_Y;

/** Cầu tàu nhô ra biển phía Nam (đặt tại chỗ bờ biển cắt x = DOCK.x). */
export const DOCK = (() => {
  const x = BEACH_XZ[0] - 0.5; let z = BEACH_XZ[1]; while (z < NG - 2 && H(Math.floor(x), Math.floor(z)) >= 0) z += 0.5;
  return { x, hw: 1.2, z0: z - 3, z1: z + 20 };
})();
const onDock = (x: number, z: number) => Math.abs(x - DOCK.x) <= DOCK.hw - 0.3 && z >= DOCK.z0 && z <= DOCK.z1;
export const DOCK_Y = 0;
/** Mặt đất tại (x, z): độ cao khối (số nguyên), hoặc mặt cầu tàu (0). Mọi nhân vật đứng ở y = groundAt. */
/* ───────────── Bơi ngoài biển ─────────────
 * Người chơi bơi được trong vùng biển cách bờ tối đa SWIM_R mét (bản đồ khoảng cách tới bờ tính một lần lúc tải). Xa hơn là "biển sâu" (không bơi tiếp).
 * Khi bơi, chân đứng ở SWIM_Y (vai chìm dưới mặt nước, đầu nhô lên). Bot không bơi. */
export const SWIM_R = 16;
export const SWIM_Y = WATER_Y - 1.0;
/** Độ cao chân khi nổi trên mặt nước tại (x, z) (vai chìm, đầu nhô lên): biển và hồ có mực nước khác nhau. */
export const swimYAt = (x: number, z: number) => surfaceAt(x, z) - 1.0;
const SD = new Float32Array(W2 * W2).fill(1e3);
for (let ix = -NG; ix < NG; ix++) for (let iz = -NG; iz < NG; iz++) if (H(ix, iz) >= 0) SD[(ix + NG) * W2 + iz + NG] = 0;
{ // khoảng cách tới bờ (chamfer 2 lượt)
  const g = (a: number, b: number) => (a < 0 || b < 0 || a >= W2 || b >= W2 ? 1e3 : SD[a * W2 + b]);
  for (let a = 0; a < W2; a++) for (let b = 0; b < W2; b++) SD[a * W2 + b] = Math.min(SD[a * W2 + b], g(a - 1, b) + 1, g(a, b - 1) + 1, g(a - 1, b - 1) + 1.414, g(a - 1, b + 1) + 1.414);
  for (let a = W2 - 1; a >= 0; a--) for (let b = W2 - 1; b >= 0; b--) SD[a * W2 + b] = Math.min(SD[a * W2 + b], g(a + 1, b) + 1, g(a, b + 1) + 1, g(a + 1, b + 1) + 1.414, g(a + 1, b - 1) + 1.414);
}
export const shoreDist = (x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); return ix < -NG || ix >= NG || iz < -NG || iz >= NG ? 1e3 : SD[(ix + NG) * W2 + iz + NG]; };
/** Ô biển trong vùng bơi được (không tính cầu tàu). */
export const swimmable = (x: number, z: number) => !onDock(x, z) && ((H(Math.floor(x), Math.floor(z)) < 0 && shoreDist(x, z) <= SWIM_R) || isPond(x, z));   // biển gần bờ + mọi hồ/ao
/** Đáy nước (mặt trên khối đáy) tại (x, z): giới hạn độ sâu khi lặn. */
export const waterBed = (x: number, z: number) => H(Math.floor(x), Math.floor(z));
export const groundAt = (x: number, z: number) => (onDock(x, z) ? DOCK_Y : swimmable(x, z) ? swimYAt(x, z) : H(Math.floor(x), Math.floor(z)));
/** Đứng được: là đất liền (không phải biển / lòng ao). */
export const walkable = (x: number, z: number) => onDock(x, z) || (H(Math.floor(x), Math.floor(z)) >= 0 && !isPond(x, z));
export const CAMP_Y = H(0, 0);

/** Độ dốc cục bộ = chênh lệch cao nhất giữa ô và 4 ô kề. */
export const slopeAt = (ix: number, iz: number) => { const h = H(ix, iz); return Math.max(Math.abs(H(ix + 1, iz) - h), Math.abs(H(ix - 1, iz) - h), Math.abs(H(ix, iz + 1) - h), Math.abs(H(ix, iz - 1) - h)); };

/** Bước từ (fx,fz) sang (tx,tz): đi được nếu đích là đất liền và không cao hơn mặt đứng (hoặc độ cao hiện tại nếu đang nhảy) quá STEP.
 *  swim = thực thể biết bơi (người chơi): được xuống nước trong vùng bơi; đang ở dưới nước thì trèo lên được bờ cao tối đa 1 khối trên mặt nước. */
export function canStep(fx: number, fz: number, y: number, tx: number, tz: number, swim = false) {
  if (swim && swimmable(tx, tz)) return true;
  if (!walkable(tx, tz)) return false;
  if (swim && swimmable(fx, fz) && y <= swimYAt(fx, fz) + 0.6) return groundAt(tx, tz) <= swimYAt(fx, fz) + 2.76;   // trèo từ nước lên bờ (cao tối đa 1 khối trên mặt nước; hồ: bờ cao hơn mặt nước 0,8)
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
  return terrainRay(ax, ay, az, dx / L, dy / L, dz / L, L - 0.2, L > 120 ? 1 : 0.5) >= 0;   // đường nhìn xa: bước 1 m cho nhẹ (đồi/núi rộng hơn nhiều so với 1 m)
}
void hash;

/** Tia (đạn) cắt mặt nước đầu tiên — biển hoặc hồ có mực riêng; chỉ tính khi tia đi từ trên mặt nước xuống. Trả t hoặc -1. d phải chuẩn hoá. */
export function rayWater(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number) {
  if (dy > -1e-4) return -1;
  let best = -1;
  for (const y of [WATER_Y, ...PONDS.map((p) => p.y)]) {
    if (oy <= y) continue;
    const t = (y - oy) / dy; if (t <= 0 || t >= maxT || (best >= 0 && t >= best)) continue;
    const x = ox + dx * t, z = oz + dz * t, p = pondAt(x, z);
    if (y === WATER_Y ? p === null && H(Math.floor(x), Math.floor(z)) < 0 : p !== null && p.y === y) best = t;
  }
  return best;
}
