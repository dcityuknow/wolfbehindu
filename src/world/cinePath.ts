/**
 * Quỹ đạo của cảnh mở đầu 3D (toán thuần — không import three, nên chạy thử được bằng node).
 * "Đồng hồ phim" ct (giây) khớp kịch bản 60s: ct = -12 là giây 0:00 (trong khoang) · ct = 0 là 0:12 (đèn xanh) · ct = 10 là 0:22 (bão) ·
 * ct = 26 là 0:38 (đồng hồ độ cao báo đỏ, dù tự bung ~ct 28) · ct = 36 là 0:48 (màn đen rồi rơi xuống rừng) · ct ≈ 39 người chơi chạm đất.
 */
export const N = 7;
export const PL = { x0: -212, y: 650, v: 22 };                     // máy bay bay theo +x, cao 650m (để có ~25s rơi tự do trong bão), 22 m/s
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
export const TJ = (k: number) => 3.6 + 0.55 * k;    // thời điểm nhảy theo thứ tự hàng (k = RANK); người cuối (id 6) nhảy sau cùng
const TS = (k: number) => 0.3 + 0.12 * k;           // thời điểm đứng dậy
/** Thời điểm dù bung / chạm đất theo id. Người chơi (id 0) là nhân vật bị ngất: dù bung muộn nhất, chạm đất ngay sau màn đen (đầu cảnh 5). */
export const TO = (i: number) => (i === 0 ? 28.4 : 27.0 + 0.3 * i);
export const TL = (i: number) => (i === 0 ? 38.9 : 33.0 + 0.45 * i);
const QZ = 9.9, QS = 0.85, WALK = 3.0, M = PL.v * 0.9, TAU = 1.2, TC = 0.4, H_OPEN = 85;
/** Điểm hạ cánh của từng người. Mặc định: vòng tròn quanh lửa trại; cine3d.cineBegin() thay bằng vị trí NGẪU NHIÊN rải khắp đảo mỗi ván. */
export const LAND: { x: number; z: number; a: number }[] = [...Array(N).keys()].map((i) => { const a = 0.4 + (i * Math.PI * 2) / N; return { x: 5.2 * Math.cos(a), z: 5.2 * Math.sin(a), a }; });
/** Độ mạnh của bão theo ct (0..1): vào bão ở 0:22, dịu đi khi dù đã bung. */
export const storm = (ct: number) => smooth(10, 12, ct) * (1 - smooth(28, 33, ct));

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
  const s = ct - tj, so = TO(i) - tj, sl = TL(i) - tj, L = LAND[i], pe = planeAt(tj), xe = pe.x - QZ, ze = pe.z, ye = pe.y;
  const fd = (x: number) => x - TAU * (1 - Math.exp(-x / TAU));                 // quãng rơi tự do / vận tốc cuối
  const vt = (ye - gl - H_OPEN) / fd(so);                                       // vận tốc rơi sao cho dù bung ở độ cao H_OPEN trên mặt đất
  const sA = (c: number) => 14 * storm(c);                                      // bão quật lính ra nhiều hướng
  const hx = (sx: number) => { const c = tj + sx, f = 0.7 * smooth(0, 1, sx / so);
    return { x: xe + M * (1 - Math.exp(-sx / 0.9)) + (L.x - xe - M) * f + Math.sin(c * 0.9 + i * 2.1) * sA(c), z: ze + (L.z - ze) * f + Math.cos(c * 0.7 + i * 1.3) * sA(c) * 1.3 }; };
  let wx: number, wy: number, wz: number, mode: Mode = "fall", open = 0, land = 0;
  if (s < so) { const h = hx(s); wx = h.x; wz = h.z; wy = ye - vt * fd(s); }
  else {
    const o = hx(so), yo = gl + H_OPEN, u = s - so, ul = sl - so, f = Math.min(1, u / ul), v = (H_OPEN - vt * TC) / (ul - TC);
    wx = o.x + (L.x - o.x) * f; wz = o.z + (L.z - o.z) * f;
    wy = yo - (v * u + (vt - v) * TC * (1 - Math.exp(-u / TC))); mode = "chute"; open = smooth(0, 0.6, u);
    const A = (0.3 + 2.7 * storm(ct)) * (1 - f);                                // gió giật làm dù lắc ngang
    wx += Math.sin(ct * 1.3 + i * 1.7) * A; wz += Math.cos(ct * 1.1 + i) * A;
  }
  if (s >= sl) { mode = "landed"; wx = L.x; wz = L.z; wy = gl; land = smooth(0, 0.8, s - sl); }
  return { mode, wx, wy: Math.max(gl, wy), wz, wyaw: 0, lx: 0, lz: 0, stand: 1, open, land, walking: false };
}
