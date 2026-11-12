import * as THREE from "three";
import { G } from "../state";
import { GUNS, GRENADE, COMBAT, type GunId } from "../config";
import { W, M, refillAmmo } from "../weaponState";
import { entities, me, suitMat } from "../world/characters";
import { rig, muzzleWorld, viewGuns } from "../world/camera";
import { camera, scene, canvasEl } from "../world/scene";
import { wallMeshes, WALLS } from "../world/map";
import { walkable } from "../world/island";
import { equipGun, setFlash, type GunRig } from "../world/guns";
import { tracer, impact, explosion } from "../world/fx";
import { sfx } from "../audio";
import { hitMark } from "../ui/weaponHud";
import { keys } from "../input";
import { onFriendlyHit, hostileReset } from "./hostile";
import type { Entity } from "../types";

/**
 * Chiến đấu: súng (bắn tia — hitscan), nạp đạn, lựu đạn.
 * Luật: đạn/lựu đạn trúng ĐỒNG ĐỘI chỉ làm họ NGẤT tạm thời (hết máu → nằm `stunTime` giây rồi dậy), để không lệch trạng thái on-chain.
 * Riêng GIÁN ĐIỆP: phát hạ gục đầu tiên mỗi lượt là ám sát thật (hooks.lethal → actions.ts → contract), dùng chung hạn mức 1 lần/lượt với phím Q.
 */
export const hooks = { lethal: (_e: Entity) => {}, shake: (_v: number) => {} };   // main.ts gán (tránh import vòng với actions.ts)

const O = new THREE.Vector3(), D = new THREE.Vector3(), MZ = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3();
const rc = new THREE.Raycaster();
const playing = () => G.phase === "play" && !G.mini && !G.ghost;
const canAim = () => rig.locked || rig.mode === "top";
const gunRig = () => me().g.userData.gunRig as GunRig;

