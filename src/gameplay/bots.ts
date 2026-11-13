import { entities } from "../world/characters";
import { BOT_SPEED, seatPos } from "../config";
import { waypoints } from "../world/nav";
import { walkTo } from "./walk";
import { nearestFreeSeat, sit } from "./seats";
import { openCall } from "./meeting";
import { UI } from "../story";
import type { Entity } from "../types";
import { G } from "../state";
import { busy } from "./hostile";

/** Bot đi tuần giữa các điểm quan trọng (trạm, nhà, hang, bãi biển, ao…) bằng đường A* qua đồi dốc, nghỉ 1–4s mỗi điểm. Kill/vote của Bot do contract xử lý (FHE). */
/** Chạy tới ghế trống gần nhất quanh lửa trại rồi ngồi. Bot đi báo xác sẽ gọi họp khi ngồi xuống; sắp hết giờ thì bot kẹt đường được "dịch chuyển" tới ghế để không bị oan. */
function goSeat(e: Entity, dt: number, left: number) {
  const k = nearestFreeSeat(e.x, e.z); if (k < 0) return;
  const p = seatPos(k), dx = p.x - e.x, dz = p.z - e.z, l = Math.hypot(dx, dz);
  if (l < 0.35 || left < 5) { sit(e, k); if (G.reporter === e.i && !G.call) { G.reporter = -1; openCall(UI.bodyFound, e.i); } return; }
  walkTo(e, p.x, p.z, dt, BOT_SPEED * 1.8, 2.5);
}
export function updateBots(dt: number) {
  if (G.reporter >= 0 && (entities[G.reporter].dead || entities[G.reporter].out)) { G.reporter = -1; if (!G.call) G.reporting = false; }
  for (const e of entities) {
    if (e.i === G.slot || e.dead || e.out || e.stun > 0 || e.seat >= 0) continue;
    if (G.call || G.reporter === e.i) { goSeat(e, dt, G.call ? G.call.t : 99); continue; }   // có cuộc họp: ai cũng chạy tới lửa trại
    if (busy(e.i)) continue;   // Bot đang cảnh giác / thù địch do hostile.ts điều khiển
    if (e.wait > 0) { e.wait -= dt; continue; }
    if (Math.hypot(e.tx - e.x, e.tz - e.z) < 1.7) {   // tới nơi: nghỉ một lát rồi chọn điểm tuần tra mới
      e.wait = 1 + Math.random() * 3;
      const wp = waypoints(), o = wp[(Math.random() * wp.length) | 0]; e.tx = o[0]; e.tz = o[1];
      continue;
    }
    walkTo(e, e.tx, e.tz, dt, BOT_SPEED);
  }
}
