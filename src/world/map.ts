import * as THREE from "three";
import { scene } from "./scene";
import { CEN } from "../config";
import { VoxelBatch, Glow, voxMat, hash } from "./voxel";
import type { Station, TaskType } from "../types";

/* ───────────── Dữ liệu logic (va chạm / tầm nhìn) — không đổi so với bản cũ ───────────── */
/** Hộp va chạm [cx, cz, width, depth] */
export const WALLS: [number, number, number, number][] = [[0, -20.5, 42, 1], [0, 20.5, 42, 1], [-20.5, 0, 1, 42], [20.5, 0, 1, 42]];
export const wallMeshes: THREE.Mesh[] = [];
export const VENTS: [number, number][] = [[13.5, 0], [-13.5, 0], [0, 13.5]];

const cells = [[-20, -7], [-7, 7], [7, 20]];
for (const L of [-7, 7]) for (const [a, b] of cells) {
  const c = (a + b) / 2;
  WALLS.push([L, (a + c - 2) / 2, 1, c - 2 - a], [L, (c + 2 + b) / 2, 1, b - c - 2], [(a + c - 2) / 2, L, c - 2 - a, 1], [(c + 2 + b) / 2, L, b - c - 2, 1]);
}
const wallBoxes = WALLS.slice();
/** Hộp vô hình chỉ để raycast tầm nhìn (fog of war). */
const hidden = new THREE.MeshBasicMaterial({ visible: false });
for (const [x, z, w, d] of wallBoxes) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), hidden);
  m.position.set(x, 1.5, z); scene.add(m); m.updateMatrixWorld(); wallMeshes.push(m);
}
WALLS.push([0, 0, 2.4, 2.4]); // bàn họp

/* ───────────── Hình ảnh voxel ───────────── */
const B = new VoxelBatch(), FL = new VoxelBatch(), GL = new Glow();
const anim: ((t: number, dt: number) => void)[] = [];
const col = (x: number, z: number, w: number, d: number) => WALLS.push([x, z, w, d]);
const rnd = (a: number, b: number, k: number) => a + hash(k, k * 1.3) * (b - a);

// Sàn: mỗi phòng một bảng màu, lát gạch 2x2
const FLOORS: Record<string, [number, number]> = {
  "0,0": [0x8fa3c9, 0x7e92b8], "1,0": [0xe2eaf3, 0xcddbe9], "2,0": [0x9ad0c8, 0x86bfb7],
  "0,1": [0xb89e7a, 0xa98d6b], "1,1": [0xf1e3c8, 0xe4d3b1], "2,1": [0x8c92bd, 0x7c82ad],
  "0,2": [0x80d37e, 0x6dc36b], "1,2": [0x9da2b3, 0x8b90a3], "2,2": [0xdba56a, 0xc99259],
};
const cellOf = (v: number) => (v < -7 ? 0 : v > 7 ? 2 : 1);
for (let x = -21; x < 21; x++) for (let z = -21; z < 21; z++) {
  const cx = x + 0.5, cz = z + 0.5, pal = FLOORS[`${cellOf(cx)},${cellOf(cz)}`];
  let c = pal[(Math.floor(cx / 2) + Math.floor(cz / 2)) & 1];
  const r = Math.hypot(cx, cz);
  if (r < 4.6 && r > 3.6) c = 0xc9535b; else if (r <= 3.6) c = (Math.floor(r) & 1) ? 0xe9b15f : 0xf2d08a; // thảm tròn ở sảnh
  if (cellOf(cx) === 2 && cellOf(cz) === 2 && Math.abs(Math.abs(cz) - 13.5) < 0.6 && Math.abs(cx) > 8) c = Math.floor(cx) % 2 ? 0x222 : 0xffcc22; // vạch hazard khu lò phản ứng
  FL.cube(cx, -0.5, cz, c, 0.05);
}

