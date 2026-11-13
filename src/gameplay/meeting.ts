import { $, show, hide, toast, sleep } from "../ui/dom";
import { G } from "../state";
import { entities, bodies, markDead, me, setAlerts } from "../world/characters";
import type { Entity } from "../types";
import { nearestFreeSeat, sit, standAll } from "./seats";
import { exile } from "./hostile";
import { COLORS, NAMES, NO_TARGET, CHAT_LINES, CALL_SECONDS, CAMP_REACH } from "../config";
import { clearCombat } from "./combat";
import { ctx } from "../web3/context";
import { callMeeting, castVote, fetchStatuses, getRoom, parseEvents, tallyAndFinalize, reportFriendlyKill } from "../web3/chain";
import { ensureActed, finish, nextRound, checkpoint } from "./round";
import { splash, hideSplash } from "../ui/hud";
import { UI, OPENERS } from "../story";

export const ejecting = { cur: null as null | { e: (typeof entities)[number]; t: number; dx: number; dz: number; done: () => void } };
const chat = (n: string, t: string) => { const c = $("#chat"); c.innerHTML += `<div><b>${n}:</b> ${t}</div>`; c.scrollTop = 1e9; };

/** Ai đó ngồi vào ghế quanh lửa trại -> cuộc họp được gọi, mọi người có CALL_SECONDS giây để chạy tới lửa trại và ngồi. Camera + điều khiển của người chơi giữ nguyên. */
export function openCall(why: string, caller: number) {
  if (G.phase !== "play" || G.call) return;
  G.call = { why, caller, t: CALL_SECONDS }; G.reporting = true; G.reporter = -1;
  clearCombat(); clearTimeout(G.scheduleTimer); hide("#mini"); G.mini = false;
  toast("🚨 " + why); toast(UI.callBy(NAMES[caller]));
}
/** Người chơi (E) gần lửa trại: ngồi vào ghế trống gần nhất; nếu chưa có cuộc họp thì chính việc ngồi này gọi họp. */
export function trySit() {
  const m = me(); if (G.ghost || m.seat >= 0 || G.phase !== "play") return false;
  if (Math.hypot(m.x, m.z) > CAMP_REACH) return false;
  const k = nearestFreeSeat(m.x, m.z); if (k < 0) return false;
  sit(m, k);
  if (!G.call) openCall(G.bodyKnown ? UI.bodyFound : UI.callMeeting, G.slot);
  return true;
}
const alive = () => entities.filter((e) => !e.dead && !e.out && !(e.i === G.slot && G.ghost));
/** Mỗi frame (khi đang chơi): đếm ngược cuộc họp; đủ người ngồi hoặc hết giờ thì bắt đầu họp. */
export function updateCall(dt: number) {
  const bar = $("#callbar"), c = G.call;
  if (!c) { if (bar.style.display !== "none") bar.style.display = "none"; setAlerts((i) => G.reporter === i, performance.now() / 1e3); return; }
  c.t = Math.max(0, c.t - dt);
  const absent = alive().filter((e) => e.seat < 0), s = Math.ceil(c.t), seated = me().seat >= 0 || G.ghost;
  setAlerts((i) => c.caller === i, performance.now() / 1e3);
  bar.style.display = "block"; bar.className = seated ? "sm" : s <= 10 ? "hurry" : "";
  bar.innerHTML = seated ? UI.callWait(absent.length, s) : UI.callBar(c.why, NAMES[c.caller], s);
  if (!absent.length || c.t <= 0) void beginMeeting(absent);
}
async function beginMeeting(absent: Entity[]) {
  const c = G.call; if (!c) return; G.call = null;
  $("#callbar").innerHTML = UI.callChain;
  if (absent.some((e) => e.i === G.slot)) { $("#callbar").style.display = "none"; setAlerts(() => false, 0); return exile(); }   // you did not come: branded the spy
  for (const e of absent) { // bots that did not come are branded spies and expelled (recorded on-chain as a death)
    toast(UI.branded(NAMES[e.i])); G.dead.add(e.i); e.out = true; e.g.visible = false;
    try { await reportFriendlyKill(e.i); } catch { /* ghi on-chain thất bại: vẫn loại khỏi cuộc họp phía client */ }
  }
  if (absent.length) { await checkpoint(); if (G.phase !== "play") return; }
  await startMeeting(c.why);
}

