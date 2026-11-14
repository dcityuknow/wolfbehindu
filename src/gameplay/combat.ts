import * as THREE from "three";
import { G } from "../state";
import { GUNS, GRENADE, COMBAT, SWAP, type GunId } from "../config";
import { W, M, MV, refillAmmo, resetNade } from "../weaponState";
import { entities, me, suitMat } from "../world/characters";
import { rig, muzzleWorld, magWorld, nadeWorld, firstNow, viewGuns } from "../world/camera";
import { camera, scene, canvasEl } from "../world/scene";
import { wallMeshes, WALLS } from "../world/map";
import { walkable, groundAt, terrainRay, WATER_Y } from "../world/island";
import { equipGun, setFlash, type GunRig } from "../world/guns";
import { tracer, impact, explosion, dropMag, flyPin, hole, splash, waterBlast } from "../world/fx";
import { buildGrenade } from "../world/guns";
import { sfx } from "../audio";
import { toast } from "../ui/dom";
import { hitMark } from "../ui/weaponHud";
import { keys } from "../input";
import { onFriendlyHit, hostileReset, hurtPlayer } from "./hostile";
import type { Entity } from "../types";

/**
 * Chiến đấu: súng (bắn tia — hitscan), nạp đạn, lựu đạn.
 * Rules: a teammate who runs out of health is DEAD FOR GOOD (recorded on-chain via reportFriendlyKill) — no reviving.
 * Riêng GIÁN ĐIỆP: phát hạ gục đầu tiên mỗi lượt là ám sát thật (hooks.lethal → actions.ts → contract), dùng chung hạn mức 1 lần/lượt với phím Q.
 */
export const hooks = { lethal: (_e: Entity) => {}, friendlyKill: (_e: Entity) => {}, shake: (_v: number) => {} };   // main.ts gán (tránh import vòng với actions.ts)

const O = new THREE.Vector3(), D = new THREE.Vector3(), MZ = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3();
const rc = new THREE.Raycaster();
let relPrev = 0, wasBusy = false;
const playing = () => G.phase === "play" && !G.mini && !G.ghost;
const canAim = () => rig.locked;
/** Hai tay bận: đang lăn hoặc đang bơi (di chuyển) thì không bắn / nạp / ném lựu đạn. Đứng yên trên nước vẫn bắn được. */
const busy = () => MV.roll > 0 || MV.swimming;
let swimHintT = 0;
function busyHint() { if (MV.swimming && performance.now() - swimHintT > 1500) { swimHintT = performance.now(); toast("🏊 Swimming — you can't shoot · stop moving to shoot"); } }
const gunRig = () => me().g.userData.gunRig as GunRig;

/* ───────────── Nhắm: tia ngắm (O = gốc, D = hướng) ───────────── */
function aimRay(spread: number) {
  const m = me();
  { // thứ nhất / thứ ba: bắn theo hướng nhìn (tâm màn hình)
    camera.getWorldDirection(D); O.copy(camera.position);
    if (!firstNow()) O.addScaledVector(D, Math.hypot(camera.position.x - m.x, camera.position.y - (m.y + 1.5), camera.position.z - m.z));   // bắt đầu từ chỗ người chơi, không phải sau lưng
  }
  if (spread > 0) { D.x += (Math.random() - 0.5) * 2 * spread; D.y += (Math.random() - 0.5) * 2 * spread; D.z += (Math.random() - 0.5) * 2 * spread; D.normalize(); }
}