// Tường: khối 1m, 3 tầng, có cửa sổ ở tường ngoài
const WIN = [-13.5, 0, 13.5];
for (const [cx, cz, w, d] of wallBoxes) {
  const alongX = w >= d, len = alongX ? w : d, n = Math.max(1, Math.round(len)), s = len / n, outer = Math.abs(cx) === 20.5 || Math.abs(cz) === 20.5;
  for (let k = 0; k < n; k++) {
    const a = (alongX ? cx : cz) - len / 2 + s * (k + 0.5), px = alongX ? a : cx, pz = alongX ? cz : a;
    const win = outer && len > 30 && WIN.some((q) => Math.abs(a - q) < 1.6);
    const sx = alongX ? s : w, sz = alongX ? d : s;
    B.box(px, 0.5, pz, sx, 1, sz, 0x6674a6);
    if (!win) B.box(px, 1.5, pz, sx, 1, sz, outer ? 0xf3ede0 : 0xdfe6f7);
    B.box(px, 2.5, pz, sx, 1, sz, outer ? 0xff9a5c : 0x9aa8d8);
  }
  if (outer && len > 30) for (const q of WIN) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshBasicMaterial({ color: 0xa8e0ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    g.position.set(alongX ? q : cx, 1.5, alongX ? cz : q); if (!alongX) g.rotation.y = Math.PI / 2; scene.add(g);
  }
}

/* ───── Props (đặt ở góc phòng để không chắn lối đi qua cửa) ───── */
const LED = [0x3dff7a, 0xff4d4d, 0x4dc3ff, 0xffd24d];
function crates(x: number, z: number, k = 1) {
  B.box(x, 0.5, z, 1, 1, 1, 0xb5833f); B.box(x + 1, 0.5, z, 1, 1, 1, 0xa5733a); B.box(x + 0.4, 1.5, z + 0.05, 1, 1, 1, 0xc59350);
  if (k > 1) B.box(x - 0.9, 0.5, z + 0.2, 1, 1, 1, 0x9a6a36);
  col(x + 0.5, z, 2.2, 1.3);
}
function barrel(x: number, z: number, c = 0xd2553a) { B.box(x, 0.6, z, 0.8, 1.2, 0.8, c); B.box(x, 0.3, z, 0.86, 0.12, 0.86, 0x3a3f55); B.box(x, 0.9, z, 0.86, 0.12, 0.86, 0x3a3f55); col(x, z, 0.9, 0.9); }
function plant(x: number, z: number, big: boolean, leaf = 0x4fc261) {
  B.box(x, 0.3, z, 0.9, 0.6, 0.9, 0xa0623f); B.box(x, 0.62, z, 0.8, 0.1, 0.8, 0x5a3a24);
  if (big) { for (let y = 0; y < 3; y++) B.box(x, 0.75 + y * 0.8, z, 0.4, 0.8, 0.4, 0x7a5232);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < 2; dy++) if (Math.abs(dx) + Math.abs(dz) + dy < 3) B.cube(x + dx * 0.85, 2.9 + dy * 0.85, z + dz * 0.85, leaf, 0.12);
    B.cube(x, 4.5, z, leaf, 0.12); col(x, z, 1, 1);
  } else { for (let i = 0; i < 6; i++) B.box(x + rnd(-.3, .3, i + x), 0.8 + (i % 3) * 0.3, z + rnd(-.3, .3, i * 2 + z), 0.35, 0.35, 0.35, leaf, 0.15); col(x, z, 0.9, 0.9); }
}
function rack(x: number, z: number, fx: number, fz: number) {
  B.box(x, 1.15, z, fx ? 0.9 : 1.1, 2.3, fx ? 1.1 : 0.9, 0x2d3354);
  for (let r = 0; r < 5; r++) for (let c = -1; c <= 1; c++) {
    const k = x * 7 + z * 3 + r * 11 + c;
    GL.add(x + fx * 0.46 + (fz ? c * 0.3 : 0), 0.45 + r * 0.38, z + fz * 0.46 + (fx ? c * 0.3 : 0), 0.14, LED[(hash(k, 1) * 4) | 0], 2 + hash(k, 2) * 5, hash(k, 3) * 6);
  }
  col(x, z, fx ? 1 : 1.2, fx ? 1.2 : 1);
}
function monitorDesk(x: number, z: number, fx: number, fz: number, c = 0x4dc3ff) {
  B.box(x, 0.45, z, fx ? 0.8 : 1.8, 0.9, fx ? 1.8 : 0.8, 0x4a5177);
  B.box(x - fx * 0.2, 1.3, z - fz * 0.2, fx ? 0.12 : 1.5, 0.8, fx ? 1.5 : 0.12, 0x20243a);
  for (let i = 0; i < 4; i++) GL.add(x + fx * 0.07 - fx * 0.2, 1.1 + (i % 2) * 0.4, z + fz * 0.07 - fz * 0.2 + (fx ? (i - 1.5) * 0.35 : 0), 0.28, c, 1 + i, i * 1.3, 0.3);
  col(x, z, fx ? 0.9 : 1.9, fx ? 1.9 : 0.9);
}
function bed(x: number, z: number) {
  B.box(x, 0.35, z, 1.1, 0.7, 2.3, 0xeef2fa); B.box(x, 0.78, z + 0.1, 1.02, 0.16, 1.9, 0x6fa8e6); B.box(x, 0.85, z - 0.85, 0.8, 0.18, 0.5, 0xffffff);
  GL.add(x + 0.7, 0.9, z + 1, 0.16, 0x3dff7a, 3, x); col(x, z, 1.2, 2.4);
}
function lamp(x: number, z: number, c = 0xfff0b0) { B.box(x, 1.1, z, 0.2, 2.2, 0.2, 0x3a3f55); GL.add(x, 2.35, z, 0.55, c, 1.2, x, 0.75); col(x, z, 0.4, 0.4); }
function holoGlobe(x: number, z: number) {
  B.box(x, 0.25, z, 1.4, 0.5, 1.4, 0x35406b);
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0x59d6ff, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false });
  for (let i = 0; i < 26; i++) { const a = i * 2.4, y = 1 - (i / 25) * 2, r = Math.sqrt(1 - y * y), c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), m); c.position.set(Math.cos(a) * r * 0.8, y * 0.8, Math.sin(a) * r * 0.8); g.add(c); }
  g.position.set(x, 1.8, z); scene.add(g); anim.push((t) => { g.rotation.y = t * 0.8; g.position.y = 1.8 + Math.sin(t * 1.5) * 0.12; }); col(x, z, 1.4, 1.4);
}
function radar(x: number, z: number) {
  B.box(x, 1.2, z, 0.5, 2.4, 0.5, 0x59608a); const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 1.1), voxMat(0xf3ede0)); dish.position.set(0, 0, 0); dish.rotation.x = -0.5; g.add(dish);
  const ant = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), voxMat(0xff6a4d)); ant.position.set(0, 0.35, 0.3); g.add(ant);
  g.position.set(x, 2.7, z); g.traverse((o) => { o.castShadow = true; }); scene.add(g); anim.push((t) => { g.rotation.y = t * 0.9; }); col(x, z, 0.7, 0.7);
}
function reactor(x: number, z: number) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(x + dx * 1.1, 1.5, z + dz * 1.1, 0.45, 3, 0.45, 0x3b4268);
  B.box(x, 0.2, z, 3, 0.4, 3, 0x2a2f4d); B.box(x, 3.1, z, 3, 0.3, 3, 0x2a2f4d);
  GL.add(x, 1.6, z, 1.5, 0xff8a2a, 2.2, 0, 0.55);
  for (let i = 0; i < 8; i++) GL.add(x + Math.cos(i * 0.785) * 1.25, 1.6 + (i % 2 ? 0.5 : -0.5), z + Math.sin(i * 0.785) * 1.25, 0.2, 0xffd24d, 3, i, 0.4);
  const L = new THREE.PointLight(0xff8a2a, 10, 9, 2); L.position.set(x, 1.8, z); scene.add(L);
  anim.push((t) => { L.intensity = 8 + Math.sin(t * 4) * 3; }); col(x, z, 3, 3);
}
function fan(x: number, z: number) {
  B.box(x, 1, z, 0.3, 2, 0.3, 0x59608a); const g = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.35), voxMat(0xc7d0ee)); b.rotation.y = i * Math.PI / 2; g.add(b); }
  g.position.set(x, 2.1, z); scene.add(g); anim.push((t) => { g.rotation.y = t * 7; }); col(x, z, 0.5, 0.5);
}
function tank(x: number, z: number) {
  B.box(x, 0.2, z, 1.9, 0.4, 1.9, 0x3b4268); B.box(x, 3, z, 1.9, 0.3, 1.9, 0x3b4268);
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.6, 1.7), new THREE.MeshStandardMaterial({ color: 0x6cf0b4, transparent: true, opacity: 0.32, roughness: 0.2 }));
  m.position.set(x, 1.7, z); scene.add(m);
  const bub = new THREE.MeshBasicMaterial({ color: 0xd8fff0 }), bs: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), bub); scene.add(b); bs.push(b); }
  anim.push((t) => bs.forEach((b, i) => { b.position.set(x + Math.sin(i * 2.1) * 0.6, 0.5 + ((t * 0.5 + i * 0.37) % 1) * 2.4, z + Math.cos(i * 1.7) * 0.6); }));
  col(x, z, 2, 2);
}
function shuttle(x: number, z: number) {
  B.box(x, 0.9, z, 4, 1.2, 1.9, 0xf3f4fa); B.box(x + 2.3, 0.9, z, 0.7, 0.8, 1.3, 0xd04a4a); B.box(x - 0.2, 1.7, z, 2, 0.5, 1.5, 0xe5e8f3);
  B.box(x - 2.1, 0.9, z, 0.5, 1.3, 2.4, 0x3b4268); B.box(x, 0.2, z + 0.8, 3.4, 0.4, 0.3, 0x3b4268); B.box(x, 0.2, z - 0.8, 3.4, 0.4, 0.3, 0x3b4268);
  for (let i = 0; i < 3; i++) GL.add(x - 0.8 + i * 0.9, 1.35, z + 0.96, 0.4, 0x7fd8ff, 1, i);
  col(x, z, 4.6, 2.4);
}
function stool(x: number, z: number, c: number) { B.box(x, 0.3, z, 0.6, 0.6, 0.6, c); }
function vending(x: number, z: number, fx: number) {
  B.box(x, 1.1, z, 1.1, 2.2, 0.9, 0xd04a4a); GL.add(x + fx * 0.47, 1.4, z, 0.7, 0xfff0b0, 1.5, x, 0.7); col(x, z, 1.2, 1.1);
}
function bench(x: number, z: number, alongX: boolean) { B.box(x, 0.3, z, alongX ? 2.2 : 0.6, 0.6, alongX ? 0.6 : 2.2, 0x6a7ad8); col(x, z, alongX ? 2.3 : 0.7, alongX ? 0.7 : 2.3); }

