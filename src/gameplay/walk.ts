import { collide } from "../world/characters";
import { findPath } from "../world/nav";
import type { Entity } from "../types";

/** Bot đi tới (gx, gz) theo đường A* (leo dốc ≤ 1 khối, tránh vách / biển / vật cản). Trả về khoảng cách còn lại tới đích. */
interface Walk { path: [number, number][]; i: number; gx: number; gz: number; age: number; stuck: number; lx: number; lz: number }
const st = new Map<number, Walk>();
export const resetWalk = (i?: number) => { if (i === undefined) st.clear(); else st.delete(i); };

export function walkTo(e: Entity, gx: number, gz: number, dt: number, speed: number, replan = 6): number {
  const dist = Math.hypot(gx - e.x, gz - e.z); if (dist < 0.05) return dist;
  let s = st.get(e.i);
  s ??= { path: [], i: 0, gx: 1e9, gz: 1e9, age: 99, stuck: 0, lx: e.x, lz: e.z };
  s.age += dt;
  if (Math.hypot(s.gx - gx, s.gz - gz) > 2.5 || s.age > replan || s.stuck > 0.7 || !s.path.length) {
    s.path = findPath(e.x, e.z, gx, gz); s.i = 0; s.gx = gx; s.gz = gz; s.age = 0; s.stuck = 0;
    if (s.path.length && dist < 1.5) s.path = [[gx, gz]];
  }
  st.set(e.i, s);
  while (s.i < s.path.length - 1 && Math.hypot(s.path[s.i][0] - e.x, s.path[s.i][1] - e.z) < 0.7) s.i++;
  const tgt = s.path[s.i] ?? [gx, gz], dx = tgt[0] - e.x, dz = tgt[1] - e.z, l = Math.hypot(dx, dz);
  if (l > 0.02) { const k = Math.min(speed * dt, l) / l; e.x += dx * k; e.z += dz * k; e.rot = Math.atan2(dx, dz); }
  collide(e);
  // kẹt: gần như không nhích được dù đang đi → tính lại đường
  const moved = Math.hypot(e.x - s.lx, e.z - s.lz); s.lx = e.x; s.lz = e.z;
  s.stuck = moved < speed * dt * 0.2 ? s.stuck + dt : 0;
  return Math.hypot(gx - e.x, gz - e.z);
}
