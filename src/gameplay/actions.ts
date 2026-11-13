import { G } from "../state";
import { entities, bodies, me } from "../world/characters";
import { stations, VENTS } from "../world/map";
import { KILL_RANGE, NAMES, CAMP_REACH } from "../config";
import { openMiniGame } from "./minigames";
import { trySit } from "./meeting";
import { checkpoint } from "./round";
import { completeTask, secretAct, reportFriendlyKill } from "../web3/chain";
import { flashRed, setTasks, updateHud } from "../ui/hud";
import { toast } from "../ui/dom";
import { markDead } from "../world/characters";
import { TASKS_PER_PLAYER } from "../config";
import * as THREE from "three";
import { UI, TASKS } from "../story";
import { onKillSeen, onUnseenDeath } from "./hostile";
import { groundAt } from "../world/island";

export const shake = { v: 0 };
const near = (o: { x: number; z: number }, r: number) => Math.hypot(o.x - me().x, o.z - me().z) < r;
const killTarget = () => entities.find((e) => e.i !== G.slot && !e.dead && !e.out && near(e, KILL_RANGE));
const visibleBody = () => (G.ghost ? undefined : bodies.find((b) => b.g.visible && !b.own && near(b, 2.5)));
const stationNear = () => stations.find((s) => s.active && !s.done && near(s, 2));
const ventNear = () => VENTS.findIndex((v) => near({ x: v[0], z: v[1] }, 1.8));
const atCamp = () => !G.ghost && me().seat < 0 && near({ x: 0, z: 0 }, CAMP_REACH);

export function doKill() {
  if (G.role !== 1 || G.ghost || G.killUsed || G.phase !== "play" || G.mini) return;
  const t = killTarget(); if (!t) return;
  lethal(t);
}
/** Ám sát thật (phím Q hoặc phát súng hạ gục của gián điệp): 1 lần/lượt, ghi on-chain. */
export function lethal(t: { i: number }) {
  if (G.killUsed) return;
  onKillSeen(entities[t.i]);   // anyone who SEES the kill exposes the spy; an unseen kill stays secret
  G.killUsed = G.acted = true; flashRed(); shake.v = 0.4; markDead(t.i, toast);
  // Mục tiêu được MÃ HOÁ trước khi gửi: quan sát giao dịch không biết ai là nạn nhân / ai là Impostor
  secretAct(t.i).then(() => checkpoint()).catch(() => {});
}
/** You shot a squadmate dead (anything that is not the spy's one secret kill per round). They stay dead until the game ends — recorded on-chain. */
export function friendlyKill(t: { i: number }) {
  const e = entities[t.i]; if (e.dead || e.out || G.phase !== "play") return;
  if (!onKillSeen(e)) onUnseenDeath(e);   // witnessed -> the squad opens fire at once; unseen -> they only investigate
  flashRed(); shake.v = 0.4; markDead(t.i, toast); toast(UI.mateDead(NAMES[t.i]));
  reportFriendlyKill(t.i).then(() => checkpoint()).catch(() => {});
}
export function interact() {
  if (G.phase !== "play" || G.mini || me().seat >= 0) return;
  if (atCamp()) return void trySit();      // ngồi vào ghế quanh lửa trại = gọi họp / tham gia họp
  if (G.call) return;                      // đang có cuộc họp: chỉ còn việc chạy tới lửa trại
  if (visibleBody()) { G.bodyKnown = true; return void toast(UI.bodyHint); }   // phải tự chạy tới lửa trại mới gọi được họp
  const st = stationNear();
  if (st) return openMiniGame(st.type, () => {
    st.done = true; (st.m.material as THREE.MeshStandardMaterial).emissive.setHex(0x00aa44);
    setTasks(++G.tasks);
    completeTask().then(() => { if (G.tasks === TASKS_PER_PLAYER) checkpoint(); }).catch(() => {}); // Impostor cũng gọi: "fake task"
  });
  const vi = ventNear();
  if (G.role === 1 && !G.ghost && vi >= 0) { const n = VENTS[(vi + 1) % VENTS.length], m = me(); m.x = n[0]; m.z = n[1] + 1.5; m.y = groundAt(m.x, m.z); m.vy = 0; m.px = NaN; toast(UI.ventToast); return; }
}
export function refreshPrompt() {
  let p = "";
  if (G.phase === "play" && !G.mini) {
    if (me().seat >= 0) p = UI.seated;
    else if (atCamp()) p = G.call ? UI.sitJoin : UI.sitCall;
    else if (G.call) p = "";
    else if (visibleBody()) p = UI.bodyPrompt;
    else if (stationNear()) p = TASKS[stationNear()!.type].prompt;
    else if (G.role === 1 && !G.ghost && ventNear() >= 0) p = UI.vent;
  }
  updateHud(p, G.role === 1 && !G.ghost && !G.killUsed && !!killTarget());
}
