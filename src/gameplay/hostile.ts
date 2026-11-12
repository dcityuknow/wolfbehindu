import * as THREE from "three";
import { entities, me, collide } from "../world/characters";
import { camera } from "../world/scene";
import { wallMeshes } from "../world/map";
import { tracer } from "../world/fx";
import { sfx } from "../audio";
import { GUNS, COMBAT, BOT_SPEED, type GunDef } from "../config";
import { W } from "../weaponState";
import { G } from "../state";
import { flashRed } from "../ui/hud";
import { $, show } from "../ui/dom";
import type { GunRig } from "../world/guns";
import type { Entity } from "../types";

/**
 * Đồng đội phản ứng khi bị người chơi bắn trúng:
 *  1) Lần đầu: hét "WHY YOU SHOT ME??", chất vấn vài câu, quay lại CHĨA SÚNG vào bạn (chưa bắn). Im lặng ~9s thì hạ súng.
 *  2) Bắn nhầm thêm lần nữa (sau khoảng ân hạn COMBAT.grace): bạn bị GÁN LÀ GIÁN ĐIỆP → cả đội thù địch, rượt và bắn bạn.
 *  3) Hết máu (COMBAT.playerHp) → bị xử bắn, ván kết thúc. Họp khẩn / sang lượt mới: mọi người hoà giải, reset.
 * Chỉ là phản ứng cục bộ — không đổi trạng thái on-chain (cái chết thật của đồng đội vẫn chỉ do gián điệp qua contract).
 */
interface M { mood: 0 | 1 | 2; t: number; since: number; q: number; cd: number; burst: number; rest: number; react: number; say: number }
const ms: M[] = entities.map(() => ({ mood: 0, t: 0, since: 0, q: 0, cd: 0, burst: 0, rest: 0, react: 0, say: 0 }));
let clock = 0, strikes = 0, lastStrike = -99, exposed = false;
export const busy = (i: number) => ms[i].mood > 0;

const ASK = ["Bạn điên à? Tôi là đồng đội mà!", "Sao lại bắn tôi? Giải thích đi!", "Có chuyện gì vậy?! Bỏ súng xuống!", "Hả?! Bạn vừa bắn tôi đấy!", "Đừng nói là bạn... Đứng yên đó!", "Tôi chưa làm gì cả! Tại sao?!"];
const ALARM = ["NÓ LÀ GIÁN ĐIỆP!", "Tôi biết ngay mà! Bắn nó!", "Hạ gián điệp! Nhanh lên!", "Ngươi bị lộ rồi!", "Đừng để nó chạy thoát!"];
const pick = (a: string[]) => a[(Math.random() * a.length) | 0];

