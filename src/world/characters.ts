import * as THREE from "three";
import { scene } from "./scene";
import { WALLS } from "./map";
import { COLORS, CEN } from "../config";
import { G } from "../state";
import type { Entity, Body } from "../types";

export function makeCrew(i: number) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: COLORS[i] });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); };
  add(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 16), m, 0, 0.55, 0);
  add(new THREE.SphereGeometry(0.45, 16, 12), m, 0, 1, 0);
  add(new THREE.BoxGeometry(0.55, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0x9be7ff, emissive: 0x224455 }), 0, 1.05, 0.32);
  add(new THREE.BoxGeometry(0.3, 0.6, 0.25), m, 0, 0.55, -0.45);
  g.userData.m = m; scene.add(g);
  return g;
}
export const entities: Entity[] = [0, 1, 2, 3].map((i) => ({ i, g: makeCrew(i), x: 0, z: 0, rot: 0, vy: 0, y: 0, dead: false, out: false, wait: 0, tx: 0, tz: 0 }));
export const bodies: Body[] = [];
export const me = () => entities[G.slot];
export const cellOf = (v: number) => (v < -7 ? 0 : v > 7 ? 2 : 1);
const mat = (g: THREE.Group) => g.userData.m as THREE.MeshStandardMaterial;

export function spawnAll() {
  for (const e of entities) {
    if (e.dead || e.out) continue;
    e.x = CEN[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 1.6;
    e.z = CEN[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 1.6;
    e.tx = CEN[cellOf(e.x)]; e.tz = CEN[cellOf(e.z)]; e.g.visible = true;
  }
}
/** Đẩy thực thể ra khỏi tường (vòng tròn bán kính .5 vs hộp AABB). */
export function collide(e: { x: number; z: number }) {
  for (const [cx, cz, w, d] of WALLS) {
    const nx = Math.max(cx - w / 2, Math.min(e.x, cx + w / 2)), nz = Math.max(cz - d / 2, Math.min(e.z, cz + d / 2));
    let dx = e.x - nx, dz = e.z - nz, l = Math.hypot(dx, dz);
    if (l < 0.5) { if (l < 1e-4) { dx = 1; dz = 0; l = 1; } e.x += (dx / l) * (0.5 - l); e.z += (dz / l) * (0.5 - l); }
  }
}
/** Đánh dấu người chơi `i` đã chết: Bot thành xác tại chỗ; người chơi thật thành hồn ma + để lại xác. */
export function markDead(i: number, toast: (m: string) => void) {
  if (G.dead.has(i)) return;
  G.dead.add(i);
  const e = entities[i];
  if (i === G.slot) {
    G.ghost = true;
    const b = makeCrew(i); b.position.set(e.x, 0.3, e.z); b.rotation.z = Math.PI / 2; mat(b).color.setHex(0x666666);
    bodies.push({ x: e.x, z: e.z, g: b, own: true });
    mat(e.g).transparent = true; mat(e.g).opacity = 0.35;
    toast("💀 Bạn đã bị giết — giờ bạn là hồn ma");
  } else {
    e.dead = true; e.g.rotation.z = Math.PI / 2; e.g.position.y = 0.3; mat(e.g).color.setHex(0x666666);
    bodies.push({ x: e.x, z: e.z, g: e.g });
  }
}
