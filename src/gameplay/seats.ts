import { entities } from "../world/characters";
import { PLAYERS, seatPos } from "../config";
import { CAMP_Y, groundAt } from "../world/island";
import type { Entity } from "../types";

/** Ghế quanh đống lửa: seatOwner[k] = chỉ số người đang ngồi (-1 = trống). */
export const seatOwner: number[] = Array(PLAYERS).fill(-1);
export function nearestFreeSeat(x: number, z: number) {
  let best = -1, bd = 1e9;
  for (let k = 0; k < PLAYERS; k++) { if (seatOwner[k] >= 0) continue; const p = seatPos(k), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = k; } }
  return best;
}
export function sit(e: Entity, k: number) {
  seatOwner[k] = e.i; e.seat = k;
  const p = seatPos(k); e.x = p.x; e.z = p.z; e.rot = Math.atan2(-p.x, -p.z); e.y = CAMP_Y + 0.32; e.vy = 0; e.px = NaN;
  e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = e.rot;
}
export function standAll() {
  seatOwner.fill(-1);
  for (const e of entities) { e.seat = -1; e.y = groundAt(e.x, e.z); e.vy = 0; (e.g.userData.alert as { visible: boolean }).visible = false; }
}