/** Giao tia với hình trụ (người): bán kính 0.42, cao 1.85. Trả về khoảng cách t hoặc null. */
function cyl(e: Entity): number | null {
  const ox = O.x - e.x, oz = O.z - e.z, a = D.x * D.x + D.z * D.z; if (a < 1e-8) return null;
  const b = 2 * (ox * D.x + oz * D.z), c = ox * ox + oz * oz - 0.42 * 0.42, disc = b * b - 4 * a * c; if (disc < 0) return null;
  const sq = Math.sqrt(disc); let t = (-b - sq) / (2 * a); if (t < 0) t = (-b + sq) / (2 * a); if (t < 0) return null;
  const y = O.y + D.y * t; return y >= e.y && y <= e.y + 1.85 ? t : null;
}
interface Hit { t: number; e: Entity | null; head: boolean; kind: "air" | "wall" | "ground" | "water" | "ent" }
const HN = new THREE.Vector3();   // pháp tuyến bề mặt trúng đạn (cho lỗ đạn)
function trace(range: number): Hit {
  const h: Hit = { t: range, e: null, head: false, kind: "air" };
  rc.set(O, D); rc.far = range;
  HN.copy(D).negate();
  const w = rc.intersectObjects(wallMeshes, false)[0];
  if (w) { h.t = w.distance; h.kind = "wall"; if (w.face) HN.copy(w.face.normal).transformDirection(w.object.matrixWorld); }
  { const tg = terrainRay(O.x, O.y, O.z, D.x, D.y, D.z, h.t); if (tg >= 0) { h.t = tg; h.kind = "ground"; const x = O.x + D.x * tg, z = O.z + D.z * tg; HN.set(groundAt(x - 0.5, z) - groundAt(x + 0.5, z), 1, groundAt(x, z - 0.5) - groundAt(x, z + 0.5)).normalize(); } }   // đồi/vách/mặt đất
  if (D.y < -1e-4 && O.y > WATER_Y) {   // mặt nước: đạn trúng mặt phẳng nước trước khi chạm đáy
    const tw = (WATER_Y - O.y) / D.y;
    if (tw > 0 && tw < h.t && groundAt(O.x + D.x * tw, O.z + D.z * tw) < WATER_Y) { h.t = tw; h.kind = "water"; }
  }
  for (const e of entities) {
    if (e.i === G.slot || e.dead || e.out || e.stun > 0 || !e.g.visible) continue;   // chỉ trúng người đang nhìn thấy
    const t = cyl(e);
    if (t !== null && t < h.t) { h.t = t; h.e = e; h.kind = "ent"; h.head = O.y + D.y * t - e.y > 1.5; }
  }
  return h;
}

/* ───────────── Sát thương ───────────── */
function damageEntity(e: Entity, dmg: number, head: boolean) {
  if (e.stun > 0 || e.dead || e.out) return;
  e.hp -= dmg; e.flash = 0.18; sfx.hit();
  if (e.hp > 0) { hitMark(head ? 2 : 1); onFriendlyHit(e); return; }                  // trúng đạn: đồng đội hét lên, chất vấn, chĩa súng lại
  hitMark(3);
  if (G.role === 1 && !G.killUsed && !G.ghost && G.phase === "play") hooks.lethal(e);   // gián điệp: hạ gục thật (on-chain), 1 lần/lượt
  else { e.hp = 0; hooks.friendlyKill(e); }                                          // anyone else: the victim is dead for good (on-chain)
}

/* ───────────── Bắn ───────────── */
function fire() {
  const g = GUNS[W.cur];
  W.ammo[W.cur]--; W.cd = 1 / g.rate; W.kick = 1; W.flashT = 0.05; W.aimT = 2.2;
  W.recoil += g.recoil; W.bloom = Math.min(g.bloom, W.bloom + g.bloom * 0.22);
  sfx.shot(g.id);
  const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  const spread = W.scoped ? 0 : (g.spread + W.bloom) * (W.ads ? 0.45 : 1) * (moving ? 1.5 : 1);   // qua kính súng ngắm: bắn chính xác tuyệt đối
  muzzleWorld(MZ);
  for (let k = 0; k < g.pellets; k++) {
    aimRay(spread);
    const r = trace(g.range); P.copy(O).addScaledVector(D, r.t);
    tracer(MZ, P);
    if (r.e) {
      const fall = r.t < g.range * 0.4 ? 1 : 1 - 0.45 * ((r.t - g.range * 0.4) / (g.range * 0.6));   // xa thì yếu đi
      impact(P, "blood"); damageEntity(r.e, g.dmg * fall * (r.head ? COMBAT.headMul : 1), r.head);
    } else if (r.kind === "water") splash(P, g.id === "sniper" ? 1.5 : 1);
    else if (r.kind === "ground") { impact(P, "dust"); hole(P, HN); }
    else if (r.kind === "wall") { impact(P, "spark"); hole(P, HN); }
  }
}

