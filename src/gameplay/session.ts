import { $, toast } from "../ui/dom";
import { G } from "../state";
import { connect } from "../web3/wallet";
import { createSoloGame, fetchMyRole, fetchStatuses } from "../web3/chain";
import { prepareOperator, activateOperator } from "../web3/operator";
import { showHud, setRoleLabel, roleSplash } from "../ui/hud";
import { spawnAll, markDead, entities } from "../world/characters";
import { LAND } from "../world/cinePath";
import { groundAt } from "../world/island";
import { scheduleDummyAct, checkpoint } from "./round";
import { playCutscene } from "../ui/cutscene";

/** Luồng vào game: kết nối ví → cutscene mở đầu (song song) → tạo phòng Solo → chia vai trò FHE → giải mã vai trò của mình → bắt đầu. */
export async function startSolo() {
  const btn = $<HTMLButtonElement>("#bPlay"); btn.disabled = true;
  let cine: ReturnType<typeof playCutscene> | undefined;
  try {
    await connect();
    cine = playCutscene();                         // cutscene chạy song song lúc tạo phòng + chia vai trò FHE
    const opAddr = await prepareOperator(); await createSoloGame(opAddr); await activateOperator();
    G.role = await fetchMyRole();
    await cine.done;
    showHud(); setRoleLabel(G.role); await roleSplash(G.role);
    spawnAll();
    entities.forEach((e, i) => { const l = LAND[i]; if (l) { e.x = l.x; e.z = l.z; e.y = groundAt(l.x, l.z); e.px = NaN; e.tx = e.x; e.tz = e.z; } });   // vào game đúng chỗ đã đáp xuống
    G.phase = "play"; scheduleDummyAct();
    setInterval(pollSelfDeath, 9000);
    $("#bChk").onclick = () => checkpoint(true);
  } catch (e: any) { cine?.stop(); toast("✗ " + (e.message || e)); btn.disabled = false; }
}
/** Trạng thái của chính mình luôn được ACL cho phép -> phát hiện mình bị giết ngay trong lúc chơi. */
async function pollSelfDeath() {
  if (G.phase !== "play" || G.ghost) return;
  try { const [s] = await fetchStatuses([G.slot]); if (s === 0) markDead(G.slot, toast); } catch { /* bỏ qua */ }
}
