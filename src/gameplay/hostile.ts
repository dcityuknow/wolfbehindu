import * as THREE from "three";
import { entities, me, collide } from "../world/characters";
import { walkTo } from "./walk";
import { losBlocked } from "../world/island";
import { camera } from "../world/scene";
import { wallMeshes } from "../world/map";
import { tracer } from "../world/fx";
import { sfx } from "../audio";
import { GUNS, COMBAT, BOT_SPEED, type GunDef } from "../config";
import { W } from "../weaponState";
import { G } from "../state";
import { flashRed } from "../ui/hud";
import { $, show } from "../ui/dom";
import { UI, ENDING } from "../story";
import { reportExecution, getRoom } from "../web3/chain";
import type { GunRig } from "../world/guns";
import type { Entity } from "../types";

/**
 * Squadmates react when the player shoots them:
 *  1) First time: they yell "WHY YOU SHOT ME??", grill you and swing their gun back to AIM at you (no shooting yet). Stay quiet ~9s and they lower it.
 *  2) Shoot a teammate again (after the COMBAT.grace window): you are MARKED AS THE SPY -> the whole squad turns hostile, chases and shoots you.
 *  3) Out of health (COMBAT.playerHp) -> you are executed. The death is RECORDED ON THE SMART CONTRACT (reportExecution) and the game ends at once,
 *     even though the real spy was never found. Emergency meeting / new round: before that point everyone makes peace and resets.
 * WITNESSES: only squadmates who actually SEE the shooter (close enough, inside their field of view, no wall in between) can accuse you.
 *  Everyone else who hears the shot just runs over to the victim and asks what happened (mood 3) — no accusation without a witness.
 *  If an accusation is already out and an investigator arrives and sees you, the witnesses' word is enough and they turn hostile too.
 * Combat itself is client-side; only the final death/game-over is written on-chain (a teammate's real death still only comes from the spy via the contract).
 */
interface M { mood: 0 | 1 | 2 | 3; ix: number; iz: number; t: number; since: number; q: number; cd: number; burst: number; rest: number; react: number; say: number }
const ms: M[] = entities.map(() => ({ mood: 0, ix: 0, iz: 0, t: 0, since: 0, q: 0, cd: 0, burst: 0, rest: 0, react: 0, say: 0 }));
let clock = 0, strikes = 0, lastStrike = -99, exposed = false;
export const busy = (i: number) => ms[i].mood > 0;

const ASK = ["Are you insane? I'm your teammate!", "Why would you shoot me? Explain!", "What's going on?! Put the gun down!", "Huh?! You just shot me!", "Don't tell me you're... Stay right there!", "I didn't do anything! Why?!"];
const ALARM = ["IT'S THE SPY!", "I knew it! Shoot him!", "Take down the spy! Hurry!", "You've been exposed!", "Don't let him get away!"];
const INQ = ["What happened here?!", "Who shot him?! Did anyone see?", "I heard gunshots! Is everyone okay?", "Somebody tell me what happened!"];
const OUCH = ["Ow! Who shot me?!", "Argh! Who did that?!", "I got hit! Did anyone see who it was?!"];
const pick = (a: string[]) => a[(Math.random() * a.length) | 0];

/* ───────────── bong bóng thoại + giọng nói ───────────── */
const box = document.createElement("div"); box.id = "bubbles"; $("#hud").appendChild(box);
const bubs = entities.map(() => { const d = document.createElement("div"); d.className = "bub"; box.appendChild(d); return d; });
const wanted = document.createElement("div"); wanted.id = "wanted"; wanted.textContent = UI.wanted; $("#hud").appendChild(wanted);
function speak(text: string, i: number, shout: boolean) {
  try {
    const ss = window.speechSynthesis; if (!ss) return; ss.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US";
    u.pitch = shout ? 1.4 : 0.7 + ((i * 0.37) % 0.9); u.rate = shout ? 1.25 : 1.1; ss.speak(u);
  } catch { /* không có giọng đọc */ }
}
function say(i: number, text: string, shout = false, voice = false) {
  ms[i].say = shout ? 3.2 : 2.8; bubs[i].textContent = text; bubs[i].classList.toggle("shout", shout); if (voice) speak(text, i, shout);
}
const V = new THREE.Vector3();
function updateBubbles(dt: number) {
  for (const e of entities) {
    const m = ms[e.i], b = bubs[e.i];
    if (m.say <= 0 || e.dead || e.out || !e.g.visible) { b.style.display = "none"; m.say = Math.max(0, m.say - dt); continue; }
    m.say -= dt; V.set(e.x, e.y + 2.5, e.z).project(camera);
    if (V.z > 1) { b.style.display = "none"; continue; }
    b.style.display = "block"; b.style.left = (V.x * 0.5 + 0.5) * innerWidth + "px"; b.style.top = (-V.y * 0.5 + 0.5) * innerHeight + "px";
  }
}