// Bố trí từng phòng (ct = tâm phòng, s = hướng góc ±1)
const R = (i: number, j: number) => [CEN[i], CEN[j]] as const;
{ // (0,0) Điện
  const [cx, cz] = R(0, 0); rack(cx - 6, cz - 4.5, 1, 0); rack(cx - 6, cz - 2.9, 1, 0); rack(cx + 5.8, cz - 4.5, -1, 0); crates(cx + 4.6, cz + 4.6); plant(cx - 5.4, cz + 4.6, false); lamp(cx + 5.8, cz + 3);
}
{ // (1,0) Y tế
  const [cx, cz] = R(1, 0); bed(cx - 4.8, cz - 3.8); bed(cx + 4.8, cz - 3.8); plant(cx - 5.5, cz + 4.6, true, 0x6fe08a); monitorDesk(cx + 5.8, cz + 4, -1, 0, 0x6fe0b0);
  B.box(cx, 2.9, cz - 5.6, 3, 0.25, 0.3, 0x59608a); GL.add(cx, 2.7, cz - 5.6, 0.3, 0x6fe0b0, 1.5, 0, 0.4);
}
{ // (2,0) Điều hướng
  const [cx, cz] = R(2, 0); holoGlobe(cx + 4.8, cz - 4.2); radar(cx - 4.8, cz - 4.6); monitorDesk(cx + 5.8, cz + 4, -1, 0); monitorDesk(cx - 5.8, cz + 4, 1, 0, 0xffd24d); lamp(cx - 5.6, cz - 1.4, 0x9fe8ff);
}
{ // (0,1) Kho
  const [cx, cz] = R(0, 1); crates(cx - 5.2, cz - 4.6, 2); crates(cx - 5.2, cz + 4.6); barrel(cx + 5.6, cz - 4.6); barrel(cx + 5.6, cz - 3.5, 0x4a8fd2); barrel(cx + 5.6, cz + 4.6, 0xe0b030); crates(cx + 4.4, cz + 5.2);
}
{ // (1,1) Sảnh ăn: bàn tròn voxel + ghế
  const r = 1.2; for (let x = -1.2; x <= 1.2; x += 0.4) for (let z = -1.2; z <= 1.2; z += 0.4) if (Math.hypot(x, z) <= r + 0.1) B.box(x, 0.86, z, 0.4, 0.16, 0.4, 0xd6c9a4, 0.04);
  B.box(0, 0.4, 0, 0.7, 0.8, 0.7, 0x59608a); GL.add(0, 1.15, 0, 0.45, 0xff3030, 3, 0, 0.45);
  for (let i = 0; i < 6; i++) stool(Math.cos(i * 1.047) * 2.0, Math.sin(i * 1.047) * 2.0, [0x6a7ad8, 0xe0728a, 0x59c28a][i % 3]);
  plant(-5.6, -5, true, 0xf48fb1); plant(5.6, -5, true, 0x6fe08a); vending(-5.8, 5, 1); bench(5, 5.6, true); lamp(-5.8, -2.8); lamp(5.8, 2.8);
}
{ // (2,1) An ninh
  const [cx, cz] = R(2, 1); monitorDesk(cx + 5.8, cz - 4.2, -1, 0, 0xff6a6a); monitorDesk(cx + 5.8, cz - 2.2, -1, 0, 0x4dc3ff); rack(cx + 5.8, cz + 4.2, -1, 0); crates(cx - 4.8, cz + 5); lamp(cx - 5.6, cz - 4.6, 0xff8a8a);
}
{ // (0,2) Vườn / O₂
  const [cx, cz] = R(0, 2); tank(cx - 5, cz + 4.6); plant(cx + 5, cz + 4.8, true, 0x4fc261); plant(cx + 5.6, cz - 4.6, true, 0xf48fb1); plant(cx - 5.4, cz - 4.8, true, 0x7fe07a); plant(cx - 5.6, cz - 2.9, false, 0xffd24d); plant(cx + 3.6, cz + 5.6, false, 0xff8fbf);
}
{ // (1,2) Bến đỗ
  const [cx, cz] = R(1, 2); shuttle(cx - 4.2, cz + 4.9); crates(cx + 4.2, cz + 5, 2); barrel(cx + 5.7, cz - 4.6); lamp(cx - 5.8, cz - 4.4, 0xffd24d);
}
{ // (2,2) Lò phản ứng
  const [cx, cz] = R(2, 2); reactor(cx + 4.6, cz + 4.4); fan(cx - 4.8, cz + 4.8); rack(cx - 5.9, cz - 4.4, 1, 0); fan(cx + 5, cz - 4.8); barrel(cx - 3.6, cz - 5.6, 0xe0b030);
}