/* ───────────── Nhắm: tia ngắm (O = gốc, D = hướng) ───────────── */
function aimRay(spread: number) {
  const m = me();
  if (rig.mode === "top") { // nhìn từ trên xuống: bắn về phía con trỏ chuột (mặt phẳng ngang tầm ngực)
    U.set((M.x / innerWidth) * 2 - 1, -(M.y / innerHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    O.set(m.x, m.y + 1.3, m.z);
    if (U.y < -0.05) { P.copy(camera.position).addScaledVector(U, (1.3 - camera.position.y) / U.y); D.set(P.x - O.x, 0, P.z - O.z); }
    else D.set(0, 0, 0);
    if (D.lengthSq() < 0.01) D.set(Math.sin(m.rot), 0, Math.cos(m.rot));
    D.normalize();
  } else { // thứ nhất / thứ ba: bắn theo hướng nhìn (tâm màn hình)
    camera.getWorldDirection(D); O.copy(camera.position);
    if (rig.mode === "third") O.addScaledVector(D, Math.hypot(camera.position.x - m.x, camera.position.y - (m.y + 1.5), camera.position.z - m.z));   // bắt đầu từ chỗ người chơi, không phải sau lưng
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
interface Hit { t: number; e: Entity | null; head: boolean; kind: "air" | "wall" | "ground" | "ent" }
function trace(range: number): Hit {
  const h: Hit = { t: range, e: null, head: false, kind: "air" };
  rc.set(O, D); rc.far = range;
  const w = rc.intersectObjects(wallMeshes, false)[0]; if (w) { h.t = w.distance; h.kind = "wall"; }
  if (D.y < -1e-4) { const tg = -O.y / D.y; if (tg > 0 && tg < h.t) { h.t = tg; h.kind = "ground"; } }
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
  else { e.stun = COMBAT.stunTime; e.hp = 0; onFriendlyHit(e); }                      // còn lại: ngất tạm thời, tỉnh dậy vẫn nhớ
}

/* ───────────── Bắn ───────────── */
function fire() {
  const g = GUNS[W.cur];
  W.ammo[W.cur]--; W.cd = 1 / g.rate; W.kick = 1; W.flashT = 0.05; W.aimT = 2.2;
  W.recoil += g.recoil; W.bloom = Math.min(g.bloom, W.bloom + g.bloom * 0.22);
  sfx.shot(g.id);
  const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  const spread = (g.spread + W.bloom) * (W.ads ? 0.45 : 1) * (moving ? 1.5 : 1);
  muzzleWorld(MZ);
  for (let k = 0; k < g.pellets; k++) {
    aimRay(spread);
    const r = trace(g.range); P.copy(O).addScaledVector(D, r.t);
    tracer(MZ, P);
    if (r.e) {
      const fall = r.t < g.range * 0.4 ? 1 : 1 - 0.45 * ((r.t - g.range * 0.4) / (g.range * 0.6));   // xa thì yếu đi
      impact(P, "blood"); damageEntity(r.e, g.dmg * fall * (r.head ? COMBAT.headMul : 1), r.head);
    } else if (r.kind === "ground") impact(P, walkable(P.x, P.z) ? "dust" : "water");
    else if (r.kind === "wall") impact(P, "spark");
  }
}

export function startReload() {
  const g = GUNS[W.cur];
  if (!playing() || W.reload > 0 || W.ammo[W.cur] >= g.mag || W.reserve[W.cur] <= 0) return;
  W.reload = W.reloadDur = g.reload; sfx.reload(g.reload);
}
function finishReload() {
  const g = GUNS[W.cur], take = Math.min(g.mag - W.ammo[W.cur], W.reserve[W.cur]);
  W.ammo[W.cur] += take; W.reserve[W.cur] -= take;
}
export function selectWeapon(i: number) {
  if (!playing() || i === W.cur || i < 0 || i >= GUNS.length) return;
  W.cur = i; W.reload = 0; W.swapT = 1; W.ads = false; sfx.swap();
  equipGun(gunRig(), GUNS[i].id as GunId);
}
export const cycleWeapon = (d: number) => selectWeapon((W.cur + d + GUNS.length) % GUNS.length);

/* ───────────── Lựu đạn ───────────── */
interface Gren { m: THREE.Mesh; v: THREE.Vector3; t: number }
const grens: Gren[] = [];
const gGeo = new THREE.BoxGeometry(0.14, 0.2, 0.14), gMat = new THREE.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 0.6 });

export function throwGrenade() {
  if (!playing() || W.grenades <= 0 || W.grenCd > 0) return;
  W.grenades--; W.grenCd = GRENADE.cooldown; W.aimT = Math.max(W.aimT, 1); sfx.pin();
  aimRay(0);
  const m = me(), mesh = new THREE.Mesh(gGeo, gMat); mesh.castShadow = true;
  mesh.position.set(m.x + D.x * 0.5, m.y + 1.45, m.z + D.z * 0.5);
  let speed = GRENADE.speed;
  if (rig.mode === "top") speed = Math.max(5, Math.min(GRENADE.speed, Math.hypot(P.x - m.x, P.z - m.z) * 1.1));   // ném tới chỗ con trỏ chuột
  const v = new THREE.Vector3().copy(D).multiplyScalar(speed); v.y += rig.mode === "top" ? 4 : 3;
  scene.add(mesh); grens.push({ m: mesh, v, t: GRENADE.fuse });
}
function explode(p: THREE.Vector3) {
  sfx.explode(); explosion(p, GRENADE.radius);
  const m = me(); hooks.shake(Math.max(0, 0.7 * (1 - Math.hypot(m.x - p.x, m.z - p.z) / (GRENADE.radius * 3))));
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
    if (p.y < 0.12) {
      if (!walkable(p.x, p.z)) { impact(p.clone(), "water"); scene.remove(g.m); grens.splice(i, 1); continue; }   // rơi xuống biển: không nổ
      p.y = 0.12; g.v.y = Math.abs(g.v.y) < 1.2 ? 0 : -g.v.y * 0.4; g.v.x *= 0.72; g.v.z *= 0.72;
    }
    for (const [cx, cz, w, d] of WALLS) { // nảy khỏi vật cản
      const dx = p.x - cx, dz = p.z - cz, px = w / 2 + 0.12 - Math.abs(dx), pz = d / 2 + 0.12 - Math.abs(dz);
      if (px > 0 && pz > 0 && p.y < 2.8) { if (px < pz) { p.x += Math.sign(dx || 1) * px; g.v.x *= -0.5; } else { p.z += Math.sign(dz || 1) * pz; g.v.z *= -0.5; } }
    }
    if (g.t <= 0) { explode(p.clone()); scene.remove(g.m); grens.splice(i, 1); }
  }
}

/* ───────────── Cập nhật mỗi frame ───────────── */
export function updateCombat(dt: number) {
  const m = me(), ok = playing();
  W.cd = Math.max(0, W.cd - dt); W.grenCd = Math.max(0, W.grenCd - dt); W.swapT = Math.max(0, W.swapT - dt * 4);
  W.aimT = Math.max(0, W.aimT - dt); W.flashT -= dt;
  W.kick = Math.max(0, W.kick - dt * 7); W.recoil *= Math.exp(-dt * 9); W.bloom = Math.max(0, W.bloom - dt * 0.12);
  W.ads = ok && M.right && canAim() && rig.mode !== "top" && W.reload <= 0;
  W.adsT += ((W.ads ? 1 : 0) - W.adsT) * Math.min(1, dt * 10);
  if (W.ads) W.aimT = Math.max(W.aimT, 0.5);
  if (W.reload > 0) { W.reload -= dt; if (W.reload <= 0) finishReload(); }

  if (ok && rig.mode === "top" && W.aimT > 0) { aimRay(0); m.rot = Math.atan2(D.x, D.z); }   // nhìn từ trên: nhân vật quay mặt về con trỏ
  const g = GUNS[W.cur];
  if (ok && canAim() && W.reload <= 0 && W.cd <= 0 && (g.auto ? M.left : M.pressed)) {
    if (W.ammo[W.cur] > 0) fire(); else { if (M.pressed) sfx.empty(); startReload(); }
  }
  M.pressed = false;

  // tư thế nhân vật: giơ súng khi vừa bắn / đang ngắm, hạ súng khi đi lại
  m.aim += ((W.aimT > 0 ? 1 : 0) - m.aim) * Math.min(1, dt * 9);
  m.pitch = rig.pitch; m.kick = W.kick; m.rel = W.reload > 0 ? Math.sin(Math.PI * (1 - W.reload / W.reloadDur)) : 0;
  const fl = W.flashT > 0, gr = gunRig();
  viewGuns.forEach((v, i) => setFlash(v, fl && i === W.cur && rig.mode === "first"));
  for (const k of Object.keys(gr.models) as GunId[]) setFlash(gr.models[k], fl && rig.mode !== "first" && k === GUNS[W.cur].id);

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
      else { e.g.rotation.set(0, e.rot, Math.PI / 2); e.g.position.set(e.x + 0.9 * Math.cos(e.rot), 0.46, e.z - 0.9 * Math.sin(e.rot)); }
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