export function startReload() {
  const g = GUNS[W.cur];
  if (!playing() || busy() || W.nade || W.lock > 0 || W.reload > 0 || W.ammo[W.cur] >= g.mag || W.reserve[W.cur] <= 0) return;
  W.reload = W.reloadDur = g.reload; sfx.reload(g.reload); relPrev = 0;
}
function finishReload() {
  const g = GUNS[W.cur], take = Math.min(g.mag - W.ammo[W.cur], W.reserve[W.cur]);
  W.ammo[W.cur] += take; W.reserve[W.cur] -= take;
}
/** Đổi súng (phím 1-3 / lăn chuột): thời gian rút súng từ lưng / hông = stow (cất súng cũ) + reach (tay vươn) + draw·0.55 — chưa xong thì chưa bắn / nạp được. Phím 4 = lựu đạn. */
export function selectWeapon(i: number) {
  if (!playing()) return;
  if (i === GUNS.length) return void equipNade(false);
  if (i < 0 || i >= GUNS.length) return;
  if (W.nade) {                                  // đang cầm lựu đạn: chưa giật chốt / đang ném thì không đổi
    if (W.gHold || W.gAuto || W.gThrowT > 0) return;
    resetNade(); W.cur = i; W.reload = 0; W.ads = false; W.lock = SWAP.reach + SWAP.draw * 0.55; W.swapT = 1; sfx.swap(); equipGun(gunRig(), GUNS[i].id as GunId); return;
  }
  if (i === W.cur) return;
  W.cur = i; W.reload = 0; W.swapT = 1; W.ads = false; W.lock = SWAP.stow + SWAP.reach + SWAP.draw * 0.55; sfx.swap();
  equipGun(gunRig(), GUNS[i].id as GunId);
}
export const cycleWeapon = (d: number) => selectWeapon((W.cur + d + GUNS.length) % GUNS.length);

/* ───────────── Lựu đạn ─────────────
 * Phím 4: tay phải móc túi hông trái lấy lựu đạn → GIỮ chuột trái: giật chốt (chốt bay ra), người ngả ra sau → THẢ chuột: vung tay ném (giữ lâu sau khi rút chốt = ném xa hơn).
 * Bấm nhanh (thả sớm) hoặc phím G: tự giật chốt rồi ném luôn, xong tự rút lại súng. */
interface Gren { m: THREE.Object3D; v: THREE.Vector3; t: number; w?: boolean }
const grens: Gren[] = [];

function equipNade(quick: boolean) {
  if (!playing() || W.grenades <= 0 || W.grenCd > 0) return;
  if (busy()) return void busyHint();
  if (W.nade) { if (quick && !W.gHold && !W.gAuto && W.gThrowT <= 0) W.gQuick = true; return; }
  W.nade = true; W.gQuick = quick; W.gHold = false; W.gAuto = false; W.gHoldT = 0; W.gThrowT = 0; W.gThrown = false; W.gPin = false; W.reload = 0; W.ads = false;
  W.gDrawT = -SWAP.stow;          // âm = còn đang cất súng cũ về dây đeo (gunpose.ts), xong mới móc túi
  sfx.swap();
}
/** Về lại súng (xong ném / hết lựu đạn / bị gián đoạn): rút súng từ dây đeo. */
function leaveNade() { resetNade(); W.lock = SWAP.reach + SWAP.draw * 0.55; W.swapT = 1; }
export function throwGrenade() { equipNade(true); }   // phím G

