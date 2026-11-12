import { $, show, hide, sleep } from "./dom";
import { G } from "../state";
import { ROLE, UI, ENDING } from "../story";

export function showHud() { hide("#menu"); $("#hud").style.display = "block"; }
export function setRoleLabel(role: 0 | 1) { $("#role").innerHTML = UI.roleLabel(role === 1); }
export const setTasks = (n: number) => ($("#tk").textContent = UI.tasks(n));
export const setRound = (n: number) => ($("#rd").textContent = UI.round(n));

export function splash(title: string, sub: string, color: string, size = 54, bg = "rgba(0,0,0,.8)") {
  const s = $("#splash"); s.style.background = bg; show("#splash");
  $("#sp").textContent = title; $("#sp").style.color = color; $("#sp").style.fontSize = size + "px"; $("#sp2").textContent = sub;
}
export const hideSplash = () => hide("#splash");
export async function roleSplash(role: 0 | 1) {
  { const r = role ? ROLE.spy : ROLE.crew; splash(r.title, r.sub, r.color); }
  await sleep(3500); hideSplash();
}
export function flashRed() { $("#fx").style.opacity = ".55"; setTimeout(() => ($("#fx").style.opacity = "0"), 350); }
export function showEnd(crewWon: boolean, youWin: boolean) {
  const e = crewWon ? ENDING.crew : ENDING.spy; show("#end"); $("#et").textContent = e.title; $("#ed").innerHTML = e.desc + "<br><br>" + (youWin ? ENDING.win : ENDING.lose);
}
/** Cập nhật prompt "[E] ..." và nút Kill mỗi frame. */
export function updateHud(prompt: string, canKill: boolean) {
  $("#prompt").textContent = prompt;
  const b = $<HTMLButtonElement>("#bKill");
  b.style.display = G.role === 1 ? "" : "none"; b.disabled = !canKill;
  b.textContent = G.killUsed ? UI.killUsed : UI.kill;
}
