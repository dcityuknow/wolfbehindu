import { G } from "../state";
import { entities, bodies, spawnAll } from "../world/characters";
import { setRound, showEnd } from "../ui/hud";
import { checkpointOnChain, getRoom, secretAct } from "../web3/chain";
import { toast, $, sleep } from "../ui/dom";
import { revealPanel } from "./gameover";
import { captureCrew } from "../ui/snapshot";
import { UI } from "../story";
import { resetRound } from "./combat";
import { standAll } from "./seats";

/** Crew gửi "act" giả vào thời điểm ngẫu nhiên để giao dịch của Impostor không nổi bật. */
export function scheduleDummyAct() {
  clearTimeout(G.scheduleTimer);
  G.scheduleTimer = window.setTimeout(() => { if (G.phase === "play" && G.role === 0) ensureActed(); }, 12e3 + Math.random() * 25e3);
}
export async function ensureActed() {
  if (G.acted) return;
  G.acted = true;
  try { await secretAct(); } catch { /* đã act hoặc lỗi mạng */ }
}
export function nextRound() {
  G.round++; G.acted = G.killUsed = G.voted = false; G.call = null; G.reporting = false; G.reporter = -1; G.bodyKnown = false; standAll();
  bodies.forEach((b) => (b.g.visible = false)); bodies.length = 0;
  entities.forEach((e) => { if (e.dead) e.out = true; });
  spawnAll(); resetRound(); setRound(G.round); G.phase = "play"; scheduleDummyAct();
}
/** Không còn ai khác sống sót ngoài người chơi (tất cả bot đã chết / bị loại). */
export const alone = () => entities.every((e) => e.i === G.slot || e.dead || e.out);
export function finish(winner: number) { // 1 = Crewmates, 2 = Impostors (3 = friendly-fire execution, handled in hostile.ts)
  if (G.phase === "end") return;   // already over (e.g. executed by the squad) — never overwrite that ending
  const massacre = winner === 1 && G.role === 0 && alone();   // biệt kích tự tay bắn hạ cả đội (gồm cả gián điệp) → kết cục riêng
  captureCrew(); G.phase = "end";
  showEnd(winner === 1, (winner === 2) === (G.role === 1), massacre);
  $("#ed").insertAdjacentHTML("beforeend", '<br><br><div id="reveal"></div>'); void revealPanel();   // ván xong -> mở khoá vai trò để ai cũng đối chiếu được
}
let cpTimer = 0, pendingRep = 0;
/**
 * Sau mỗi phát bắn chết đồng đội: gom cả loạt phát bắn rồi mới kiểm tra thắng thua MỘT lần (hợp đồng chỉ cho kiểm tra 1 lần mỗi vòng, nên nếu kiểm tra ngay sau phát đầu tiên
 * thì các phát sau không bao giờ được xét → bắn chết hết bot mà ván không kết thúc). Chờ 4 s sau phát cuối (0,9 s nếu đã hết người), chờ giao dịch ghi tử vong xong, rồi kiểm tra.
 * Còn nếu vòng này đã dùng lượt kiểm tra mà người chơi vẫn đứng một mình giữa đảo → kết thúc ngay ở máy theo luật hợp đồng (không còn Impostor sống = Biệt kích thắng; Impostor còn mà hết Biệt kích = Gián điệp thắng).
 */
export function afterFriendlyKill(report: Promise<unknown>) {
  pendingRep++; report.catch(() => {}).finally(() => { pendingRep--; });
  clearTimeout(cpTimer);
  cpTimer = window.setTimeout(async () => {
    while (pendingRep > 0 && G.phase === "play") await sleep(300);
    if (G.phase !== "play") return;
    await checkpoint();
    if (G.phase === "play" && alone()) finish(G.role === 1 ? 2 : 1);
  }, alone() ? 900 : 4000);
}
export async function checkpoint(manual = false) {
  if (G.phase !== "play" || G.cpRound === G.round) return;
  G.cpRound = G.round;
  try {
    await checkpointOnChain();
    const r = await getRoom();
    if (Number(r.phase) === 4) finish(Number(r.winner)); else if (manual) toast(UI.checkNone);
  } catch { /* hợp đồng từ chối (đã checkpoint round này, đang pending…) */ }
}
