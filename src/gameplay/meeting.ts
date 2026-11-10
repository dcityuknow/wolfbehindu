import { $, show, hide, toast, sleep } from "../ui/dom";
import { G } from "../state";
import { entities, bodies, markDead } from "../world/characters";
import { COLORS, NAMES, NO_TARGET, CHAT_LINES } from "../config";
import { callMeeting, castVote, fetchStatuses, getRoom, parseEvents, tallyAndFinalize } from "../web3/chain";
import { ensureActed, finish, nextRound } from "./round";
import { splash, hideSplash } from "../ui/hud";

export const ejecting = { cur: null as null | { e: (typeof entities)[number]; t: number; dx: number; dz: number; done: () => void } };
const chat = (n: string, t: string) => { const c = $("#chat"); c.innerHTML += `<div><b>${n}:</b> ${t}</div>`; c.scrollTop = 1e9; };

export async function startMeeting(why: string) {
  if (G.phase !== "play") return;
  G.phase = "meet"; G.voted = false; clearTimeout(G.scheduleTimer); hide("#mini"); G.mini = false; toast("🚨 " + why);
  try {
    await ensureActed();
    await callMeeting();
    const st = await fetchStatuses(entities.map((e) => e.i)); // sau callMeeting, contract cấp quyền xem status cả phòng
    st.forEach((s, i) => { if (s === 0) markDead(i, toast); });
  } catch { G.phase = "play"; return; }

  const dl = Number((await getRoom()).voteDeadline);
  entities.forEach((e, i) => { // xếp quanh bàn tròn
    e.g.visible = !e.dead && !e.out;
    if (e.g.visible) { const a = (i / 4) * Math.PI * 2; e.x = Math.cos(a) * 3.4; e.z = Math.sin(a) * 3.4; e.rot = Math.atan2(-e.x, -e.z); e.g.position.set(e.x, 0, e.z); e.g.rotation.set(0, e.rot, 0); }
  });
  bodies.forEach((b) => { if (!entities.some((e) => e.g === b.g)) b.g.visible = false; });
  $("#mwhy").textContent = why; $("#chat").innerHTML = ""; $("#mstat").textContent = ""; show("#meet");

  let sel: number | null = null;
  const row = () => ($("#mrow").innerHTML = entities.map((e) => `<div class="rw ${e.dead || e.out ? "dd" : ""}${sel === e.i ? " sl" : ""}" data-i="${e.i}"><span class="dot" style="background:#${COLORS[e.i].toString(16).padStart(6, "0")}"></span>${NAMES[e.i]}${e.i === G.slot ? " (bạn)" : ""}${e.dead || e.out ? " 💀" : ""}</div>`).join(""));
  row();
  $("#mrow").onclick = (ev) => {
    const d = (ev.target as HTMLElement).closest<HTMLElement>(".rw"); if (!d || G.voted || G.ghost) return;
    const i = +d.dataset.i!; if (entities[i].dead || entities[i].out) return;
    sel = i; row(); $("#mstat").innerHTML = `Đã chọn ${NAMES[i]} <button id="ok">Xác nhận vote</button>`; $("#ok").onclick = () => vote(i);
  };
  $("#skip").onclick = () => vote(NO_TARGET);
  $("#cs").onclick = () => { const i = $<HTMLInputElement>("#ci"), v = i.value.trim(); if (v) { chat("Bạn", v); i.value = ""; } };

  const alive = entities.filter((e) => !e.dead && !e.out);
  const bt = setInterval(() => { // Bot "tranh luận" bằng câu có sẵn
    if (G.phase !== "meet") return clearInterval(bt);
    const b = alive.filter((e) => e.i !== G.slot)[(Math.random() * (alive.length - 1)) | 0], o = alive[(Math.random() * alive.length) | 0];
    if (b && o) chat(NAMES[b.i], CHAT_LINES[(Math.random() * CHAT_LINES.length) | 0].replace("{n}", NAMES[o.i]));
  }, 3500);
  const tm = setInterval(() => {
    if (G.phase !== "meet") return clearInterval(tm);
    const l = dl - Math.floor(Date.now() / 1e3); $("#mt").textContent = "⏱ " + Math.max(0, l) + "s";
    if (l <= 0 && !G.voted) vote(NO_TARGET);
  }, 1000);
  if (G.ghost) vote(NO_TARGET); // hồn ma vẫn phải nộp phiếu (trọng số 0) để contract đủ phiếu
}

async function vote(t: number) {
  if (G.voted) return; G.voted = true; $("#mstat").textContent = "🔐 Đang mã hoá & gửi phiếu…";
  try {
    await castVote(t);
    chat("Hệ thống", "Phiếu của bạn đã được mã hoá on-chain. Không ai thấy bạn bầu ai.");
    $("#mstat").textContent = "📊 Bot bỏ phiếu & kiểm phiếu FHE…";
    const r = await tallyAndFinalize(), ev = parseEvents(r);
    const ej = ev.find((x: any) => x.name === "PlayerEjected"), end = ev.find((x: any) => x.name === "GameEnded");
    hide("#meet");
    await ejectAnimation(ej ? Number(ej.args.slotId) : null, !!(ej && ej.args.wasImpostor));
    if (end) finish(Number(end.args.winner)); else nextRound();
  } catch (e: any) { toast("✗ " + (e.message || e)); G.voted = false; }
}

function ejectAnimation(slot: number | null, imp: boolean) {
  return new Promise<void>((res) => {
    if (slot === null) { splash("Không ai bị loại (hoà / skip)", "", "#fff", 34, "rgba(0,0,0,.35)"); return void sleep(2500).then(() => { hideSplash(); res(); }); }
    const e = entities[slot]; if (slot === G.slot) G.ghost = true; G.dead.add(slot);
    splash(NAMES[slot] + (imp ? " LÀ IMPOSTOR 🔪" : " KHÔNG phải Impostor 🧑‍🚀"), "", imp ? "#5f9" : "#f55", 34, "rgba(0,0,0,.35)");
    const a = (slot / 4) * Math.PI * 2;
    ejecting.cur = { e, t: 0, dx: Math.cos(a), dz: Math.sin(a), done: () => { e.out = true; e.g.visible = false; hideSplash(); res(); } };
  });
}
