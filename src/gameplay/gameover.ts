import { t } from "../i18n";
import { G } from "../state";
import { entities } from "../world/characters";
import { $, show, hide } from "../ui/dom";
import { chainEv, txUrl, shortHash } from "../web3/events";
import { NAMES } from "../config";
import { ENDING, ROLE } from "../story";
import { proveDeath, revealAllRoles, getRoom } from "../web3/chain";
import { playRevealCards, openRevealStage } from "../ui/revealCards";
import { beginDeath, endDeathView } from "../ui/deathSeq";

const plain = (h: string) => h.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const errMsg = (e: any) => String(e?.shortMessage || e?.reason || e?.message || e).slice(0, 80);

/** Chuỗi cảnh khi NGƯỜI CHƠI chết (bị ám sát / bị cả đội xử bắn):
 *  ngã gần 90° → màn hình tối dần đều → (2 s sau lúc chết: chụp ảnh cả đội) → các thẻ ảnh hiện ra chờ đóng dấu → text chạy như radio ở dưới →
 *  ghi cái chết on-chain + mở khoá vai trò (làm song song ngay từ lúc chết) → đóng dấu GIÁN ĐIỆP → Tiếp tục → bảng kết quả. */
export async function deathFlow(o: { title: string; desc: string; fall?: boolean; record: () => Promise<string>; recording: string; done: (r: string) => string; doneRadio?: boolean; fail: string; retry: string }) {
  const dark = beginDeath(o.fall !== false);
  let rec = o.record(); rec.catch(() => {});          // chạy ngay, song song với cảnh ngã
  await dark;
  const names = NAMES.slice(0, entities.length), st = openRevealStage(names, G.slot);
  void st.say(plain(o.title)); void st.say(plain(o.desc)); void st.say(o.recording);
  st.clock(true); chainEv.fn = (e) => {   // mỗi giao dịch / lần KMS giải mã: ghi lên radio làm gì + (khi xong) link tx
    if (e.phase === "retry") { void st.say(t("kms.retry", e.n ?? 0)); return; }
    const k = `${e.kind}.${e.step}.${e.phase}`;
    void st.say((e.phase === "ok" ? "✅ " : e.kind === "kms" ? "🔑 " : "⏳ ") + t(k), e.hash ? { text: shortHash(e.hash), href: txUrl(e.hash) } : undefined);
  };
  let rcpt = "";
  for (;;) { try { rcpt = await rec; break; } catch { void st.say(o.fail); await st.ask(o.retry); void st.say(o.recording); rec = o.record(); rec.catch(() => {}); } }
  if (o.doneRadio !== false) void st.say(o.done(rcpt)); void st.say(t("end.unlocking"));
  let roles: number[];
  for (;;) { try { roles = await revealAllRoles(entities.length); break; } catch (e) { void st.say(plain(t("end.cantUnlock", errMsg(e)))); await st.ask(t("end.retry")); void st.say(t("end.unlocking")); } }
  chainEv.fn = null;
  await st.stamp(roles);
  await st.finish();
  endDeathView();
  $("#et").textContent = o.title;
  $("#ed").innerHTML = o.desc + `<br><br><span id="chainst">${o.done(/^0x/.test(rcpt) ? `<a href="${txUrl(rcpt)}" target="_blank" rel="noopener noreferrer" style="color:#7cf">${shortHash(rcpt)}</a>` : rcpt)}</span><div id="reveal"></div>`;
  show("#end"); renderRoles(roles);
}

/** Bị giết (ám sát bởi gián điệp Bot): ván solo kết thúc NGAY — không ngồi làm hồn ma chờ Bot chơi tiếp.
 *  Cái chết được CHỨNG MINH on-chain (giải mã công khai status mã hoá + chữ ký KMS), rồi MỞ KHOÁ vai trò cả 11 slot để lộ gián điệp. */
export function endBecauseKilled() {
  if (G.phase === "end") return;
  G.phase = "end"; G.call = null; clearTimeout(G.scheduleTimer); document.exitPointerLock?.();
  hide("#meet"); hide("#mini"); G.mini = false;
  const w = document.getElementById("wanted"); if (w) w.style.display = "none";
  void deathFlow({
    title: ENDING.killed.title, desc: ENDING.killed.desc,
    record: async () => { try { await proveDeath(); } catch { if (Number((await getRoom()).phase) !== 4) throw new Error("not finished"); } return ""; },
    recording: t("end.proving"), done: () => t("end.proved"), fail: plain(t("end.cantProve")), retry: t("end.retry"),
  });
}

/** Danh sách vai trò 11 slot trong bảng kết quả cuối. */
function renderRoles(roles: number[]) {
  const box = $("#reveal"); if (!box) return;
  const spies = roles.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
  box.innerHTML = `<b style="font-size:20px">${t("end.spyWas", spies.map((i) => NAMES[i] + (i === G.slot ? " " + t("w.youTag") : "")).join(", ") || "?")}</b><br><br>` +
    roles.map((r, i) => `<div style="${r === 1 ? "color:#ff6b6b;font-weight:800" : "opacity:.8"}">${r === 1 ? ROLE.spy.badge : ROLE.crew.badge} — ${NAMES[i]}${i === G.slot ? " " + t("w.youTag") : ""}</div>`).join("");
}

/** Mở khoá + hiện vai trò của cả 11 slot vào #reveal (dùng cho mọi kết cục; chỉ chạy được khi phòng đã Finished). */
export async function revealPanel() {
  const box = $("#reveal"); if (!box) return;
  box.innerHTML = `<div id="rvst">${t("end.unlocking")}</div>`;
  try {
    const roles = await revealAllRoles(entities.length);
    const spies = roles.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
    await playRevealCards(roles, NAMES.slice(0, roles.length), G.slot);   // xoẹt xoẹt: thẻ từng người → đóng dấu GIÁN ĐIỆP
    renderRoles(roles);
  } catch (e: any) {
    box.innerHTML = `${t("end.cantUnlock", String(e?.shortMessage || e?.reason || e?.message || e).slice(0, 80))} <button id="rvRetry" class="g">${t("end.retry")}</button>`;
    $("#rvRetry").onclick = () => void revealPanel();
  }
}
