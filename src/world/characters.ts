import * as THREE from "three";
import { scene } from "./scene";
import { WALLS } from "./map";
import { walkable, canStep, groundAt, swimmable } from "./island";
import { randomNavPoint } from "./nav";
import { buildSoldier, defOf } from "./soldier";
import { attachGun, type GunRig } from "./guns";
import { poseFull } from "./gunpose";
import { COLORS, NAMES, SQUAD, PLAYERS, GUNS, COMBAT, type GunId } from "../config";
import { W, MV, ROLL_T } from "../weaponState";
import { G } from "../state";
import type { Entity, Body } from "../types";

/** Người lính voxel (soldier.ts): quân phục rằn ri riêng cho từng người, băng tay màu nhận diện, nhãn tên phía trên đầu. */
export function makeCrew(i: number) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const { g, armL, armR, legL, legR } = buildSoldier(defOf(SQUAD[i]), mat, COLORS[i]);
  const c = document.createElement("canvas"); c.width = 128; c.height = 32; const x = c.getContext("2d")!;
  x.font = "bold 22px system-ui"; x.textAlign = "center"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(4, 3, 120, 26); x.fillStyle = "#fff"; x.fillText(NAMES[i], 64, 24);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); tag.scale.set(0.95, 0.24, 1); tag.position.y = 2.25; tag.renderOrder = 5; g.add(tag);
  // Dấu chấm than đỏ to trên đầu người đang gọi họp (ẩn mặc định)
  const ac = document.createElement("canvas"); ac.width = ac.height = 128; const ax = ac.getContext("2d")!;
  ax.font = "900 120px system-ui"; ax.textAlign = "center"; ax.textBaseline = "middle"; ax.lineWidth = 14; ax.strokeStyle = "#fff"; ax.strokeText("!", 64, 70); ax.fillStyle = "#ff1e1e"; ax.fillText("!", 64, 70);
  const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(ac), depthTest: false, transparent: true })); alert.scale.set(1.5, 1.5, 1); alert.position.y = 3.3; alert.renderOrder = 6; alert.visible = false; g.add(alert);
  Object.assign(g.userData, { alert, m: mat, mats: [mat], legL, legR, armL, armR, tag, ph: 0, lx: 0, lz: 0 });
  scene.add(g);
  return g;
}
/** Súng đồng đội cầm (chỉ để trang trí — Bot đi tuần, không bắn). Người chơi [0] cầm súng đang chọn trong weaponState. */
const BOT_GUNS: GunId[] = ["rifle", "pistol", "rifle", "rifle", "pistol", "rifle"];
export const entities: Entity[] = Array.from({ length: PLAYERS }, (_, i) => {
  const g = makeCrew(i); g.visible = false;
  attachGun(g, i === 0 ? GUNS[W.cur].id : BOT_GUNS[(i - 1) % BOT_GUNS.length], i === 0, defOf(SQUAD[i]).pack ? -0.27 : -0.16);   // người chơi [0]: giá súng đầy đủ (3 súng đeo lưng / hông, lựu đạn móc hông)
  return { i, g, x: 0, z: 0, rot: 0, vy: 0, y: 0, dead: false, out: false, wait: 0, tx: 0, tz: 0, seat: -1, px: NaN, pz: NaN, hp: COMBAT.botHp, stun: 0, aim: 0, pitch: 0, kick: 0, rel: 0, flash: 0 };
});
export const bodies: Body[] = [];
export const me = () => entities[G.slot];
export const suitMat = (g: THREE.Group) => g.userData.m as THREE.MeshStandardMaterial;