// Trạm nhiệm vụ: tủ voxel + màn hình (Mesh `m` giữ API cũ: đổi emissive khi xong) + chùm sáng chỉ đường
const defs: [number, number, TaskType][] = [[-13.5, -13.5, "wires"], [13.5, -13.5, "code"], [-13.5, 13.5, "hold"], [13.5, 13.5, "wires"], [0, -13.5, "code"]];
const ICON: Record<TaskType, number> = { wires: 0xffd24d, code: 0x4dc3ff, hold: 0x6fe08a };
export const stations: Station[] = defs.map(([x, z, type]) => {
  B.box(x, 0.5, z, 1.5, 1, 0.9, 0x39406f); B.box(x - 0.65, 1.2, z, 0.16, 0.5, 0.8, 0x59608a); B.box(x + 0.65, 1.2, z, 0.16, 0.5, 0.8, 0x59608a);
  GL.add(x, 1.95, z, 0.28, ICON[type], 2, x, 0.5);
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.14), new THREE.MeshStandardMaterial({ color: 0x151a33, emissive: 0x2a1a00, roughness: 0.4 }));
  m.position.set(x, 1.4, z); m.rotation.x = -0.35; m.castShadow = true; scene.add(m);
  const beam = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cyl.position.y = 3.5; const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffcc55, toneMapped: false }));
  beam.add(cyl, dia); beam.position.set(x, 0, z); beam.visible = false; scene.add(beam); (m as any).userData.beam = { beam, dia };
  col(x, z, 1.5, 0.9);
  return { x, z, type, m, active: false, done: false };
});
[...stations].sort(() => Math.random() - 0.5).slice(0, 3).forEach((s) => { s.active = true; (s.m.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00); });

