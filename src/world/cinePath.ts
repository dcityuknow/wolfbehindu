/**
 * Quỹ đạo của cảnh mở đầu 3D (toán thuần — không import three, nên chạy thử được bằng node).
 * Mọi hàm là hàm của "đồng hồ phim" ct (giây): ct < 0 = trước khi ramp mở, ct = 0 = đèn xanh, ct ≈ 13 bắt đầu bão, ct ≈ 36 tất cả đã chạm đất.
 */
export const N = 7;
export const PL = { x0: -212, y: 150, v: 22 };                     // máy bay bay theo +x, cao 150m, 22 m/s (hơi chậm cho điện ảnh)
const turb = (ct: number) => 0.07 * Math.sin(ct * 3.1) + 0.04 * Math.sin(ct * 7.3);
export const planeAt = (ct: number) => ({ x: PL.x0 + PL.v * ct, y: PL.y + turb(ct), z: 0 });
/** Toạ độ trong khoang (lx ngang, ly cao từ sàn, lz dọc: -z = mũi, +z = đuôi/ramp) → thế giới. Máy bay xoay y = -π/2. */
export const PLANE_YAW = -Math.PI / 2;
export const toWorld = (ct: number, lx: number, ly: number, lz: number) => { const p = planeAt(ct); return { x: p.x - lz, y: p.y + ly, z: p.z + lx }; };

export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ghế ngồi (băng ghế hai bên khoang), index = id người (0 = bạn). yaw = hướng mặt khi ngồi. */
export const SEAT = [
  { x: -1.55, z: 0.2, yaw: Math.PI / 2 }, { x: 1.55, z: -1.1, yaw: -Math.PI / 2 }, { x: -1.55, z: -2.3, yaw: Math.PI / 2 }, { x: 1.55, z: 1.4, yaw: -Math.PI / 2 },
  { x: -1.55, z: 2.7, yaw: Math.PI / 2 }, { x: 1.55, z: -3.6, yaw: -Math.PI / 2 }, { x: -1.55, z: -4.8, yaw: Math.PI / 2 },
];
/** Thứ tự nhảy: ghế gần ramp (z lớn) nhảy trước. RANK[id] = thứ tự. */
export const RANK: number[] = (() => { const o = [...Array(N).keys()].sort((a, b) => SEAT[b].z - SEAT[a].z), r: number[] = []; o.forEach((id, k) => (r[id] = k)); return r; })();
export const TJ = (k: number) => 4.2 + 1.2 * k;     // thời điểm nhảy
const TS = (k: number) => 0.3 + 0.12 * k;           // thời điểm đứng dậy
export const TL = (k: number) => 32 + 0.5 * k;      // thời điểm chạm đất
const S1 = 1.3, V1 = 9.8 * S1, QZ = 9.9, QS = 0.85, WALK = 3.0, M = PL.v * 0.9;
/** Điểm hạ cánh: vòng tròn bán kính 5.2m quanh lửa trại. */
export const LAND = [...Array(N).keys()].map((i) => { const a = 0.4 + (i * Math.PI * 2) / N; return { x: 5.2 * Math.cos(a), z: 5.2 * Math.sin(a), a }; });
/** Độ mạnh của bão theo ct (0..1). */
export const storm = (ct: number) => smooth(13, 15, ct) * (1 - smooth(30, 34, ct));

export type Mode = "seat" | "walk" | "fall" | "chute" | "landed";
export interface St { mode: Mode; wx: number; wy: number; wz: number; wyaw: number; lx: number; lz: number; stand: number; open: number; land: number; walking: boolean }

/** Trạng thái người i tại thời điểm ct. gl = độ cao mặt đất chỗ hạ cánh. */
export function stateOf(i: number, ct: number, gl: number): St {
  const k = RANK[i], seat = SEAT[i], tj = TJ(k);
  if (ct < tj) { // còn trong máy bay: ngồi → đứng dậy → đi tới ramp xếp hàng
    const t = ct - TS(k), lx = lerp(seat.x, 0, smooth(0, 0.6, t)), yaw = lerp(seat.yaw, 0, smooth(0.1, 0.7, t));
    const zFree = seat.z + WALK * Math.max(0, t - 0.6);
    let ahead = 0; for (let kj = 0; kj < k; kj++) ahead += 1 - smooth(TJ(kj) - 0.35, TJ(kj), ct);
    const zStop = QZ - QS * ahead, lz = Math.min(zFree, zStop), w = toWorld(ct, lx, 0, lz);
    return { mode: t < 0 ? "seat" : "walk", wx: w.x, wy: w.y, wz: w.z, wyaw: yaw + PLANE_YAW, lx, lz, stand: smooth(0, 0.6, t), open: 0, land: 0, walking: zFree < zStop - 0.02 };
  }
  const s = ct - tj, pe = planeAt(tj), xe = pe.x - QZ, ze = pe.z, ye = pe.y, sl = TL(k) - tj;
  const y1 = ye - 4.9 * S1 * S1, v = (y1 - gl - 0.4 * V1) / (sl - S1 - 0.4), L = LAND[i];
  let wx: number, wy: number, wz: number, mode: Mode = "fall", open = 0, land = 0;
  if (s < S1) { wx = xe + M * (1 - Math.exp(-s / 0.9)); wy = ye - 4.9 * s * s; wz = ze; }
  else {
    const u = s - S1, f = Math.min(1, u / (sl - S1)), xs1 = xe + M * (1 - Math.exp(-S1 / 0.9)), res = M * Math.exp(-S1 / 0.9);
    wx = xs1 + (L.x - xs1 - res) * f + res * (1 - Math.exp(-u / 0.9));
    wy = y1 - (v * u + (V1 - v) * 0.4 * (1 - Math.exp(-u / 0.4)));
    wz = ze + (L.z - ze) * smooth(0, 1, f); mode = "chute"; open = smooth(0, 0.6, u);
    const A = (0.3 + 2.7 * storm(ct)) * (1 - f);                       // gió giật làm dù lắc ngang
    wx += Math.sin(ct * 1.3 + i * 1.7) * A; wz += Math.cos(ct * 1.1 + i) * A;
  }
  if (s >= sl) { mode = "landed"; wx = L.x; wz = L.z; wy = gl; land = smooth(0, 0.8, s - sl); }
  return { mode, wx, wy: Math.max(gl, wy), wz, wyaw: 0, lx: 0, lz: 0, stand: 1, open, land, walking: false };
}