/** Câu thoại khi ném lựu đạn: hiện chữ + đọc thành tiếng (Web Speech API, giọng tiếng Anh) — cách làm của game tham khảo. */
const GREN_LINE = "Zama fire in the hole";
function sayGren() {
  toast('🗣️ "' + GREN_LINE + '"');
  try {
    const ss = window.speechSynthesis; if (!ss) return;
    ss.cancel();   // ném liên tiếp thì không dồn hàng đợi
    const u = new SpeechSynthesisUtterance(GREN_LINE); u.lang = "en-US"; u.rate = 1; u.pitch = 0.9; u.volume = 1; ss.speak(u);
  } catch { /* không có giọng đọc */ }
}
function launch() {
  sayGren(); sfx.nadeLaunch();
  W.grenades--; W.grenCd = GRENADE.cooldown; W.aimT = Math.max(W.aimT, 1);
  aimRay(0);
  const mesh = buildGrenade(); (mesh.userData.pin as THREE.Object3D).visible = false;   // chốt đã rút
  mesh.scale.setScalar(1.3); nadeWorld(mesh.position);
  if (firstNow()) mesh.position.copy(O).addScaledVector(D, 0.5).y -= 0.2;
  const v = new THREE.Vector3().copy(D).multiplyScalar(W.gPow); v.y += 3;
  scene.add(mesh); grens.push({ m: mesh, v, t: GRENADE.fuse });
}
/** Máy trạng thái ném: móc túi (gDrawT) → giữ chuột (gHold, gHoldT) / tự động (gAuto) → vung tay (gThrowT) → phóng khi tay đã giơ ra trước (gThrown). */
function updateNade(dt: number, ok: boolean) {
  if (!W.nade) return;
  if (!ok) { resetNade(); return; }
  if (busy()) { if (W.gHold || W.gAuto) toast("🙌 Hands busy — grenade put away"); leaveNade(); return; }
  if (W.grenades <= 0 && W.gThrowT <= 0) { leaveNade(); return; }
  W.gDrawT += dt; W.aimT = Math.max(W.aimT, 0.5);   // quay người theo hướng nhìn khi cầm lựu đạn
  const PT = GRENADE.pin, TH = GRENADE.throwT, ready = W.gDrawT >= GRENADE.draw * 0.7;
  const down = M.left, wasHold = W.gHold;
  if (W.gThrowT <= 0) {
    if (!W.gHold && !W.gAuto && M.pressed && ready && W.grenCd <= 0) { W.gHold = true; W.gHoldT = 0; W.gPin = false; sfx.swap(); }
    if (!W.gHold && !W.gAuto && W.gQuick && ready && W.grenCd <= 0) { W.gAuto = true; W.gHoldT = 0; W.gPin = false; }       // phím G: tự giật chốt
    if (W.gHold) {
      W.gHoldT += dt;
      if (!down && wasHold) {                     // thả chuột
        W.gHold = false;
        if (W.gHoldT < PT) W.gAuto = true;                                                    // bấm nhanh: tự làm nốt thao tác giật chốt rồi ném
        else { W.gPow = GRENADE.speed + (GRENADE.speedMax - GRENADE.speed) * Math.min(1, (W.gHoldT - PT) / 0.7); W.gThrowT = TH; W.gThrown = false; sfx.nadeThrow(); }
      }
    } else if (W.gAuto) {
      W.gHoldT += dt * 1.5;
      if (W.gHoldT >= PT) { W.gAuto = false; W.gHoldT = PT; W.gPow = GRENADE.speed; W.gThrowT = TH; W.gThrown = false; sfx.nadeThrow(); }
    }
    if ((W.gHold || W.gAuto) && !W.gPin && W.gHoldT >= PT * 0.7) {   // chốt bị giật ra: bay đi
      W.gPin = true; sfx.pin(); nadeWorld(P, true);
      U.set(-1.6, 1.4, firstNow() ? -0.8 : 0.8).applyQuaternion(firstNow() ? camera.quaternion : _id.setFromEuler(_eu.set(0, me().rot, 0)));   // bay sang bên tay trái, lên và ra trước
      flyPin(P, U);
    }
    return;
  }
  W.gThrowT -= dt;
  if (!W.gThrown && W.gThrowT <= TH * 0.55) { W.gThrown = true; launch(); }
  if (W.gThrowT <= 0) {
    W.gThrowT = 0;
    if (W.gQuick || W.grenades <= 0) leaveNade();
    else { W.gDrawT = 0; W.gThrown = false; W.gPin = false; W.gHold = false; W.gAuto = false; W.gHoldT = 0; }   // còn quả: lại móc túi
  }
}
const _id = new THREE.Quaternion(), _eu = new THREE.Euler();
function explode(p: THREE.Vector3, water = false) {
  { const m0 = me(); sfx.explode(Math.hypot(m0.x - p.x, (m0.y + 1) - p.y, m0.z - p.z)); }
  if (water) { p.y = WATER_Y; waterBlast(p, GRENADE.radius); } else explosion(p, GRENADE.radius);
  const m = me(); hooks.shake(Math.max(0, 0.7 * (1 - Math.hypot(m.x - p.x, m.z - p.z) / (GRENADE.radius * 3))));
  if (!G.ghost && G.phase === "play") {   // người chơi đứng gần cũng mất máu (kể cả lựu đạn do chính mình ném)
    const d = T.set(m.x, m.y + 0.9, m.z).distanceTo(p);
    if (d < GRENADE.radius) {
      let dmg = GRENADE.dmg * Math.pow(1 - d / GRENADE.radius, 1.3);
      U.copy(T).sub(p).normalize(); rc.set(p, U); rc.far = d; if (rc.intersectObjects(wallMeshes, false).length) dmg *= 0.25;
      hooks.shake(0.5); hurtPlayer(dmg);
    }
  }
  for (const e of entities) {
    if (e.i === G.slot || e.dead || e.out || e.stun > 0) continue;
    const d = T.set(e.x, e.y + 0.9, e.z).distanceTo(p); if (d > GRENADE.radius) continue;
    let dmg = GRENADE.dmg * Math.pow(1 - d / GRENADE.radius, 1.3);
    U.copy(T).sub(p).normalize(); rc.set(p, U); rc.far = d;
    if (rc.intersectObjects(wallMeshes, false).length) dmg *= 0.25;             // có vật chắn: giảm mạnh
    const push = Math.min(1.5, 2.5 / (d + 1)); e.x += U.x * push; e.z += U.z * push;  // hất ra
    damageEntity(e, dmg, false);
  }
}
function updateGrenades(dt: number) {
  for (let i = grens.length - 1; i >= 0; i--) {
    const g = grens[i], p = g.m.position; g.t -= dt;
    g.v.y -= GRENADE.gravity * dt; p.addScaledVector(g.v, dt); g.m.rotation.x += dt * 9; g.m.rotation.z += dt * 6;
    const gy = groundAt(p.x, p.z) + 0.12;
    if (!g.w && p.y < WATER_Y && gy - 0.12 < WATER_Y) { g.w = true; splash(p, 1.4); g.v.multiplyScalar(0.12); }   // rơi xuống biển / ao: chìm dần, vẫn nổ khi hết ngòi
    if (g.w) { g.v.y += GRENADE.gravity * dt * 0.85; g.v.multiplyScalar(Math.exp(-dt * 2.5)); if (p.y < gy) p.y = gy; if (g.t <= 0) { explode(p.clone(), true); scene.remove(g.m); grens.splice(i, 1); } continue; }
    if (p.y < gy) {
      if (gy - p.y > 0.6) { p.x -= g.v.x * dt; p.z -= g.v.z * dt; g.v.x *= -0.4; g.v.z *= -0.4; }            // đập vào sườn dốc: nảy ngược
      else { p.y = gy; g.v.y = Math.abs(g.v.y) < 1.2 ? 0 : -g.v.y * 0.4; g.v.x *= 0.72; g.v.z *= 0.72; }
    }
    for (const [cx, cz, w, d] of WALLS) { // nảy khỏi vật cản
      const dx = p.x - cx, dz = p.z - cz, px = w / 2 + 0.12 - Math.abs(dx), pz = d / 2 + 0.12 - Math.abs(dz);
      if (px > 0 && pz > 0 && p.y < groundAt(cx, cz) + 2.8) { if (px < pz) { p.x += Math.sign(dx || 1) * px; g.v.x *= -0.5; } else { p.z += Math.sign(dz || 1) * pz; g.v.z *= -0.5; } }
    }
    if (g.t <= 0) { explode(p.clone()); scene.remove(g.m); grens.splice(i, 1); }
  }
}

