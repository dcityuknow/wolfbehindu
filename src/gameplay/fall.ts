import * as THREE from "three";
import { W } from "../weaponState";
import { G } from "../state";
import { WATER_Y, swimmable, shoreDist, SWIM_R } from "../world/island";
import { impact } from "../world/fx";
import { flashRed } from "../ui/hud";
import { sfx } from "../audio";
import { toast } from "../ui/dom";

/** Rơi từ trên cao: mất máu theo độ cao rơi (tính từ vận tốc chạm đất). Không bao giờ giết thẳng — để lại tối thiểu 1 máu (cái chết on-chain chỉ đến từ bị xử bắn). */
export const FALL = { gravity: 14, free: 3.5, perBlock: 7, waterFree: 12, waterMul: 0.5 };   // tới 3.5 khối không sao · mỗi khối thêm −7 máu · xuống nước: an toàn tới 12 khối, vượt quá chỉ chịu 50%
const P = new THREE.Vector3();
let lastHint = -99;

/** Gọi khi người chơi vừa chạm đất/mặt nước với vận tốc rơi vy (âm). */
export function onLanding(vy: number, x: number, z: number) {
  const h = (vy * vy) / (2 * FALL.gravity), water = swimmable(x, z);
  if (water && h > 1.5) impact(P.set(x, WATER_Y, z), "water");
  if (G.ghost || G.phase !== "play") return;
  const free = water ? FALL.waterFree : FALL.free;
  if (h <= free) return;
  const dmg = Math.min(W.hp - 1, (h - free) * FALL.perBlock * (water ? FALL.waterMul : 1));
  if (dmg < 1) return;
  W.hp -= dmg; flashRed(dmg); sfx.hit();
  toast(`🦴 Rơi từ độ cao ~${Math.round(h)}m: −${Math.round(dmg)} máu`);
}
/** Nhắc nhẹ khi bơi chạm mép vùng bơi ("biển sâu"). */
export function swimEdgeHint(x: number, z: number, now: number) {
  if (swimmable(x, z) && shoreDist(x, z) > SWIM_R - 1 && now - lastHint > 6) { lastHint = now; toast("🌊 Biển sâu phía trước — không bơi xa hơn được"); }
}