// Vent: lưới sắt có đèn xanh nhấp nháy
for (const [x, z] of VENTS) {
  B.box(x, 0.07, z, 1.9, 0.14, 1.9, 0x555c85); B.box(x, 0.1, z, 1.5, 0.12, 1.5, 0x15182b);
  for (let i = -2; i <= 2; i++) GL.add(x + i * 0.3, 0.17, z, 0.08, 0x3dff7a, 2, i * 0.7, 0.2);
}

// Đưa vào scene
const bMesh = B.build(true, true), fMesh = FL.build(false, true);
scene.add(fMesh, bMesh, GL.build());

/** Cập nhật hoạt ảnh trạm: đèn nhấp nháy, quạt, radar, chùm sáng trạm nhiệm vụ. */
export function updateMap(t: number, dt: number) {
  GL.update(t); for (const f of anim) f(t, dt);
  for (const s of stations) {
    const u = (s.m.userData.beam) as { beam: THREE.Group; dia: THREE.Mesh }, on = s.active && !s.done;
    u.beam.visible = on;
    if (on) { u.dia.position.y = 3 + Math.sin(t * 2.5) * 0.3; u.dia.rotation.y = t * 2; (s.m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + 0.5 * Math.sin(t * 4); }
    else (s.m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
  }
}