/* ───────────── Cập nhật mỗi frame ───────────── */
export function updateCombat(dt: number) {
  const m = me(), ok = playing();
  W.cd = Math.max(0, W.cd - dt); W.grenCd = Math.max(0, W.grenCd - dt); W.swapT = Math.max(0, W.swapT - dt * 4); W.lock = Math.max(0, W.lock - dt);
  W.aimT = Math.max(0, W.aimT - dt); W.flashT -= dt;
  W.kick = Math.max(0, W.kick - dt * 7); W.recoil *= Math.exp(-dt * 9); W.bloom = Math.max(0, W.bloom - dt * 0.12);
  const b = busy(); if (wasBusy && !b) W.lock = Math.max(W.lock, SWAP.reach + SWAP.draw * 0.55); wasBusy = b;   // lăn / bơi xong: rút lại súng từ sau lưng
  W.ads = ok && M.right && canAim() && !busy() && W.reload <= 0 && !W.nade && W.lock <= 0;
  W.adsT += ((W.ads ? 1 : 0) - W.adsT) * Math.min(1, dt * 10);
  W.scoped = ok && !W.nade && GUNS[W.cur].id === "sniper" && W.adsT > 0.55;   // súng ngắm: nhìn qua kính (tự sang góc thứ nhất)
  if (W.ads) W.aimT = Math.max(W.aimT, 0.5);
  if (W.reload > 0) {
    const u = 1 - W.reload / W.reloadDur;
    if (relPrev < 0.3 && u >= 0.3) { magWorld(P); dropMag(P, GUNS[W.cur].id === "pistol"); }   // băng cũ rút ra, rơi xuống đất
    relPrev = u; W.reload -= dt; if (W.reload <= 0) { finishReload(); relPrev = 0; }
  }

  const g = GUNS[W.cur];
  if (ok && canAim() && busy() && M.pressed) busyHint();
  if (ok && canAim() && !busy() && !W.nade && W.lock <= 0 && W.reload <= 0 && W.cd <= 0 && (g.auto ? M.left : M.pressed)) {
    if (W.ammo[W.cur] > 0) fire(); else { if (M.pressed) sfx.empty(); startReload(); }
  }
  updateNade(dt, ok);
  M.pressed = false;

  // tư thế nhân vật: giơ súng khi vừa bắn / đang ngắm, hạ súng khi đi lại
  m.aim += ((W.aimT > 0 ? 1 : 0) - m.aim) * Math.min(1, dt * 9);
  m.pitch = rig.pitch; m.kick = W.kick; m.rel = W.reload > 0 ? Math.sin(Math.PI * (1 - W.reload / W.reloadDur)) : 0;
  const fl = W.flashT > 0, gr = gunRig(), fp = firstNow();
  viewGuns.forEach((v, i) => setFlash(v, fl && i === W.cur && fp));
  for (const k of Object.keys(gr.models) as GunId[]) setFlash(gr.models[k], fl && !fp && k === GUNS[W.cur].id);

  updateEntities(dt); updateGrenades(dt);
}