export function spawnAll() {
  for (const e of entities) {
    if (e.dead || e.out) continue;
    const [x, z] = randomNavPoint(); e.x = x; e.z = z; e.y = groundAt(x, z); e.px = NaN;
    e.tx = e.x; e.tz = e.z; e.g.visible = true;
  }
}
/** Đẩy thực thể ra khỏi tường/đồ vật (vòng tròn bán kính .5 vs hộp AABB), rồi giữ trong địa hình: không lội xuống biển/ao, không trèo vách cao hơn 1 khối (trừ khi đang nhảy). */
export function collide(e: Entity) {
  for (const [cx, cz, w, d] of WALLS) {
    const nx = Math.max(cx - w / 2, Math.min(e.x, cx + w / 2)), nz = Math.max(cz - d / 2, Math.min(e.z, cz + d / 2));
    let dx = e.x - nx, dz = e.z - nz, l = Math.hypot(dx, dz);
    if (l < 0.5) { if (l < 1e-4) { dx = 1; dz = 0; l = 1; } e.x += (dx / l) * (0.5 - l); e.z += (dz / l) * (0.5 - l); }
  }
  constrain(e);
}
function constrain(e: Entity) {
  const swim = e.i === G.slot && !G.ghost;                                  // chỉ người chơi bơi được (Bot ở trên đất liền)
  if (Number.isNaN(e.px) || Math.hypot(e.x - e.px, e.z - e.pz) > 3) {      // dịch chuyển / lần đầu: chỉ cần đứng trên đất liền (hoặc trong vùng bơi)
    if (!walkable(e.x, e.z) && !(swim && swimmable(e.x, e.z))) {
      for (let r = 1; r < 40; r++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r; if (walkable(x, z)) { e.x = x; e.z = z; r = 99; break; } }
    }
    e.px = e.x; e.pz = e.z; return;
  }
  if (!canStep(e.px, e.pz, e.y, e.x, e.z, swim)) {
    if (canStep(e.px, e.pz, e.y, e.x, e.pz, swim)) e.z = e.pz;              // trượt dọc vách / mép vùng bơi
    else if (canStep(e.px, e.pz, e.y, e.px, e.z, swim)) e.x = e.px;
    else { e.x = e.px; e.z = e.pz; }
  }
  e.px = e.x; e.pz = e.z;
}
const gray = (g: THREE.Group) => { suitMat(g).color.setHex(0x8a8a8a); g.userData.tag.visible = false; };
/** Đánh dấu người chơi `i` đã chết: Bot thành xác tại chỗ; người chơi thật thành hồn ma + để lại xác. */
export function markDead(i: number, toast: (m: string) => void) {
  if (G.dead.has(i)) return;
  G.dead.add(i);
  const e = entities[i];
  if (i === G.slot) {
    G.ghost = true;
    const b = makeCrew(i); b.position.set(e.x + 0.9, e.y + 0.46, e.z); b.rotation.z = Math.PI / 2; gray(b);
    bodies.push({ x: e.x, z: e.z, g: b, own: true });
    for (const m of e.g.userData.mats as THREE.Material[]) { m.transparent = true; m.opacity = 0.35; }
    toast("💀 You were killed — you are now a ghost");
  } else {
    e.dead = true; e.g.rotation.z = Math.PI / 2; e.g.position.set(e.x + 0.9 * Math.cos(e.rot), e.y + 0.46, e.z - 0.9 * Math.sin(e.rot)); gray(e.g);   // nằm ngang, tâm xác ngay tại chỗ ngã
    bodies.push({ x: e.x, z: e.z, g: e.g });
  }
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Hoạt ảnh: đi bộ vung chân; hai tay luôn cầm súng (hạ súng khi đi tuần, giơ ngắm khi bắn/ngắm, cúi xuống khi nạp đạn). */
export function animateCrew(dt: number, t: number) {
  for (const e of entities) {
    const u = e.g.userData; if (e.dead) continue;
    const sp = dt > 0 ? Math.hypot(e.x - u.lx, e.z - u.lz) / dt : 0; u.lx = e.x; u.lz = e.z;
    const k = Math.min(1, sp / 3) * (e.i === G.slot && e.y - groundAt(e.x, e.z) > 0.3 ? 0.3 : 1); u.ph += Math.min(sp, 8) * dt * 2.3;
    const sw = Math.sin(u.ph) * 0.8 * k, br = Math.sin(t * 2 + e.i) * 0.03;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    const gr = u.gunRig as GunRig | undefined;
    let gl = 0;
    if (gr && gr.full && e.stun <= 0) {   // người chơi: rút súng từ lưng / nạp đạn / lựu đạn — gunpose.ts
      gr.pivot.visible = gr.extra.visible = !(G.ghost && e.i === G.slot);
      gl = poseFull(e, gr, u.armL, u.armR, dt, sw);
    } else if (gr && e.stun <= 0) {
      gr.pivot.visible = gr.extra.visible = !(G.ghost && e.i === G.slot);
      // góc tay: -0.95 = hạ súng chếch xuống · -π/2 + pitch = giơ ngang tầm mắt, theo góc nhìn
      const th = lerp(-0.95, -Math.PI / 2 + e.pitch * e.aim, e.aim) + Math.sin(u.ph) * 0.06 * k * (1 - e.aim) + br + e.rel * 0.55 - e.kick * 0.1;
      u.armL.rotation.set(th, 0, 0.3); u.armR.rotation.set(th, 0, -0.3);
      gr.pivot.rotation.x = th + Math.PI / 2;
    } else { u.armL.rotation.set(-sw * 0.9 + br, 0, 0); u.armR.rotation.set(sw * 0.9 - br, 0, 0); }
    if (e.i === G.slot) poseMe(e, t, gr, gl);
  }
}

/* ───── Lăn (Shift) + bơi: tư thế riêng của người chơi (giống game tham khảo) ───── */
const e3 = (x: number) => x * x * (3 - 2 * x), cl = (u: number, a: number, b: number) => Math.min(1, Math.max(0, (u - a) / (b - a)));
const _v = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qe = new THREE.Euler();
const HIP = 0.75;                                                   // độ cao hông (m): tâm xoay khi lộn / nằm sấp
const LOWPTS: [number, number, number][] = [[0, 1.7, 0.1], [0, 0.75, -0.25], [0, 1.3, -0.25]];   // đầu · mông · lưng (điểm thấp nhất khi lộn)
/** Lộn nhào về phía trước (chồm → co người thành khối tròn → lộn một vòng → bật dậy) · bơi sải nằm sấp ngang mặt nước, hai tay quạt luân phiên, chân đập · đứng yên trên nước: đứng thẳng đạp nước. */
function poseMe(e: Entity, t: number, gr: GunRig | undefined, gl: number) {
  const g = e.g, u = g.userData, rolling = MV.roll > 0, sk = MV.swimK;
  const on = G.phase === "play" && !G.ghost && e.seat < 0 && (rolling || sk > 0.02 || MV.inWater || Math.abs(gl) > 0.003);
  if (!on) { if (u.posed) { g.rotation.x = 0; g.rotation.z = 0; g.scale.y = 1; u.posed = false; } return; }
  u.posed = true; g.rotation.order = "YXZ";
  const ru = rolling ? 1 - MV.roll / ROLL_T : 1, tuck = rolling ? e3(cl(ru, 0.08, 0.3)) * (1 - e3(cl(ru, 0.85, 1))) : 0;
  let lean = 0;
  if (rolling) lean = 2 * Math.PI * e3(cl(ru, 0.08, 0.92)) + 0.45 * Math.sin(Math.PI * cl(ru, 0, 0.2));   // chồm tới rồi quay trọn 360° về phía trước quanh hông
  else lean = 1.3 * sk + (1 - sk) * gl;                                                                    // bơi: nằm sấp ~75° · đứng: ngả / chồm theo thao tác súng (rút súng, nạp đạn, ném lựu đạn)
  const hdg = e.rot, dz = -HIP * Math.sin(lean), dy = HIP * (1 - Math.cos(lean));                           // giữ nguyên chỗ hông khi nghiêng
  g.rotation.x = lean; g.rotation.z = Math.sin(MV.stk) * 0.2 * sk;                                           // thân lắc theo nhịp tay
  g.scale.y = 1 - 0.22 * tuck;
  g.position.set(e.x + dz * Math.sin(hdg), e.y + dy + 0.22 * sk + (MV.inWater && sk < 0.5 ? Math.sin(t * 2.1) * 0.035 : 0), e.z + dz * Math.cos(hdg));
  // chân + tay
  const legL = u.legL as THREE.Object3D, legR = u.legR as THREE.Object3D, armL = u.armL as THREE.Object3D, armR = u.armR as THREE.Object3D;
  if (rolling) {
    const tg = -1.55 * tuck, w = Math.min(1, 6 * (rolling ? 1 : 0));                                         // hai chân gập lên ngực lúc lăn
    legL.rotation.x += (tg - legL.rotation.x) * w; legR.rotation.x += (tg - legR.rotation.x) * w;
    const ax = -1.3 - 1.5 * (1 - tuck);                                                                      // tay vươn thẳng lên trước lúc lao ra → ôm gối lúc lăn
    armL.rotation.set(ax, 0, -0.12); armR.rotation.set(ax, 0, 0.12);
  } else if (MV.inWater) {
    const kk = sk > 0.5 ? Math.sin(MV.stk * 3) * 0.5 : Math.sin(t * 5) * 0.55;                                // bơi: đập chân · đứng nước: đạp nước
    const w = Math.max(sk, 0.6); legL.rotation.x += (kk - legL.rotation.x) * w; legR.rotation.x += (-kk - legR.rotation.x) * w;
    const w2 = Math.min(1, sk * 1.5);
    if (w2 > 0) for (const [arm, o, z] of [[armR, 0, 0.2], [armL, Math.PI, -0.2]] as [THREE.Object3D, number, number][]) { _qa.setFromEuler(_qe.set(MV.stk + o, 0, z)); arm.quaternion.slerp(_qa, w2); }
  }
  if (gr && (rolling || sk > 0.5)) gr.pivot.visible = false;                                                 // hai tay bận: cất súng
  if (rolling) {   // lăn trên đất: đặt thân sao cho điểm thấp nhất (đầu / lưng / chân) vừa chạm đất
    g.updateMatrixWorld(true);
    const a = legL.rotation.x, fy = HIP - HIP * Math.cos(a), fz = -HIP * Math.sin(a); let mn = 1e9;
    for (const [x, y, z] of [...LOWPTS, [0.14, fy, fz], [-0.14, fy, fz]] as [number, number, number][]) { _v.set(x, y, z).applyMatrix4(g.matrixWorld); if (_v.y < mn) mn = _v.y; }
    g.position.y += (groundAt(e.x, e.z) + 0.04 - mn);
  }
}

/** Bật/tắt dấu chấm than (nhún nhẹ) trên đầu mỗi người. */
export function setAlerts(on: (i: number) => boolean, t: number) {
  for (const e of entities) { const a = e.g.userData.alert as THREE.Sprite, v = on(e.i) && !e.dead && !e.out; a.visible = v; if (v) a.position.y = 3.3 + Math.sin(t * 7) * 0.12; }
}
/** Các nhân vật không được đi xuyên qua nhau: đẩy nhau ra (người đang ngồi đứng yên). */
const BODY_R = 0.9;
export function separate() {
  const live = entities.filter((e) => !e.dead && !e.out && !(e.i === G.slot && G.ghost));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if ((a.seat >= 0 && b.seat >= 0) || Math.abs(a.y - b.y) > 1) continue;
      let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= BODY_R) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
      const p = BODY_R - d, nx = dx / d, nz = dz / d, wa = a.seat >= 0 ? 0 : b.seat >= 0 ? 1 : 0.5;
      a.x -= nx * p * wa; a.z -= nz * p * wa; b.x += nx * p * (1 - wa); b.z += nz * p * (1 - wa);
    }
    for (const e of live) if (e.seat < 0) collide(e);
  }
}