/* ───────────── witnesses & reactions ───────────── */
const WIT = { range: 16, cone: 0.15, hear: 40 };   // sight range (m) · cos of the half field-of-view (~81°) · gunshot hearing range (m)
/** Can squadmate `w` see player `p` right now? (alive, awake, near, facing them, no wall in between) */
function sees(w: Entity, p: Entity) {
  if (w.dead || w.out || w.stun > 0) return false;
  const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 1;
  if (d > WIT.range) return false;
  if ((dx * Math.sin(w.rot) + dz * Math.cos(w.rot)) / d < WIT.cone) return false;   // behind their back / outside their view
  return clear(w, p);
}
const witnesses = (skip: number) => { const P = me(); return entities.filter((w) => w.i !== G.slot && w.i !== skip && sees(w, P)); };
function investigate(w: Entity, tx: number, tz: number) {
  const m = ms[w.i]; if (m.mood !== 0 || w.dead || w.out) return;
  m.mood = 3; m.ix = tx; m.iz = tz; m.t = 0; m.q = 0; m.since = 0;
}

export function onFriendlyHit(e: Entity) {
  if (e.i === G.slot || e.dead || e.out || G.ghost || G.phase !== "play") return;
  const wit = witnesses(-1), isW = (x: Entity) => wit.includes(x);
  if (wit.length === 0) {   // nobody saw who did it: no accusation, only confusion + people running over to ask
    if (ms[e.i].mood === 0) { say(e.i, pick(OUCH), true, true); investigate(e, e.x, e.z); }
    for (const o of entities) if (o !== e && o.i !== G.slot && Math.hypot(o.x - e.x, o.z - e.z) < WIT.hear) investigate(o, e.x, e.z);
    return;
  }
  wit.forEach((w) => (ms[w.i].since = 0));
  if (exposed) { wit.forEach((w) => { if (ms[w.i].mood < 2) rage(w, 0.2); }); }
  else if (clock - lastStrike > COMBAT.grace) { strikes++; lastStrike = clock; if (strikes === 1) wit.forEach((w) => warn(w, w === e)); else expose(wit[0], wit); }   // spraying within the grace window counts once
  else wit.forEach((w) => { if (ms[w.i].mood === 0) warn(w, w === e); });
  for (const o of entities) if (o !== e && o.i !== G.slot && !isW(o) && Math.hypot(o.x - e.x, o.z - e.z) < WIT.hear) investigate(o, e.x, e.z);   // those who didn't see run over and ask
}
/** The player (the spy) killed someone for real: anyone who saw it exposes them on the spot; unseen kills stay secret. */
export function onKillSeen(v: Entity): boolean {
  if (G.ghost || G.phase !== "play") return false;
  const wit = witnesses(v.i); if (!wit.length) return false;
  strikes = Math.max(strikes, 2); expose(wit[0], wit); return true;
}
/** A body dropped and nobody saw who did it: those who heard run over to the body and ask around (no accusation). */
export function onUnseenDeath(v: Entity) {
  for (const o of entities) if (o !== v && o.i !== G.slot && !o.dead && !o.out && Math.hypot(o.x - v.x, o.z - v.z) < WIT.hear) investigate(o, v.x, v.z);
}
function warn(e: Entity, victim: boolean) {
  const m = ms[e.i]; if (m.mood > 0 && m.mood !== 3) return;
  m.mood = 1; m.t = 0; m.q = 0; say(e.i, victim ? UI.whyShot : pick(["Hey! Did you just shoot him?!", "What was that?! Drop your weapon!"]), true, true);
}
function rage(e: Entity, delay: number) {
  const m = ms[e.i]; m.mood = 2; m.react = delay + Math.random() * 0.7; m.burst = 0; m.rest = 0.3; m.cd = 0;
}
function expose(first: Entity, wit: Entity[]) {
  exposed = true; wanted.style.display = "block";
  for (const e of wit) rage(e, e === first ? 0.15 : 0.3);
  say(first.i, UI.firstAccuse, true, true);
  let n = 0; for (const e of wit) if (e !== first && n++ < 3) say(e.i, pick(ALARM), false);
  for (const o of entities) if (!wit.includes(o) && o.i !== G.slot && !o.dead && !o.out && Math.hypot(o.x - first.x, o.z - first.z) < WIT.hear) investigate(o, first.x, first.z);   // the rest run over to hear it from the witnesses
}

