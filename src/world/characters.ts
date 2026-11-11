import * as THREE from "three";
import { scene } from "./scene";
import { WALLS } from "./map";
import { cellOf, keepOnIsland } from "./island";
import { voxMat } from "./voxel";
import { COLORS, CEN, NAMES } from "../config";
import { G } from "../state";
import type { Entity, Body } from "../types";

/** Phi hành gia voxel: đầu/thân/tay/chân dạng khối, mũ kính, ba lô + phụ kiện riêng cho mỗi người. */
export function makeCrew(i: number) {
  const g = new THREE.Group(), suit = voxMat(COLORS[i]), dark = voxMat(0x2b3150), white = voxMat(0xeef1ff), pack = voxMat(COLORS[i]);
  pack.color.multiplyScalar(0.7);
  const visor = new THREE.MeshStandardMaterial({ color: 0x0e1633, roughness: 0.2, metalness: 0.3 }), shine = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const mats = [suit, dark, white, pack, visor, shine];
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // chân & tay (pivot ở hông / vai để vung được)
  const leg = (sx: number) => { const p = new THREE.Group(); p.position.set(sx * 0.17, 0.52, 0); part(bx(0.28, 0.52, 0.3), suit, 0, -0.26, 0, p); part(bx(0.3, 0.12, 0.38), dark, 0, -0.5, 0.04, p); g.add(p); return p; };
  const arm = (sx: number) => { const p = new THREE.Group(); p.position.set(sx * 0.47, 1.12, 0); part(bx(0.2, 0.55, 0.24), suit, 0, -0.26, 0, p); part(bx(0.22, 0.14, 0.26), white, 0, -0.55, 0, p); g.add(p); return p; };
  const legL = leg(-1), legR = leg(1), armL = arm(-1), armR = arm(1);
  part(bx(0.72, 0.62, 0.42), suit, 0, 0.84, 0); part(bx(0.34, 0.24, 0.05), dark, 0, 0.9, 0.23); part(bx(0.1, 0.1, 0.06), shine, -0.08, 0.92, 0.26);
  part(bx(0.5, 0.55, 0.24), pack, 0, 0.88, -0.33);
  part(bx(0.64, 0.6, 0.6), white, 0, 1.48, 0);                // mũ bảo hộ
  part(bx(0.5, 0.3, 0.1), visor, 0, 1.5, 0.3); part(bx(0.16, 0.08, 0.04), shine, -0.12, 1.58, 0.36); // kính + ánh phản chiếu
  switch (i) {
    case 0: part(bx(0.05, 0.3, 0.05), dark, 0.18, 1.92, 0); part(bx(0.14, 0.14, 0.14), shine, 0.18, 2.1, 0); break;                    // ăng-ten
    case 1: part(bx(0.7, 0.14, 0.7), suit, 0, 1.83, 0); part(bx(0.7, 0.06, 0.2), suit, 0, 1.8, 0.4); break;                              // mũ lưỡi trai
    case 2: part(bx(0.1, 0.3, 0.3), dark, -0.36, 1.48, 0); part(bx(0.1, 0.3, 0.3), dark, 0.36, 1.48, 0); part(bx(0.7, 0.06, 0.1), dark, 0, 1.82, 0); break; // tai nghe
    default: part(bx(0.06, 0.22, 0.06), voxMat(0x3f9a4a), 0, 1.88, 0); part(bx(0.22, 0.14, 0.14), voxMat(0xff7aa8), 0, 2.02, 0);        // mầm hoa
  }
  const c = document.createElement("canvas"); c.width = 128; c.height = 32; const x = c.getContext("2d")!;
  x.font = "bold 22px system-ui"; x.textAlign = "center"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(4, 3, 120, 26); x.fillStyle = "#fff"; x.fillText(NAMES[i], 64, 24);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); tag.scale.set(0.95, 0.24, 1); tag.position.y = 2.35; tag.renderOrder = 5; g.add(tag);
  Object.assign(g.userData, { m: suit, mats, legL, legR, armL, armR, tag, ph: 0, lx: 0, lz: 0 });
  scene.add(g);
  return g;
}
export const entities: Entity[] = [0, 1, 2, 3].map((i) => ({ i, g: (() => { const g = makeCrew(i); g.visible = false; return g; })(), x: 0, z: 0, rot: 0, vy: 0, y: 0, dead: false, out: false, wait: 0, tx: 0, tz: 0 }));
export const bodies: Body[] = [];
export const me = () => entities[G.slot];
export { cellOf };
const suitMat = (g: THREE.Group) => g.userData.m as THREE.MeshStandardMaterial;

export function spawnAll() {
  for (const e of entities) {
    if (e.dead || e.out) continue;
    e.x = CEN[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 1.6;
    e.z = CEN[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 1.6;
    e.tx = CEN[cellOf(e.x)]; e.tz = CEN[cellOf(e.z)]; e.g.visible = true;
  }
}
/** Đẩy thực thể ra khỏi tường/đồ vật (vòng tròn bán kính .5 vs hộp AABB). */
export function collide(e: { x: number; z: number }) {
  for (const [cx, cz, w, d] of WALLS) {
    const nx = Math.max(cx - w / 2, Math.min(e.x, cx + w / 2)), nz = Math.max(cz - d / 2, Math.min(e.z, cz + d / 2));
    let dx = e.x - nx, dz = e.z - nz, l = Math.hypot(dx, dz);
    if (l < 0.5) { if (l < 1e-4) { dx = 1; dz = 0; l = 1; } e.x += (dx / l) * (0.5 - l); e.z += (dz / l) * (0.5 - l); }
  }
  keepOnIsland(e);   // không lội xuống biển
}
const gray = (g: THREE.Group) => { suitMat(g).color.setHex(0x666666); (g.userData.mats[3] as THREE.MeshStandardMaterial).color.setHex(0x555555); g.userData.tag.visible = false; };
/** Đánh dấu người chơi `i` đã chết: Bot thành xác tại chỗ; người chơi thật thành hồn ma + để lại xác. */
export function markDead(i: number, toast: (m: string) => void) {
  if (G.dead.has(i)) return;
  G.dead.add(i);
  const e = entities[i];
  if (i === G.slot) {
    G.ghost = true;
    const b = makeCrew(i); b.position.set(e.x, 0.3, e.z); b.rotation.z = Math.PI / 2; gray(b);
    bodies.push({ x: e.x, z: e.z, g: b, own: true });
    for (const m of e.g.userData.mats as THREE.Material[]) { m.transparent = true; m.opacity = 0.35; }
    toast("💀 Bạn đã bị giết — giờ bạn là hồn ma");
  } else {
    e.dead = true; e.g.rotation.z = Math.PI / 2; e.g.position.y = 0.3; gray(e.g);
    bodies.push({ x: e.x, z: e.z, g: e.g });
  }
}
/** Hoạt ảnh đi bộ: vung tay chân theo tốc độ thực tế, thở nhẹ khi đứng yên. */
export function animateCrew(dt: number, t: number) {
  for (const e of entities) {
    const u = e.g.userData; if (e.dead) continue;
    const sp = dt > 0 ? Math.hypot(e.x - u.lx, e.z - u.lz) / dt : 0; u.lx = e.x; u.lz = e.z;
    const k = Math.min(1, sp / 3) * (e.y > 0.05 ? 0.3 : 1); u.ph += Math.min(sp, 8) * dt * 2.3;
    const sw = Math.sin(u.ph) * 0.8 * k, br = Math.sin(t * 2 + e.i) * 0.03;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw * 0.9 + br; u.armR.rotation.x = sw * 0.9 - br;
  }
}
