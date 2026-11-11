/** Hình dạng đảo: hình vuông bo tròn + bờ biển lượn sóng, bốn phía là biển. Không phụ thuộc three/DOM. */
export const ISLE = 32;                                   // bán kính đảo (m) — trước đây trạm chỉ ~21m
export const cellOf = (v: number) => (v < -9 ? 0 : v > 9 ? 2 : 1);   // 3 hàng/cột khu vực
export const dist6 = (x: number, z: number) => Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(z), 6), 1 / 6);
/** Bán kính bờ biển theo hướng (nhấp nhô nhẹ cho tự nhiên). */
export const limit = (x: number, z: number) => {
  const a = Math.atan2(z, x);
  return ISLE + 1.6 * Math.sin(a * 3 + 1) + 1.1 * Math.sin(a * 5 + 2) + 0.8 * Math.sin(a * 7);
};
/** Cầu tàu nhô ra biển phía Nam. */
export const DOCK = { x: 8, hw: 1.2, z0: 22, z1: 41 };
export const walkable = (x: number, z: number) =>
  dist6(x, z) <= limit(x, z) - 0.4 || (Math.abs(x - DOCK.x) <= DOCK.hw - 0.35 && z >= DOCK.z0 - 1 && z <= DOCK.z1 - 0.4);
/** Không cho người/bot lội xuống biển: đẩy ngược vào bờ (trượt dọc theo bờ). */
export function keepOnIsland(e: { x: number; z: number }) {
  if (walkable(e.x, e.z)) return;
  if (e.z > DOCK.z0 && Math.abs(e.x - DOCK.x) < DOCK.hw + 0.7) {
    const cx = Math.max(DOCK.x - DOCK.hw + 0.35, Math.min(DOCK.x + DOCK.hw - 0.35, e.x)), cz = Math.min(e.z, DOCK.z1 - 0.4);
    if (walkable(cx, cz)) { e.x = cx; e.z = cz; return; }
  }
  for (let i = 0; i < 10 && !walkable(e.x, e.z); i++) {
    const k = 0.05, gx = dist6(e.x + k, e.z) - dist6(e.x - k, e.z), gz = dist6(e.x, e.z + k) - dist6(e.x, e.z - k), l = Math.hypot(gx, gz) || 1;
    e.x -= (gx / l) * 0.12; e.z -= (gz / l) * 0.12;
  }
}