/** Họp khẩn / sang lượt: mọi người hoà giải, quên hết. */
export function hostileReset() {
  strikes = 0; lastStrike = -99; exposed = false; wanted.style.display = "none";
  for (const m of ms) { m.mood = 0; m.say = 0; m.burst = 0; }
  for (const b of bubs) b.style.display = "none";
  try { window.speechSynthesis?.cancel(); } catch { /* */ }
  for (const e of entities) if (e.i !== G.slot) { e.aim = 0; e.pitch = 0; }
}

/* ───────────── Bot thù địch ───────────── */
const rc = new THREE.Raycaster(), A = new THREE.Vector3(), B = new THREE.Vector3(), MZ = new THREE.Vector3(), T = new THREE.Vector3();
function clear(e: Entity, p: Entity) {
  A.set(e.x, e.y + 1.3, e.z); B.set(p.x, p.y + 1.2, p.z); const d = A.distanceTo(B); B.sub(A).normalize();
  if (losBlocked(A.x, A.y, A.z, A.x + B.x * d, A.y + B.y * d, A.z + B.z * d)) return false;   // đồi/núi chắn
  rc.set(A, B); rc.far = d; return rc.intersectObjects(wallMeshes, false).length === 0;
}
const gunOf = (e: Entity): GunDef => { const r = e.g.userData.gunRig as GunRig; return GUNS.find((g) => g.id === r.cur) ?? GUNS[2]; };

