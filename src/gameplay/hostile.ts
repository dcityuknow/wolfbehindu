import { playBark } from "../meetVoice";
import { deathFlow } from "./gameover";
import * as THREE from "three";
import { entities, me, collide, BOT_GUNS } from "../world/characters";
import { throwBotGrenade } from "./combat";
import { walkTo } from "./walk";
import { losBlocked, walkable, groundAt } from "../world/island";
import { camera } from "../world/scene";
import { wallMeshes, WALLS } from "../world/map";
import { tracer } from "../world/fx";
import { sfx } from "../audio";
import { GUNS, COMBAT, BOT_SPEED, type GunDef, type GunId } from "../config";
import { W } from "../weaponState";
import { G } from "../state";
import { flashRed } from "../ui/hud";

import { $ } from "../ui/dom";
import { UI, ENDING } from "../story";
import { reportExecution, getRoom } from "../web3/chain";
import { equipGun, type GunRig } from "../world/guns";
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
interface M { mood: 0 | 1 | 2 | 3 | 4; ix: number; iz: number; t: number; since: number; q: number; cd: number; burst: number; rest: number; react: number; say: number; nades: number; nc: number; sw: number; mv: number; mvT: number; sd: number; cov: [number, number] | null; am: Record<string, number>; rl: number; rlOn: boolean; swt: number; st: number; spot: number; hint: number; hp: number; base: number; hurt: boolean }
const ms: M[] = entities.map(() => ({ mood: 0, ix: 0, iz: 0, t: 0, since: 0, q: 0, cd: 0, burst: 0, rest: 0, react: 0, say: 0, nades: 3, nc: 0, sw: 0, mv: 0, mvT: 0, sd: 1, cov: null, am: { pistol: 12, rifle: 30, sniper: 5 }, rl: 0, rlOn: false, swt: 0, st: 0, spot: 0, hint: NaN, hp: 0, base: 0, hurt: false }));
/** mood 4 = TÌM KIẾM: bị bắn / thấy đường đạn lướt qua → nhìn ngay về hướng đạn bay tới, rồi quét xung quanh từ XA (ngước lên đỉnh/chân trời) tới GẦN (hạ mắt xuống chân), thấy người bắn thì bắn trả. */
let clock = 0, strikes = 0, lastStrike = -99, exposed = false, lastNade = -99;
export const busy = (i: number) => ms[i].mood > 0;

const ASK = ["Are you insane? I'm your teammate!", "Why would you shoot me? Explain!", "What's going on?! Put the gun down!", "Huh?! You just shot me!", "Don't tell me you're... Stay right there!", "I didn't do anything! Why?!"];
const ALARM = ["IT'S THE SPY!", "I knew it! Shoot him!", "Take down the spy! Hurry!", "You've been exposed!", "Don't let him get away!"];
const INQ = ["What happened here?!", "Who shot him?! Did anyone see?", "I heard gunshots! Is everyone okay?", "Somebody tell me what happened!"];
const OUCH = ["Ow! Who shot me?!", "Argh! Who did that?!", "I got hit! Did anyone see who it was?!"];
const NADE = ["Zama grenade! Take cover!", "Zama frag out!", "Zama, eat this!", "Zama fire in the hole!", "Zama grenade, get down!", "Zama incoming! Run!", "Zama, catch this one!", "Zama bomb's away! Move it!", "Zama grenade out! Scatter!", "Zama, say goodbye!", "Zama, boom time! Take cover!", "Zama frag in the air! Down!"];   // luôn mở đầu bằng "Zama", nhiều kiểu hô
let lastNadeLine = -1;
/** Chọn câu hô lựu đạn, không bao giờ lặp lại câu vừa hô. */
function nadeLine() { let k: number; do { k = (Math.random() * NADE.length) | 0; } while (k === lastNadeLine && NADE.length > 1); lastNadeLine = k; return NADE[k]; }
const SRCH = ["Contact! Where's that coming from?!", "Someone's shooting at us! Find him!", "Take cover! Where is he?!", "I'm taking fire! Spot the shooter!"];
const SPOT = ["I see him! Up there!", "There he is! Return fire!", "Found you! Open fire!", "Got eyes on the shooter!"];
const pick = (a: string[]) => a[(Math.random() * a.length) | 0];

