import { G } from "../state";
import { entities, bodies, spawnAll } from "../world/characters";
import { setRound, showEnd } from "../ui/hud";
import { checkpointOnChain, getRoom, secretAct } from "../web3/chain";
import { toast } from "../ui/dom";

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
  G.round++; G.acted = G.killUsed = G.voted = false;
  bodies.forEach((b) => (b.g.visible = false)); bodies.length = 0;
  entities.forEach((e) => { if (e.dead) e.out = true; });
  spawnAll(); setRound(G.round); G.phase = "play"; scheduleDummyAct();
}
export function finish(winner: number) { // 1 = Crewmates, 2 = Impostors
  G.phase = "end";
  showEnd(winner === 1, (winner === 2) === (G.role === 1));
}
export async function checkpoint(manual = false) {
  if (G.phase !== "play" || G.cpRound === G.round) return;
  G.cpRound = G.round;
  try {
    await checkpointOnChain();
    const r = await getRoom();
    if (Number(r.phase) === 4) finish(Number(r.winner)); else if (manual) toast("Chưa ai thắng.");
  } catch { /* hợp đồng từ chối (đã checkpoint round này, đang pending…) */ }
}
