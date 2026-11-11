import { entities, collide, cellOf } from "../world/characters";
import { CEN, BOT_SPEED } from "../config";
import { G } from "../state";

/** Bot đi lại giữa tâm các khu vực kề nhau (theo đường mòn), nghỉ 1–4s mỗi điểm. Kill/vote của Bot do contract xử lý (FHE). */
export function updateBots(dt: number) {
  for (const e of entities) {
    if (e.i === G.slot || e.dead || e.out) continue;
    if (e.wait > 0) { e.wait -= dt; }
    else {
      const dx = e.tx - e.x, dz = e.tz - e.z, l = Math.hypot(dx, dz);
      if (l < 1.7) {
        e.wait = 1 + Math.random() * 3;
        const ci = cellOf(e.tx), cj = cellOf(e.tz), opts: [number, number][] = [];
        if (ci > 0) opts.push([ci - 1, cj]); if (ci < 2) opts.push([ci + 1, cj]);
        if (cj > 0) opts.push([ci, cj - 1]); if (cj < 2) opts.push([ci, cj + 1]);
        const o = opts[(Math.random() * opts.length) | 0]; e.tx = CEN[o[0]]; e.tz = CEN[o[1]];
      } else { e.x += (dx / l) * BOT_SPEED * dt; e.z += (dz / l) * BOT_SPEED * dt; e.rot = Math.atan2(dx, dz); }
    }
    collide(e);
  }
}
