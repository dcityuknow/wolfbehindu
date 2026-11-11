import { $, show, hide, sleep } from "./dom";
import { G } from "../state";

export function showHud() { hide("#menu"); $("#hud").style.display = "block"; }
export function setRoleLabel(role: 0 | 1) {
  $("#role").innerHTML = role ? 'Vai trò: <b style="color:#f55">🔪 IMPOSTOR</b>' : 'Vai trò: <b style="color:#5f9">🧑‍🚀 CREWMATE</b>';
}
export const setTasks = (n: number) => ($("#tk").textContent = `Nhiệm vụ: ${n}/3`);
export const setRound = (n: number) => ($("#rd").textContent = `Round ${n}`);

export function splash(title: string, sub: string, color: string, size = 54, bg = "rgba(0,0,0,.8)") {
  const s = $("#splash"); s.style.background = bg; show("#splash");
  $("#sp").textContent = title; $("#sp").style.color = color; $("#sp").style.fontSize = size + "px"; $("#sp2").textContent = sub;
}
export const hideSplash = () => hide("#splash");
export async function roleSplash(role: 0 | 1) {
  splash(role ? "BẠN LÀ IMPOSTOR" : "BẠN LÀ CREWMATE", role ? "Rình lúc ai đó đi lẻ rồi Q để kill. Hang bí mật: E." : "Làm 3 nhiệm vụ, tìm ra Impostor trong 3 người kia.", role ? "#f55" : "#5f9");
  await sleep(3500); hideSplash();
}
export function flashRed() { $("#fx").style.opacity = ".55"; setTimeout(() => ($("#fx").style.opacity = "0"), 350); }
export function showEnd(crewWon: boolean, youWin: boolean) {
  show("#end"); $("#et").textContent = (crewWon ? "🧑‍🚀 CREWMATES" : "🔪 IMPOSTORS") + " THẮNG"; $("#ed").textContent = youWin ? "🎉 Bạn thắng!" : "Bạn thua.";
}
/** Cập nhật prompt "[E] ..." và nút Kill mỗi frame. */
export function updateHud(prompt: string, canKill: boolean) {
  $("#prompt").textContent = prompt;
  const b = $<HTMLButtonElement>("#bKill");
  b.style.display = G.role === 1 ? "" : "none"; b.disabled = !canKill;
  b.textContent = G.killUsed ? "🔪 Đã dùng (round này)" : "🔪 Kill (Q)";
}