/* ───────────── bong bóng thoại + giọng nói ───────────── */
const box = document.createElement("div"); box.id = "bubbles"; $("#hud").appendChild(box);
const bubs = entities.map(() => { const d = document.createElement("div"); d.className = "bub"; box.appendChild(d); return d; });
const wanted = document.createElement("div"); wanted.id = "wanted"; wanted.textContent = UI.wanted; $("#hud").appendChild(wanted);
function speak(text: string, i: number, shout: boolean) {
  try { playBark(i, text, shout, shout ? 1.4 : 0.7 + ((i * 0.37) % 0.9)); } catch { /* không có âm thanh */ }   // CÙNG giọng Kokoro của lính đó như mọi chỗ khác (thiếu file mới rơi về giọng trình duyệt)
}
function say(i: number, text: string, shout = false, voice: boolean | string = false) {   // voice = chuỗi: câu TIẾNG ANH để đọc (chữ hiển thị có thể là bản dịch)
  ms[i].say = shout ? 3.2 : 2.8; bubs[i].textContent = text; bubs[i].classList.toggle("shout", shout); if (voice) speak(typeof voice === "string" ? voice : text, i, shout);
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

/* ───────────── Bot KHÔN: bị bắn / thấy đường đạn thì tìm người bắn ───────────── */
const SEARCH = { dur: 12, lookHint: 1.4, turn: 3.4, fov: 0.78, vfov: 0.8, hintWindow: 1.5 };   // giây tìm · giây nhìn thẳng hướng đạn · rad/s xoay đầu · nửa góc nhìn ngang / dọc (rad) · hướng đạn còn "mới" trong (giây)
let lastFire = -99, shotYaw = NaN, shotPitch = 0, shotT = -99;
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** Bot `e` chuyển sang tìm kiếm. hurt = chính nó bị bắn trúng / đạn sượt qua (→ thấy người bắn là bắn trả ngay). */
function alertBot(e: Entity, hurt: boolean) {
  const m = ms[e.i]; if (e.dead || e.out || e.stun > 0 || e.i === G.slot || G.call) return;
  if (m.mood === 2) return;                       // đang đánh nhau rồi
  if (m.mood === 1) { if (hurt) m.hurt = true; return; }   // đang chĩa súng cảnh cáo: đã nhìn thẳng người chơi
  const fresh = clock - shotT < SEARCH.hintWindow;
  if (m.mood !== 4) { m.mood = 4; m.st = 0; m.spot = 0; m.base = e.rot; m.t = 0; if (hurt || Math.random() < 0.5) say(e.i, pick(SRCH), true, false); }
  else m.st = Math.min(m.st, SEARCH.lookHint * 0.5);   // bị bắn thêm: quay phắt lại nhìn hướng đạn
  if (fresh && Number.isFinite(shotYaw)) { m.hint = shotYaw; m.hp = shotPitch; }
  if (hurt) m.hurt = true;
}
/** Người chơi nổ súng: ghi nhớ hướng đạn bay; bot bị trúng / bị đạn lướt gần thì tìm người bắn. O = đầu nòng/mắt, D = hướng (chuẩn hoá), len = quãng đạn đi. */
export function onPlayerShot(O: THREE.Vector3, D: THREE.Vector3, len: number) {
  if (G.phase !== "play" || G.ghost) return;
  const h = Math.hypot(D.x, D.z);
  lastFire = clock; shotT = clock; shotYaw = h > 0.05 ? Math.atan2(-D.x, -D.z) : NaN; shotPitch = Math.atan2(D.y, h);   // nhìn ngược chiều đạn: bắn từ trên cao xuống → ngước lên
  for (const e of entities) {
    if (e.i === G.slot || e.dead || e.out || e.stun > 0 || e.seat >= 0 || sees(e, me())) continue;   // ai đang thấy người chơi ngay gần thì đi theo luật nhân chứng (cảnh cáo / lộ), không phải tìm kiếm
    const qx = e.x - O.x, qy = e.y + 1 - O.y, qz = e.z - O.z, t = Math.max(0, Math.min(len, qx * D.x + qy * D.y + qz * D.z));
    const dist = Math.hypot(qx - D.x * t, qy - D.y * t, qz - D.z * t);
    if (dist < 3.5) alertBot(e, true); else if (dist < 10) alertBot(e, false);   // đạn sượt qua mặt: bị tấn công · lướt gần: thấy đường đạn
  }
}
/** Bot đang tìm: xoay nhìn hướng đạn → quét xa-đến-gần; có người chơi trong tầm mắt (xa mấy cũng được, miễn không bị che) thì dồn dần "độ phát hiện". */
function searchBot(e: Entity, m: M, P: Entity, dt: number) {
  m.st += dt;
  if (m.st > SEARCH.dur) { m.mood = 0; m.hurt = false; m.spot = 0; m.hint = NaN; return; }
  e.aim += ((m.hurt ? 0.8 : 0.4) - e.aim) * Math.min(1, dt * 6);
  const hasHint = Number.isFinite(m.hint), u = Math.max(0, m.st - (hasHint ? SEARCH.lookHint : 0)) / (SEARCH.dur - (hasHint ? SEARCH.lookHint : 0));
  let ty: number, tp: number;
  if (hasHint && m.st < SEARCH.lookHint) { ty = m.hint; tp = m.hp; }                                                    // 1) nhìn thẳng hướng đạn tới (ngước lên nếu bị bắn từ trên cao)
  else if (hasHint && u < 0.55) { ty = m.hint + Math.sin(u * Math.PI * 5) * 1.0; tp = m.hp + (0.1 - m.hp) * (u / 0.55); }   // 2) quét quanh hướng đạn, hạ mắt dần
  else { const v = hasHint ? (u - 0.55) / 0.45 : u; ty = (hasHint ? m.hint : m.base) + v * Math.PI * 2 * 1.5 * (e.i % 2 ? 1 : -1); tp = -0.25 + 0.75 * v; }   // 3) quét cả vòng, xa (ngẩng) → gần (cúi)
  const step = SEARCH.turn * dt; e.rot += Math.max(-step, Math.min(step, angDiff(ty, e.rot)));
  e.pitch += (tp + Math.sin(m.st * 1.7) * 0.05 - e.pitch) * Math.min(1, dt * 4);
  if (m.hurt && Number.isFinite(m.hint) && m.st > SEARCH.lookHint * 0.7) {   // đã bị bắn: không đứng yên mà tiến về phía người bắn, chạy zig-zag cho khó bị bắn trúng, vừa đi vừa quét mắt
    const sn = Math.sin(m.st * 2.4) * 5, r0 = e.rot;
    walkTo(e, e.x + Math.sin(m.hint) * 18 + Math.cos(m.hint) * sn, e.z + Math.cos(m.hint) * 18 - Math.sin(m.hint) * sn, dt, BOT_SPEED * 1.2, 1.5); e.rot = r0;
  }
  const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  const fwd = (dx * Math.sin(e.rot) + dz * Math.cos(e.rot)) / d, elev = Math.atan2(P.y + 1.2 - (e.y + 1.34), d);
  const inView = d < 5 || (fwd > Math.cos(SEARCH.fov) && Math.abs(elev + e.pitch) < SEARCH.vfov);   // pitch dương = cúi, nên ngước lên = -pitch
  if (inView && clear(e, P)) {   // không bị đồi/nhà/cây che → thấy; càng xa càng lâu mới nhận ra, vừa nổ súng (chớp lửa nòng) thì lộ nhanh
    m.spot += dt * (2.4 / (1 + d / 90)) * (clock - lastFire < 1.2 ? 2.6 : 1) * (m.hurt ? 1.4 : 1);
    if (m.spot >= 1) spotted(e, m, P);
  } else m.spot = Math.max(0, m.spot - dt * 0.7);
}
function spotted(e: Entity, m: M, P: Entity) {
  m.spot = 0; say(e.i, pick(SPOT), true, true);
  const hurt = m.hurt || exposed; m.hurt = false; m.hint = NaN;
  if (hurt) rage(e, 0.2); else { m.mood = 0; warn(e, false); }   // bị bắn / đã lộ → bắn trả ngay · chỉ thấy đường đạn → chĩa súng hỏi
  for (const o of entities) {   // báo đồng đội đang tìm: nhìn về phía người bắn
    const mo = ms[o.i]; if (o === e || mo.mood !== 4 || Math.hypot(o.x - e.x, o.z - e.z) > 40) continue;
    const dd = Math.hypot(P.x - o.x, P.z - o.z) || 1; mo.hint = Math.atan2(P.x - o.x, P.z - o.z); mo.hp = Math.atan2(-(P.y + 1.2 - (o.y + 1.34)), dd); mo.st = 0.2; mo.spot = Math.max(mo.spot, 0.5);
  }
}

export function onFriendlyHit(e: Entity) {
  if (e.i === G.slot || e.dead || e.out || G.ghost || G.phase !== "play") return;
  const wit = witnesses(-1), isW = (x: Entity) => wit.includes(x);
  if (wit.length === 0) {   // nobody saw who did it: no accusation, only confusion + people running over to ask
    if (ms[e.i].mood <= 1 || ms[e.i].mood === 3) { say(e.i, pick(OUCH), true, true); alertBot(e, true); } else if (ms[e.i].mood === 4) alertBot(e, true);
    for (const o of entities) if (o !== e && o.i !== G.slot && Math.hypot(o.x - e.x, o.z - e.z) < WIT.hear) alertBot(o, false);   // ai nghe tiếng súng cũng nhìn quanh tìm người bắn
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
  m.mood = 1; m.t = 0; m.q = 0; say(e.i, victim ? UI.whyShot : pick(["Hey! Did you just shoot him?!", "What was that?! Drop your weapon!"]), true, victim ? "WHY YOU SHOT ME??" : true);
}
function rage(e: Entity, delay: number) {
  const m = ms[e.i]; m.mood = 2; m.react = delay + Math.random() * 0.7; m.burst = 0; m.rest = 0.3; m.cd = 0; m.nc = Math.max(m.nc, 3 + Math.random() * 4);
}
function expose(first: Entity, wit: Entity[]) {
  exposed = true; wanted.style.display = "block";
  for (const e of wit) rage(e, e === first ? 0.15 : 0.3);
  say(first.i, UI.firstAccuse, true, "That's him! Squad, FIRE!");
  let n = 0; for (const e of wit) if (e !== first && n++ < 3) say(e.i, pick(ALARM), false);
  for (const o of entities) if (!wit.includes(o) && o.i !== G.slot && !o.dead && !o.out && Math.hypot(o.x - first.x, o.z - first.z) < WIT.hear) investigate(o, first.x, first.z);   // the rest run over to hear it from the witnesses
}

/** Họp khẩn / sang lượt: mọi người hoà giải, quên hết. */
export function hostileReset() {
  lastFire = shotT = lastNade = -99; shotYaw = NaN;
  strikes = 0; lastStrike = -99; exposed = false; wanted.style.display = "none";
  for (const m of ms) { m.mood = 0; m.say = 0; m.burst = 0; m.hurt = false; m.spot = 0; m.hint = NaN; m.nades = 3; m.nc = 0; m.sw = 0; m.mv = 0; m.mvT = 0; m.cov = null; m.am = { pistol: 12, rifle: 30, sniper: 5 }; m.rl = 0; m.rlOn = false; m.swt = 0; }
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
const gunOf = (e: Entity): GunDef => { const r = e.g.userData.gunRig as GunRig; return GUNS.find((g) => g.id === r.cur) ?? GUNS[1]; };

export function hurtPlayer(d: number) {
  if (G.phase !== "play" || W.hp <= 0) return;
  W.hp = Math.max(0, W.hp - d); flashRed(d);
  if (W.hp <= 0) executed();
}
/** Out of health: the squad executes you. Game over right now; the death is written to the contract. */
export const exile = () => executed(ENDING.absent);   // missed a called meeting -> branded the spy, same recorded ending
function executed(S: { title: string; crew: string; spy: string; over: string } = ENDING.shot) {
  const fall = G.phase === "play";   // vắng mặt buổi họp (exile) thì không có cảnh ngã
  G.phase = "end"; G.call = null; clearTimeout(G.scheduleTimer); document.exitPointerLock(); wanted.style.display = "none";
  void deathFlow({
    title: S.title, desc: (G.role === 1 ? S.spy : S.crew) + `<br><br><b>${S.over}</b>`, fall,
    record: recordDeath, recording: UI.chainRecording, done: (h) => UI.chainDone(h), doneRadio: false, fail: UI.chainFail, retry: UI.retry,
  });
}
const short = (h: string) => (h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : h);
/** Ghi cái chết lên hợp đồng; trả về tx rút gọn. Ném lỗi nếu thất bại (deathFlow hiện nút Thử lại). */
async function recordDeath(): Promise<string> {
  try { const r = await reportExecution(); return String(r?.hash ?? ""); }
  catch (e) {
    // The tx may have landed even if the wait failed: if the room is already Finished with Winner.FriendlyFire (3), it is recorded.
    try { const r = await getRoom(); if (Number(r.phase) === 4 && Number(r.winner) === 3) return ""; } catch { /* ignore */ }
    throw e;
  }
}
const _cv = { x: 0, y: 0, z: 0 } as unknown as Entity;
/** Chỗ nấp gần nhất (thân cây / đá / tường trong 16 m) mà đứng sau nó thì người chơi không nhìn thấy; null nếu không có. */
function findCover(e: Entity, P: Entity): [number, number] | null {
  let best: [number, number] | null = null, bd = 1e9;
  for (const [x, z, hx, hz] of WALLS) {
    const dd = Math.hypot(x - e.x, z - e.z); if (dd > 16 || dd < 0.8 || dd >= bd) continue;
    const ax = x - P.x, az = z - P.z, al = Math.hypot(ax, az) || 1; if (al < 5) continue;
    const off = Math.max(hx, hz) + 0.9, cx = x + (ax / al) * off, cz = z + (az / al) * off;   // điểm đứng ngay sau vật cản, nhìn từ người chơi
    if (!walkable(cx, cz)) continue;
    _cv.x = cx; _cv.z = cz; _cv.y = groundAt(cx, cz);
    if (clear(_cv, P)) continue;   // ở đó vẫn bị nhìn thấy → không phải chỗ nấp
    best = [cx, cz]; bd = dd;
  }
  return best;
}
/** Đổi súng: cất khẩu đang cầm, rút khẩu mới (hoạt ảnh do poseFull lo theo userData.gunId — mất ~0,6 s, không bắn được trong lúc đổi). */
function swapGun(e: Entity, m: M, r: GunRig, want: GunId) {
  e.g.userData.gunId = want; equipGun(r, want); m.sw = 0.65; m.burst = 0; m.rest = Math.max(m.rest, 0.25);
}
function botShot(e: Entity, g: GunDef, d: number, acc = 1) {
  const P = me(), r = e.g.userData.gunRig as GunRig, model = r.models[r.cur]!;
  model.updateWorldMatrix(true, false); MZ.copy(model.userData.muzzle as THREE.Vector3).applyMatrix4(model.matrixWorld);
  e.kick = 1; const pHit = g.id === "sniper" ? Math.max(0.3, 0.8 - d * 0.0025) : Math.max(d > 60 ? 0.05 : 0.12, Math.min(0.55, 0.62 - d * 0.018)) / (g.pellets > 1 ? 2.5 : 1);   // súng ngắm: ngắm kỹ nên trúng nhiều hơn, xa mấy cũng đáng sợ
  for (let k = 0; k < g.pellets; k++) {
    const hit = Math.random() < pHit * acc; T.set(P.x, P.y + 1.2, P.z);   // vừa chạy vừa bắn thì kém chính xác hơn đứng ngắm
    if (!hit) T.add(B.set((Math.random() - 0.5) * (1 + d * 0.12), (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * (1 + d * 0.12)));
    tracer(MZ, T); if (hit) hurtPlayer(g.dmg * COMBAT.botDmg);
  }
  sfx.shot(g.id, g.id === "sniper" ? Math.max(0.3, 1 - d / 220) : Math.max(0.12, 0.8 - d / 70));
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
    if (m.mood === 4) { searchBot(e, m, P, dt); continue; }
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
  hostile.forEach(({ e, d }, k) => {   // bot thù địch: vừa chạy vừa bắn, biết nấp, đổi súng AK / súng ngắn / súng ngắm, ném lựu đạn
    const m = ms[e.i], r = e.g.userData.gunRig as GunRig, prim = BOT_GUNS[(e.i - 1) % BOT_GUNS.length], los = clear(e, P), dx = P.x - e.x, dz = P.z - e.z, ux = dx / (d || 1), uz = dz / (d || 1);
    const under = clock - lastFire < 2.2 || m.hurt;   // người chơi vừa nổ súng quanh đây / bot này vừa bị bắn
    const RUN = BOT_SPEED * 1.35, mag = (id: GunId) => GUNS.find((x) => x.id === id)!.mag;
    m.sw = Math.max(0, m.sw - dt); m.swt -= dt; m.rl = Math.max(0, m.rl - dt);
    /* 1) NẠP ĐẠN / ĐỔI SÚNG linh hoạt: hết đạn thì rút súng ngắn (60%) hoặc nạp lại; xa → súng ngắm, tầm trung → AK, sát mặt → súng ngắn */
    if (m.rlOn) { if (m.rl <= 0) { m.rlOn = false; m.am[r.cur] = mag(r.cur); } }
    else if (m.sw <= 0) {
      if ((m.am[r.cur] ?? 1) <= 0) {
        if (r.cur !== "pistol" && m.am.pistol > 0 && Math.random() < 0.6) { swapGun(e, m, r, "pistol"); say(e.i, pick(["Switching!", "Out of ammo — sidearm!", "Cover me — pistol!"]), false, false); }
        else { m.rlOn = true; m.rl = (GUNS.find((x) => x.id === r.cur)?.reload ?? 2) * 0.8; if (Math.random() < 0.6) say(e.i, pick(["Reloading!", "Changing mag!", "Reloading — keep him busy!"]), false, false); }
      } else if (m.swt <= 0) {
        m.swt = 0.8 + Math.random() * 0.8;
        const cur = r.cur;
        const want: GunId = cur === "pistol" ? (d > 12 || m.am.pistol <= 0 ? "rifle" : "pistol")
          : cur === "sniper" ? (d < 48 ? "rifle" : "sniper")
          : prim === "sniper" && d > 58 ? "sniper" : d < 7 && m.am.pistol > 0 ? "pistol" : "rifle";
        if (want !== cur) swapGun(e, m, r, want);
      }
    }
    const g = gunOf(e), cur = r.cur;
    /* 2) DI CHUYỂN KHI CHIẾN ĐẤU: tiến lên khi xa / mất dấu · lách ngang · lùi khi bị áp sát · chạy tới chỗ nấp khi bị bắn · thỉnh thoảng nhảy né */
    const minD = cur === "sniper" ? 30 : cur === "pistol" ? 3 : 8, maxD = cur === "sniper" ? 140 : cur === "pistol" ? 14 : 24;
    m.mvT -= dt;
    if (m.mvT <= 0) {
      if (!los || d > maxD) { m.mv = 0; m.mvT = 1 + Math.random() * 0.8; }
      else if (d < minD) { m.mv = 2; m.mvT = 0.8 + Math.random() * 0.8; }
      else {
        const cov = under && Math.random() < 0.4 ? findCover(e, P) : null;
        if (cov) { m.mv = 3; m.cov = cov; m.mvT = 2.2 + Math.random() * 1.6; if (Math.random() < 0.4) say(e.i, pick(["Taking cover!", "Get down!", "Cover! Cover!"]), false, false); }
        else { m.mv = 1; m.sd = Math.random() < 0.5 ? -1 : 1; m.mvT = 0.7 + Math.random() * 1.5; }
      }
    }
    const ex0 = e.x, ez0 = e.z;
    if (m.mv === 0) { walkTo(e, P.x, P.z, dt, RUN, d > 40 ? 2.5 : 0.8); if (los && d < 45) e.rot = Math.atan2(dx, dz); }   // chạy áp sát, thân vẫn hướng về người chơi khi đã thấy
    else if (m.mv === 3 && m.cov) {
      if (walkTo(e, m.cov[0], m.cov[1], dt, RUN, 1.5) < 1) { if (los) m.mvT = 0; }   // tới nơi mà vẫn bị thấy thì đổi chiến thuật
      else if (los && d < 45) e.rot = Math.atan2(dx, dz);
    } else {
      const sp = m.mv === 2 ? BOT_SPEED * 1.15 : BOT_SPEED * 0.9, radial = m.mv === 2 ? -1 : Math.max(-1, Math.min(1, (d - (minD + maxD) / 2) * 0.12));   // lách ngang, giữ khoảng cách trong tầm hiệu quả
      const vx = -uz * m.sd * (m.mv === 2 ? 0.5 : 1) + ux * radial * 0.6, vz = ux * m.sd * (m.mv === 2 ? 0.5 : 1) + uz * radial * 0.6, vl = Math.hypot(vx, vz) || 1;
      e.x += (vx / vl) * sp * dt; e.z += (vz / vl) * sp * dt;
      const gy0 = groundAt(e.x, e.z); if (e.y <= gy0 + 0.05 && e.vy <= 0 && Math.random() < dt * 0.45) e.vy = 5.6;   // nhảy né
    }
    collide(e);
    if (m.mv === 1 || m.mv === 2) { if (Math.hypot(e.x - ex0, e.z - ez0) < BOT_SPEED * dt * 0.25) { m.sd = -m.sd; m.mvT = Math.min(m.mvT, 0.3); } }   // vướng vật cản → đổi hướng lách
    /* 3) LỰU ĐẠN: ném khi cách 8–42 m (cả khi người chơi nấp sau vật cản để dồn ra), không ném lên đỉnh núi quá cao; vừa chạy vừa ném; các bot cách nhau ≥2,5 s */
    m.nc -= dt;
    if (m.nc <= 0 && m.nades > 0 && d >= 8 && d <= 42 && P.y - e.y < 5 && clock - lastNade > 2.5) {
      m.nades--; m.nc = 6 + Math.random() * 6; lastNade = clock; e.kick = 1;
      const sc = 1.2 + d * 0.07; throwBotGrenade(e, P.x + (Math.random() - 0.5) * 2 * sc, P.y, P.z + (Math.random() - 0.5) * 2 * sc);
      say(e.i, nadeLine(), true, true);
    }
    if (k >= 4 || !los || m.sw > 0 || m.rlOn || (m.am[cur] ?? 1) <= 0 || d > Math.min(g.range, 230)) return;   // bắn trả được từ xa (tới tầm súng), đứng dưới chân núi vẫn bắn lên đỉnh
    if (m.burst > 0) { m.cd -= dt; if (m.cd <= 0) { botShot(e, g, d, m.mv === 0 ? 0.65 : m.mv === 1 ? 0.85 : 0.9); m.am[cur] = (m.am[cur] ?? 1) - 1; m.burst--; if (m.am[cur] <= 0) m.burst = 0; m.cd = 1 / (g.rate * (g.auto ? 0.55 : 0.6)); if (m.burst === 0) m.rest = ((g.id === "sniper" ? 1.5 : 0.8) + Math.random() * 0.9) * (m.hurt ? 0.7 : 1); } }
    else { m.rest -= dt; if (m.rest <= 0) { m.burst = g.id === "sniper" ? 1 : g.pellets > 1 ? 1 : g.auto ? 5 : 3; m.cd = 0; } }
  });
}
