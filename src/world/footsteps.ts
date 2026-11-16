import { sfx } from "../audio";
import { entities } from "./characters";
import { G } from "../state";
import { MV } from "../weaponState";

/** Footsteps for everyone you can hear: yours (not while swimming, rolling or in the air) and the bots' within RANGE,
 *  louder the closer they are. The faster someone moves, the quicker the steps (sprint = frantic). */
const RANGE = 22, STRIDE = 0.42;
const last = new Map<number, { x: number; z: number }>();
const acc = new Map<number, number>();

export function updateFootsteps(dt: number) {
  const m = entities[G.slot];
  if (!m || dt <= 0) return;
  for (const e of entities) {
    if (e.dead || e.out || e.seat >= 0) { last.delete(e.i); continue; }
    const p = last.get(e.i); last.set(e.i, { x: e.x, z: e.z });
    if (!p) continue;
    const spd = Math.hypot(e.x - p.x, e.z - p.z) / dt;
    if (spd < 0.8 || spd > 30) continue;   // standing still / teleported
    const self = e.i === G.slot;
    if (self && (G.ghost || MV.inWater || MV.roll > 0 || Math.abs((e as any).vy ?? 0) > 0.5)) continue;
    const d = Math.hypot(e.x - m.x, e.z - m.z);
    if (!self && d > RANGE) continue;
    const v = self ? 0.75 : Math.pow(Math.max(0, 1 - d / RANGE), 1.5) * 0.95;
    if (v < 0.03) continue;
    const a = (acc.get(e.i) ?? 0) + dt * Math.min(2.2, spd / 5.5);
    if (a >= STRIDE) { acc.set(e.i, 0); sfx.step(v); } else acc.set(e.i, a);
  }
}
export const resetFootsteps = () => { last.clear(); acc.clear(); };