/** Nháy đỏ khi trúng đạn; đồng đội ngất thì nằm xuống rồi dậy. */
function updateEntities(dt: number) {
  for (const e of entities) {
    if (e.dead || e.out) continue;
    const mat = suitMat(e.g), want = e.flash > 0 ? 0xff7a7a : 0xffffff;
    if (e.flash > 0) e.flash -= dt;
    if (mat.color.getHex() !== want) mat.color.setHex(want);
    if (e.stun > 0) {
      e.stun -= dt;
      if (e.stun <= 0) { e.stun = 0; e.hp = COMBAT.reviveHp; e.g.rotation.z = 0; }
      else { e.g.rotation.set(0, e.rot, Math.PI / 2); e.g.position.set(e.x + 0.9 * Math.cos(e.rot), e.y + 0.46, e.z - 0.9 * Math.sin(e.rot)); }
    }
  }
}

/** Họp khẩn / sang lượt mới: gỡ ngất, xoá lựu đạn đang bay. */
export function clearCombat() {
  hostileReset();
  for (const g of grens) scene.remove(g.m);
  grens.length = 0;
  for (const e of entities) if (e.stun > 0) { e.stun = 0; e.hp = COMBAT.reviveHp; e.g.rotation.z = 0; }
}
/** Lượt mới: hồi máu, nạp đầy đạn + lựu đạn. */
export function resetRound() {
  clearCombat(); for (const e of entities) { e.hp = COMBAT.botHp; e.flash = 0; }
  refillAmmo();
}

export function initCombat() {
  canvasEl.addEventListener("mousedown", (e) => { if (e.button === 0) { M.left = true; M.pressed = true; } if (e.button === 2) M.right = true; });
  addEventListener("mouseup", (e) => { if (e.button === 0) M.left = false; if (e.button === 2) M.right = false; });
  canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("mousemove", (e) => { M.x = e.clientX; M.y = e.clientY; });
  addEventListener("blur", () => { M.left = M.right = false; });
}
