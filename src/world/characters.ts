import * as THREE from "three";
import { scene } from "./scene";
import { WALLS } from "./map";
import { walkable, canStep, groundAt } from "./island";
import { randomNavPoint } from "./nav";
import { buildSoldier, defOf } from "./soldier";
import { attachGun, type GunRig } from "./guns";
import { COLORS, NAMES, SQUAD, PLAYERS, GUNS, COMBAT, type GunId } from "../config";
import { W } from "../weaponState";
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
const BOT_GUNS: GunId[] = ["rifle", "smg", "shotgun", "pistol", "rifle", "smg"];
export const entities: Entity[] = Array.from({ length: PLAYERS }, (_, i) => {
  const g = makeCrew(i); g.visible = false;
  attachGun(g, i === 0 ? GUNS[W.cur].id : BOT_GUNS[(i - 1) % BOT_GUNS.length]);
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
  if (Number.isNaN(e.px) || Math.hypot(e.x - e.px, e.z - e.pz) > 3) {      // dịch chuyển / lần đầu: chỉ cần đứng trên đất liền
    if (!walkable(e.x, e.z)) {
      for (let r = 1; r < 40; r++) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r; if (walkable(x, z)) { e.x = x; e.z = z; r = 99; break; } }
    }
    e.px = e.x; e.pz = e.z; return;
  }
  if (!canStep(e.px, e.pz, e.y, e.x, e.z)) {
    if (canStep(e.px, e.pz, e.y, e.x, e.pz)) e.z = e.pz;                  // trượt dọc vách
    else if (canStep(e.px, e.pz, e.y, e.px, e.z)) e.x = e.px;
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
    if (gr && e.stun <= 0) {
      gr.pivot.visible = !(G.ghost && e.i === G.slot);
      // góc tay: -0.95 = hạ súng chếch xuống · -π/2 + pitch = giơ ngang tầm mắt, theo góc nhìn
      const th = lerp(-0.95, -Math.PI / 2 + e.pitch * e.aim, e.aim) + Math.sin(u.ph) * 0.06 * k * (1 - e.aim) + br + e.rel * 0.55 - e.kick * 0.1;
      u.armL.rotation.set(th, 0, 0.3); u.armR.rotation.set(th, 0, -0.3);
      gr.pivot.rotation.x = th + Math.PI / 2;
    } else { u.armL.rotation.set(-sw * 0.9 + br, 0, 0); u.armR.rotation.set(sw * 0.9 - br, 0, 0); }
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
