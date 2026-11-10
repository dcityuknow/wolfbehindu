import { G } from "../state";
import { entities, bodies, me } from "../world/characters";
import { stations, VENTS } from "../world/map";
import { KILL_RANGE } from "../config";
import { openMiniGame } from "./minigames";
import { startMeeting } from "./meeting";
import { checkpoint } from "./round";
import { completeTask, secretAct } from "../web3/chain";
import { flashRed, setTasks, updateHud } from "../ui/hud";
import { toast } from "../ui/dom";
import { markDead } from "../world/characters";
import { TASKS_PER_PLAYER } from "../config";
import * as THREE from "three";

export const shake = { v: 0 };
const near = (o: { x: number; z: number }, r: number) => Math.hypot(o.x - me().x, o.z - me().z) < r;
const killTarget = () => entities.find((e) => e.i !== G.slot && !e.dead && !e.out && near(e, KILL_RANGE));
const visibleBody = () => (G.ghost ? undefined : bodies.find((b) => b.g.visible && !b.own && near(b, 2.5)));
const stationNear = () => stations.find((s) => s.active && !s.done && near(s, 2));
const ventNear = () => VENTS.findIndex((v) => near({ x: v[0], z: v[1] }, 1.8));
const atTable = () => !G.ghost && near({ x: 0, z: 0 }, 2.8);

export function doKill() {
  if (G.role !== 1 || G.ghost || G.killUsed || G.phase !== "play" || G.mini) return;
  const t = killTarget(); if (!t) return;
  G.killUsed = G.acted = true; flashRed(); shake.v = 0.4; markDead(t.i, toast);
  // Mục tiêu được MÃ HOÁ trước khi gửi: quan sát giao dịch không biết ai là nạn nhân / ai là Impostor
  secretAct(t.i).then(() => checkpoint()).catch(() => {});
}
export function interact() {
  if (G.phase !== "play" || G.mini) return;
  if (visibleBody()) return void startMeeting("Xác chết được báo cáo!");
  const st = stationNear();
  if (st) return openMiniGame(st.type, () => {
    st.done = true; (st.m.material as THREE.MeshStandardMaterial).emissive.setHex(0x00aa44);
    setTasks(++G.tasks);
    completeTask().then(() => { if (G.tasks === TASKS_PER_PLAYER) checkpoint(); }).catch(() => {}); // Impostor cũng gọi: "fake task"
  });
  const vi = ventNear();
  if (G.role === 1 && !G.ghost && vi >= 0) { const n = VENTS[(vi + 1) % VENTS.length], m = me(); m.x = n[0]; m.z = n[1] + 1.5; toast("🕳 Chui vent!"); return; }
  if (atTable()) startMeeting("Họp khẩn!");
}
export function refreshPrompt() {
  let p = "";
  if (G.phase === "play" && !G.mini) {
    if (visibleBody()) p = "[E] 🚨 Báo cáo xác";
    else if (stationNear()) p = "[E] Làm nhiệm vụ";
    else if (G.role === 1 && !G.ghost && ventNear() >= 0) p = "[E] Chui vent";
    else if (atTable()) p = "[E] Họp khẩn";
  }
  updateHud(p, G.role === 1 && !G.ghost && !G.killUsed && !!killTarget());
}
