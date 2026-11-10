import * as THREE from "three";
import { scene } from "./scene";
import { CEN } from "../config";
import type { Station, TaskType } from "../types";

/** Hộp va chạm [cx, cz, width, depth] */
export const WALLS: [number, number, number, number][] = [[0, -20.5, 42, 1], [0, 20.5, 42, 1], [-20.5, 0, 1, 42], [20.5, 0, 1, 42]];
export const wallMeshes: THREE.Mesh[] = [];
export const VENTS: [number, number][] = [[13.5, 0], [-13.5, 0], [0, 13.5]];

// 2 đường kẻ x=±7 và z=±7, mỗi ô có cửa rộng 4m ở giữa
const cells = [[-20, -7], [-7, 7], [7, 20]];
for (const L of [-7, 7]) for (const [a, b] of cells) {
  const c = (a + b) / 2;
  WALLS.push([L, (a + c - 2) / 2, 1, c - 2 - a], [L, (c + 2 + b) / 2, 1, b - c - 2], [(a + c - 2) / 2, L, c - 2 - a, 1], [(c + 2 + b) / 2, L, b - c - 2, 1]);
}
const wallMat = new THREE.MeshStandardMaterial({ color: 0x39407a });
for (const [x, z, w, d] of WALLS) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), wallMat);
  m.position.set(x, 1.5, z); scene.add(m); wallMeshes.push(m);
}
WALLS.push([0, 0, 2.4, 2.4]); // bàn họp: chỉ va chạm, không chắn tầm nhìn

for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshStandardMaterial({ color: (i + j) % 2 ? 0x141a3a : 0x1c2350 }));
  f.rotation.x = -Math.PI / 2; f.position.set(CEN[i], 0, CEN[j]); scene.add(f);
}
const table = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.9, 24), new THREE.MeshStandardMaterial({ color: 0x888ecc }));
table.position.y = 0.45;
const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
btn.position.y = 1;
scene.add(table, btn);

const defs: [number, number, TaskType][] = [[-13.5, -13.5, "wires"], [13.5, -13.5, "code"], [-13.5, 13.5, "hold"], [13.5, 13.5, "wires"], [0, -13.5, "code"]];
export const stations: Station[] = defs.map(([x, z, type]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x332200 }));
  m.position.set(x, 0.85, z); scene.add(m);
  return { x, z, type, m, active: false, done: false };
});
[...stations].sort(() => Math.random() - 0.5).slice(0, 3).forEach((s) => { s.active = true; (s.m.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00); });

for (const [x, z] of VENTS) {
  const v = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x000000 }));
  v.position.set(x, 0.06, z); scene.add(v);
}
const sp = new Float32Array(1200).map(() => (Math.random() - 0.5) * 160);
const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.2 })));