function hurtPlayer(d: number) {
  if (G.phase !== "play" || W.hp <= 0) return;
  W.hp = Math.max(0, W.hp - d); flashRed();
  if (W.hp <= 0) executed();
}
/** Out of health: the squad executes you. Game over right now; the death is written to the contract. */
export const exile = () => executed(ENDING.absent);   // missed a called meeting -> branded the spy, same recorded ending
function executed(S: { title: string; crew: string; spy: string; over: string } = ENDING.shot) {
  G.phase = "end"; G.call = null; clearTimeout(G.scheduleTimer); document.exitPointerLock(); wanted.style.display = "none";
  $("#et").textContent = S.title;
  $("#ed").innerHTML = (G.role === 1 ? S.spy : S.crew) + `<br><br><b>${S.over}</b><br><br><span id="chainst"></span>`;
  show("#end");
  void recordDeath();
}
const short = (h: string) => (h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : h);
async function recordDeath() {
  const st = $("#chainst"); st.textContent = UI.chainRecording;
  try {
    const r = await reportExecution();
    st.textContent = UI.chainDone(short(String(r?.hash ?? "")));
  } catch {
    // The tx may have landed even if the wait failed: if the room is already Finished with Winner.FriendlyFire (3), it is recorded.
    try { const r = await getRoom(); if (Number(r.phase) === 4 && Number(r.winner) === 3) { st.textContent = UI.chainDone(""); return; } } catch { /* ignore */ }
    st.innerHTML = UI.chainFail + ` <button id="chainRetry" class="g">${UI.retry}</button>`;
    $("#chainRetry").onclick = () => void recordDeath();
  }
}
function botShot(e: Entity, g: GunDef, d: number) {
  const P = me(), r = e.g.userData.gunRig as GunRig, model = r.models[r.cur]!;
  model.updateWorldMatrix(true, false); MZ.copy(model.userData.muzzle as THREE.Vector3).applyMatrix4(model.matrixWorld);
  e.kick = 1; const pHit = Math.max(0.12, Math.min(0.55, 0.62 - d * 0.018)) / (g.pellets > 1 ? 2.5 : 1);
  for (let k = 0; k < g.pellets; k++) {
    const hit = Math.random() < pHit; T.set(P.x, P.y + 1.2, P.z);
    if (!hit) T.add(B.set((Math.random() - 0.5) * (1 + d * 0.12), (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * (1 + d * 0.12)));
    tracer(MZ, T); if (hit) hurtPlayer(g.dmg * COMBAT.botDmg);
  }
  sfx.shot(g.id, Math.max(0.12, 0.8 - d / 70));
}

export function updateHostile(dt: number) {
  clock += dt; updateBubbles(dt);
  if (G.ghost || G.phase !== "play") return;
  const P = me(), hostile: { e: Entity; d: number }[] = [];
  for (const e of entities) {
    if (e.i === G.slot) continue;
    const m = ms[e.i];
    if (e.dead || e.out) { m.mood = 0; continue; }
    e.kick = Math.max(0, e.kick - dt * 7);
    if (m.mood === 0) { e.aim += (0 - e.aim) * Math.min(1, dt * 6); continue; }
    if (e.stun > 0) continue;
    if (m.mood === 3) {   // investigating: run to the spot, ask around, go back to normal (or join in if an accusation is out and they see the culprit)
      e.aim += (0 - e.aim) * Math.min(1, dt * 6); m.t += dt;
      if (exposed && sees(e, P)) { say(e.i, pick(ALARM), true, true); rage(e, 0.3); continue; }
      const ix = m.ix - e.x, iz = m.iz - e.z, id = Math.hypot(ix, iz);
      if (id > 3.2 && m.t < 25) walkTo(e, m.ix, m.iz, dt, BOT_SPEED * 1.5);
      else { if (m.q === 0) { m.q = 1; m.t = 0; say(e.i, pick(INQ), false); } else if (m.t > 6) m.mood = 0; }
      continue;
    }
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    e.rot = Math.atan2(dx, dz); e.aim += (1 - e.aim) * Math.min(1, dt * 8); e.pitch = Math.atan2(-(P.y + 1.2 - (e.y + 1.34)), d);
    m.t += dt; m.since += dt;
    if (m.mood === 1) { // cảnh giác: chĩa súng, hỏi han, chưa bắn
      if (m.q === 0 && m.t > 2.4) { m.q = 1; say(e.i, pick(ASK)); } else if (m.q === 1 && m.t > 5.2) { m.q = 2; say(e.i, pick(ASK)); }
      if (m.since > 9) { m.mood = 0; say(e.i, "Hmph… next time I won't let it slide."); }
      continue;
    }
    if (m.react > 0) { m.react -= dt; continue; }   // vừa nhận ra: khựng một nhịp
    hostile.push({ e, d });
  }
  hostile.sort((a, b) => a.d - b.d);
  hostile.forEach(({ e, d }, k) => {   // chỉ 3 Bot gần nhất có thể nổ súng cùng lúc, số còn lại áp sát
    const m = ms[e.i], g = gunOf(e), dx = P.x - e.x, dz = P.z - e.z, los = clear(e, P);
    if (d > 10 || !los) { walkTo(e, P.x, P.z, dt, BOT_SPEED * 1.35, 0.8); }
    else { const s = Math.sin(clock * 1.4 + e.i * 2) * 1.6 * dt; e.x += (-dz / d) * s; e.z += (dx / d) * s; }   // đứng bắn, lách ngang
    collide(e);
    if (k >= 3 || !los || d > 45) return;
    if (m.burst > 0) { m.cd -= dt; if (m.cd <= 0) { botShot(e, g, d); m.burst--; m.cd = 1 / (g.rate * (g.auto ? 0.55 : 0.6)); if (m.burst === 0) m.rest = 0.9 + Math.random() * 0.9; } }
    else { m.rest -= dt; if (m.rest <= 0) { m.burst = g.pellets > 1 ? 1 : g.auto ? 5 : 3; m.cd = 0; } }
  });
}