/* ───────────── bong bóng thoại + giọng nói ───────────── */
const box = document.createElement("div"); box.id = "bubbles"; $("#hud").appendChild(box);
const bubs = entities.map(() => { const d = document.createElement("div"); d.className = "bub"; box.appendChild(d); return d; });
const wanted = document.createElement("div"); wanted.id = "wanted"; wanted.textContent = "🕵 BẠN BỊ GÁN LÀ GIÁN ĐIỆP — đồng đội đang bắn bạn!"; $("#hud").appendChild(wanted);
function speak(text: string, i: number, shout: boolean) {
  try {
    const ss = window.speechSynthesis; if (!ss) return; ss.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text) ? "vi-VN" : "en-US";
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

/* ───────────── phản ứng khi bị trúng đạn ───────────── */
export function onFriendlyHit(e: Entity) {
  if (e.i === G.slot || e.dead || e.out || G.ghost || G.phase !== "play") return;
  const m = ms[e.i]; m.since = 0;
  if (exposed) { if (m.mood < 2) rage(e, 0.2); return; }
  if (clock - lastStrike > COMBAT.grace) { strikes++; lastStrike = clock; if (strikes === 1) warn(e); else expose(e); }   // xả liên thanh trong khoảng ân hạn chỉ tính 1 lần
  else if (m.mood === 0) warn(e);
}
function warn(e: Entity) {
  const m = ms[e.i]; if (m.mood > 0) return;
  m.mood = 1; m.t = 0; m.q = 0; say(e.i, "WHY YOU SHOT ME??", true, true);
}
function rage(e: Entity, delay: number) {
  const m = ms[e.i]; m.mood = 2; m.react = delay + Math.random() * 0.7; m.burst = 0; m.rest = 0.3; m.cd = 0;
}
function expose(first: Entity) {
  exposed = true; wanted.style.display = "block";
  for (const e of entities) { if (e.i === G.slot || e.dead || e.out) continue; rage(e, e === first ? 0.15 : 0.3); }
  say(first.i, "Đúng là mày! Anh em, BẮN!", true, true);
  let n = 0; for (const e of entities) if (e !== first && e.i !== G.slot && !e.dead && !e.out && n++ < 3) say(e.i, pick(ALARM), false);
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
  rc.set(A, B); rc.far = d; return rc.intersectObjects(wallMeshes, false).length === 0;
}
const gunOf = (e: Entity): GunDef => { const r = e.g.userData.gunRig as GunRig; return GUNS.find((g) => g.id === r.cur) ?? GUNS[2]; };

function hurtPlayer(d: number) {
  if (G.phase !== "play" || W.hp <= 0) return;
  W.hp = Math.max(0, W.hp - d); flashRed();
  if (W.hp <= 0) executed();
}
function executed() {
  G.phase = "end"; clearTimeout(G.scheduleTimer); document.exitPointerLock(); wanted.style.display = "none";
  $("#et").textContent = "BỊ ĐỒNG ĐỘI XỬ BẮN";
  $("#ed").innerHTML = G.role === 1 ? "Gián điệp đã bị phát hiện và hạ gục ngay giữa đội hình." : "Bạn đã nổ súng vào chính đồng đội — và họ không tha cho bạn.<br>Niềm tin của cả đội tan vỡ trên hoang đảo.";
  show("#end");
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
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    e.rot = Math.atan2(dx, dz); e.aim += (1 - e.aim) * Math.min(1, dt * 8); e.pitch = Math.atan2(-(P.y + 1.2 - (e.y + 1.34)), d);
    m.t += dt; m.since += dt;
    if (m.mood === 1) { // cảnh giác: chĩa súng, hỏi han, chưa bắn
      if (m.q === 0 && m.t > 2.4) { m.q = 1; say(e.i, pick(ASK)); } else if (m.q === 1 && m.t > 5.2) { m.q = 2; say(e.i, pick(ASK)); }
      if (m.since > 9) { m.mood = 0; say(e.i, "Hừ… lần sau thì không tha đâu."); }
      continue;
    }
    if (m.react > 0) { m.react -= dt; continue; }   // vừa nhận ra: khựng một nhịp
    hostile.push({ e, d });
  }
  hostile.sort((a, b) => a.d - b.d);
  hostile.forEach(({ e, d }, k) => {   // chỉ 3 Bot gần nhất có thể nổ súng cùng lúc, số còn lại áp sát
    const m = ms[e.i], g = gunOf(e), dx = P.x - e.x, dz = P.z - e.z, los = clear(e, P);
    if (d > 10 || !los) { const sp = BOT_SPEED * 1.35; e.x += (dx / d) * sp * dt; e.z += (dz / d) * sp * dt; }
    else { const s = Math.sin(clock * 1.4 + e.i * 2) * 1.6 * dt; e.x += (-dz / d) * s; e.z += (dx / d) * s; }   // đứng bắn, lách ngang
    collide(e);
    if (k >= 3 || !los || d > 45) return;
    if (m.burst > 0) { m.cd -= dt; if (m.cd <= 0) { botShot(e, g, d); m.burst--; m.cd = 1 / (g.rate * (g.auto ? 0.55 : 0.6)); if (m.burst === 0) m.rest = 0.9 + Math.random() * 0.9; } }
    else { m.rest -= dt; if (m.rest <= 0) { m.burst = g.pellets > 1 ? 1 : g.auto ? 5 : 3; m.cd = 0; } }
  });
}