export async function startMeeting(why: string) {
  if (G.phase !== "play") return;
  G.phase = "meet"; G.voted = false; G.reporting = true; clearCombat(); clearTimeout(G.scheduleTimer); hide("#mini"); G.mini = false;
  try {
    await ensureActed();
    await callMeeting();
    const st = await fetchStatuses(entities.map((e) => e.i)); // sau callMeeting, contract cấp quyền xem status cả phòng
    st.forEach((s, i) => { if (s === 0) markDead(i, toast); });
  } catch { G.phase = "play"; G.reporting = false; standAll(); toast("✗ Could not open the meeting on-chain — try again"); return; }
  $("#callbar").style.display = "none"; setAlerts(() => false, 0);

  const dl = Number((await getRoom()).voteDeadline);
  entities.forEach((e) => { e.g.visible = !e.dead && !e.out; });   // everyone is already seated around the fire
  bodies.forEach((b) => { if (!entities.some((e) => e.g === b.g)) b.g.visible = false; });
  $("#mwhy").textContent = why; $("#chat").innerHTML = ""; $("#mstat").textContent = G.ghost ? UI.spectating : ""; $("#skip").style.display = G.ghost ? "none" : ""; show("#meet");

  let sel: number | null = null;
  const row = () => ($("#mrow").innerHTML = entities.map((e) => `<div class="rw ${e.dead || e.out || (e.i === G.slot && G.ghost) ? "dd" : ""}${sel === e.i ? " sl" : ""}" data-i="${e.i}"><span class="dot" style="background:#${COLORS[e.i].toString(16).padStart(6, "0")}"></span>${NAMES[e.i]}${e.i === G.slot ? " (you)" : ""}${e.dead || e.out || (e.i === G.slot && G.ghost) ? " 💀" : ""}</div>`).join(""));
  row();
  $("#mrow").onclick = (ev) => {
    const d = (ev.target as HTMLElement).closest<HTMLElement>(".rw"); if (!d || G.voted || G.ghost) return;
    const i = +d.dataset.i!; if (entities[i].dead || entities[i].out) return;
    sel = i; row(); $("#mstat").innerHTML = `${UI.picked(NAMES[i])} <button id="ok">${UI.confirm}</button>`; $("#ok").onclick = () => vote(i);
  };
  $("#skip").onclick = () => vote(NO_TARGET);
  $("#cs").onclick = () => { const i = $<HTMLInputElement>("#ci"), v = i.value.trim(); if (v) { chat("You", v); i.value = ""; } };

  const alive = entities.filter((e) => !e.dead && !e.out);
  { const op = (why === UI.callMeeting ? OPENERS.emergency : OPENERS.body), b0 = alive.find((e) => e.i !== G.slot); if (b0) chat(NAMES[b0.i], op[(Math.random() * op.length) | 0]); }
  const bt = setInterval(() => { // Bot "tranh luận" bằng câu có sẵn
    if (G.phase !== "meet") return clearInterval(bt);
    const b = alive.filter((e) => e.i !== G.slot)[(Math.random() * (alive.length - 1)) | 0], o = alive[(Math.random() * alive.length) | 0];
    if (b && o) chat(NAMES[b.i], CHAT_LINES[(Math.random() * CHAT_LINES.length) | 0].replace("{n}", NAMES[o.i]));
  }, 3500);
  const tm = setInterval(() => {
    if (G.phase !== "meet") return clearInterval(tm);
    const l = dl - Math.floor(Date.now() / 1e3); $("#mt").textContent = "⏱ " + Math.max(0, l) + "s";
    if (l <= 0 && !G.voted && autoVote) vote(abstain());
  }, 1000);
  autoVote = true;
  if (G.ghost) vote(abstain()); // a dead player has nothing to vote: with the session wallet we just close the vote, otherwise a zero-weight vote is sent
}

let autoVote = true, lastChoice: number | null = null;
/** Abstain: with the session wallet nothing is signed (the operator just closes the vote); without it a "skip" vote is cast. */
const abstain = () => (ctx.opGame ? null : NO_TARGET);

/** tallyVotes is refused until everyone voted or the deadline passed (block time can lag our clock a little): wait and retry. */
async function tallyRetry() {
  for (let k = 0; k < 30; k++) {
    try { return await tallyAndFinalize(); }
    catch (e: any) { if (!/still open/i.test(String(e.reason || e.shortMessage || e.message))) throw e; await sleep(4000); }
  }
  throw new Error("The vote is still open on-chain — try again in a moment.");
}

/** t = a player index / NO_TARGET to cast a (sealed) vote, or null to abstain without signing anything. */
async function vote(t: number | null) {
  if (G.voted) return; G.voted = true; lastChoice = t; $("#mstat").textContent = G.ghost ? UI.spectating : t === null ? UI.tally : UI.sealing;
  try {
    if (t !== null) {
      try { await castVote(t); chat(UI.sysName, UI.sysVote); }
      catch (e: any) { if (!/Voting closed/i.test(String(e.reason || e.shortMessage || e.message))) throw e; chat(UI.sysName, UI.timesUp); }   // the deadline passed while signing: not an error, just abstain
    }
    if (!G.ghost) $("#mstat").textContent = UI.tally;
    const r = await tallyRetry(), ev = parseEvents(r);
    const ej = ev.find((x: any) => x.name === "PlayerEjected"), end = ev.find((x: any) => x.name === "GameEnded");
    hide("#meet");
    await ejectAnimation(ej ? Number(ej.args.slotId) : null, !!(ej && ej.args.wasImpostor));
    if (end) finish(Number(end.args.winner)); else nextRound();
  } catch (e: any) {
    // Never loop: stop auto-voting and offer a manual retry button.
    autoVote = false; G.voted = false; toast("✗ " + String(e.reason || e.shortMessage || e.message || e).slice(0, 120));
    $("#mstat").innerHTML = `${UI.voteFail} <button id="rt">${UI.retryVote}</button>`;
    $("#rt").onclick = () => { $("#mstat").textContent = ""; void vote(lastChoice); };
  }
}

function ejectAnimation(slot: number | null, imp: boolean) {
  return new Promise<void>((res) => {
    if (slot === null) { splash(UI.tieSplash, "", "#fff", 34, "rgba(0,0,0,.35)"); return void sleep(2500).then(() => { hideSplash(); res(); }); }
    const e = entities[slot]; if (slot === G.slot) G.ghost = true; G.dead.add(slot);
    splash(UI.ejected(NAMES[slot], imp), "", imp ? "#5f9" : "#f55", 34, "rgba(0,0,0,.35)");
    const a = Math.atan2(e.z, e.x);
    ejecting.cur = { e, t: 0, dx: Math.cos(a), dz: Math.sin(a), done: () => { e.out = true; e.g.visible = false; hideSplash(); res(); } };
  });
}
