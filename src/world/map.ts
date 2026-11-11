import * as THREE from "three";
import { scene } from "./scene";
import { CEN } from "../config";
import { VoxelBatch, Glow, voxMat, hash } from "./voxel";
import { DOCK } from "./island";
import type { Station, TaskType } from "../types";

/* ───────────── Dữ liệu logic (va chạm / tầm nhìn) ───────────── */
/** Hộp va chạm [cx, cz, width, depth]. Đảo hoang không có tường: chỉ có vật cản (nhà, đá, bụi, cọc…) + bờ biển (island.ts). */
export const WALLS: [number, number, number, number][] = [];
export const wallMeshes: THREE.Mesh[] = [];
export const VENTS: [number, number][] = [[18, 0], [-18, 0], [0, 18]];   // 3 "hang bí mật" của Impostor
/** Vùng đã có công trình — địa hình không rải cây vào đây. [x, z, bán kính] */
export const reserved: [number, number, number][] = [];

const hidden = new THREE.MeshBasicMaterial({ visible: false });
const col = (x: number, z: number, w: number, d: number) => WALLS.push([x, z, w, d]);
/** Vật cản đặc: chặn đường đi + (mặc định) chặn tầm nhìn (fog of war) và camera. */
function solid(x: number, z: number, w: number, d: number, sight = true) {
  WALLS.push([x, z, w, d]);
  if (!sight) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), hidden);
  m.position.set(x, 1.5, z); scene.add(m); m.updateMatrixWorld(); wallMeshes.push(m);
}
const use = (x: number, z: number, r: number) => reserved.push([x, z, r]);

const B = new VoxelBatch(), GL = new Glow();
const anim: ((t: number, dt: number) => void)[] = [];
const WATER_Y = -0.75;
const mb = (p: THREE.Object3D, w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), voxMat(c)); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m;
};

/* ───── Công trình & đạo cụ ───── */
function campfire() { // đống lửa trung tâm = nơi họp khẩn
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; B.box(Math.cos(a) * 1.4, 0.22, Math.sin(a) * 1.4, 0.55, 0.44, 0.55, i % 2 ? 0x8d8a84 : 0x77746f); }
  B.box(0, 0.2, 0, 1.7, 0.25, 0.3, 0x6b4423); B.box(0, 0.2, 0, 0.3, 0.25, 1.7, 0x5a3a1c); B.box(0, 0.42, 0, 1.2, 0.22, 0.28, 0x7a5230);
  GL.add(0, 0.6, 0, 0.55, 0xff7a1a, 5, 0, 0.55); GL.add(0.12, 1.0, 0.05, 0.38, 0xffc83d, 7, 1, 0.4); GL.add(-0.1, 1.35, -0.05, 0.22, 0xfff0a0, 9, 2, 0.3);
  for (let i = 0; i < 5; i++) GL.add(Math.cos(i * 1.3) * 0.5, 0.3 + (i % 2) * 0.1, Math.sin(i * 1.3) * 0.5, 0.12, 0xff5a1a, 3 + i, i, 0.3);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.5; B.box(x, 0.3, z, 0.8, 0.6, 0.8, 0x9a6a3a); B.box(x, 0.62, z, 0.7, 0.06, 0.7, 0xc89a60); }
  const L = new THREE.PointLight(0xff8a2a, 9, 14, 2); L.position.set(0, 1.4, 0); scene.add(L);
  anim.push((t) => { L.intensity = 8 + Math.sin(t * 9) * 1.6 + Math.sin(t * 5.3) * 1.2; });
  col(0, 0, 2.4, 2.4); use(0, 0, 7);
}
function tiki(x: number, z: number) { // đuốc tiki
  B.box(x, 1.1, z, 0.16, 2.2, 0.16, 0x6b4423); B.box(x, 2.25, z, 0.36, 0.2, 0.36, 0x4a3018);
  GL.add(x, 2.5, z, 0.4, 0xff8a2a, 6, x, 0.5); GL.add(x, 2.78, z, 0.22, 0xffd24d, 8, x + 1, 0.4); col(x, z, 0.4, 0.4); use(x, z, 1);
}
function hut(x: number, z: number) { // nhà tranh
  B.box(x, 0.15, z, 3.7, 0.3, 3.7, 0x8a6238); B.box(x, 1.3, z, 3.1, 2, 3.1, 0xc9a55f);
  for (const [dx, dz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) B.box(x + dx, 1.4, z + dz, 0.3, 2.3, 0.3, 0x6b4423);
  for (let k = 0; k < 4; k++) { const w = 4.5 - k * 1.05; B.box(x, 2.55 + k * 0.45, z, w, 0.45, w, k % 2 ? 0xd9b55a : 0xc9a24a); }
  B.box(x, 1.0, z + 1.57, 0.9, 1.6, 0.06, 0x2a1a10); GL.add(x + 1.2, 1.7, z + 1.58, 0.35, 0xffd88a, 1, x, 0.6);
  solid(x, z, 3.7, 3.7); use(x, z, 4);
}
function bush(x: number, z: number, c = 0x3a9a48) { // bụi rậm: chắn tầm nhìn
  B.box(x, 0.7, z, 2.0, 1.4, 1.8, c, 0.12); B.box(x - 0.5, 1.5, z + 0.1, 1.1, 0.8, 1.1, 0x44ad52, 0.12); B.box(x + 0.6, 1.25, z - 0.3, 0.9, 0.7, 0.9, 0x2f8a40, 0.12);
  for (let i = 0; i < 3; i++) B.box(x + (i - 1) * 0.7, 1.6 + (i % 2) * 0.2, z + 0.95, 0.2, 0.2, 0.2, [0xff7aa8, 0xffd24d, 0xffffff][i], 0.05);
  solid(x, z, 2.2, 2.0); use(x, z, 2);
}
function rockPile(x: number, z: number, s = 1) { // đá lớn chắn tầm nhìn
  B.box(x, 0.8 * s, z, 3 * s, 1.6 * s, 2.6 * s, 0x8f8c87, 0.09); B.box(x - 0.3 * s, 2.0 * s, z + 0.2 * s, 2 * s, 1.2 * s, 1.8 * s, 0x9a9690, 0.09); B.box(x + 0.4 * s, 3.0 * s, z - 0.1 * s, 1.1 * s, 0.9 * s, 1.1 * s, 0xa6a29b, 0.09);
  solid(x, z, 3.1 * s, 2.7 * s); use(x, z, 3 * s);
}
function ruins(cx: number, cz: number) { // tàn tích cổ + bàn thờ phát sáng
  const P: [number, number, number][] = [[-2, 2, 4], [-2, -2, 4], [2, 2, 2.4], [2, -2, 3.2]];
  for (const [dx, dz, h] of P) { B.box(cx + dx, h / 2, cz + dz, 1.1, h, 1.1, 0xbab4a5, 0.08); B.box(cx + dx, h + 0.15, cz + dz, 1.4, 0.3, 1.4, 0xa8a291, 0.08); B.box(cx + dx + 0.56, h * 0.6, cz + dz, 0.06, 0.5, 0.5, 0x4fa05a); solid(cx + dx, cz + dz, 1.2, 1.2); }
  B.box(cx - 2, 4.55, cz, 1.3, 0.7, 5.3, 0xb2ac9b, 0.08);
  B.box(cx, 0.5, cz, 1.8, 1, 1.8, 0xa8a291, 0.08); B.box(cx, 1.05, cz, 1.2, 0.1, 1.2, 0x8f8a7a); GL.add(cx, 1.5, cz, 0.45, 0x4dd8ff, 2, 0, 0.5); col(cx, cz, 1.8, 1.8); use(cx, cz, 5);
}
function shipwreck(x: number, z: number) { // xác tàu mắc cạn
  B.box(x, 0.9, z, 8, 1.6, 3, 0x6b4a2a, 0.08); B.box(x + 3.7, 1.9, z, 1, 2.6, 2.6, 0x7a5532, 0.08); B.box(x - 3.9, 1.3, z, 0.4, 1.4, 2.6, 0x5a3a1c);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) B.box(x - 3 + i * 1.5, 2.3, z + s * 1.4, 0.25, 1.4 + (i % 2) * 0.5, 0.25, 0x4a3018);
  B.box(x - 1, 4.2, z, 0.3, 6.4, 0.3, 0x4a3018); B.box(x - 1, 5.2, z + 0.05, 0.08, 2.2, 2.4, 0xe9e2cc); B.box(x - 1, 3.4, z + 0.05, 0.08, 0.8, 1.6, 0xd8d0b8);
  B.box(x + 1.5, 1.85, z, 1, 0.5, 1, 0x8a5a2a); B.box(x + 1.5, 2.2, z, 1.1, 0.2, 1.1, 0xd9b45a);
  solid(x, z, 8.2, 3.2); use(x, z, 6);
}
function volcano(cx: number, cz: number) { // núi lửa nhỏ
  const hw = [3.1, 2.6, 2.1, 1.6, 1.1];
  hw.forEach((w, y) => B.box(cx, y + 0.5, cz, w * 2, 1, w * 2, y % 2 ? 0x6b5b53 : 0x5e504a, 0.1));
  B.box(cx, 5.1, cz, 1.7, 0.3, 1.7, 0x3a2f2c); GL.add(cx, 5.3, cz, 1.0, 0xff5a1a, 3, 0, 0.5); GL.add(cx + 0.3, 5.6, cz - 0.2, 0.5, 0xffb02a, 5, 1, 0.4);
  for (let i = 0; i < 4; i++) GL.add(cx + (i - 1.5) * 0.5, 3.2 - i * 0.6, cz + 1.9 + i * 0.28, 0.22, 0xff6a2a, 2 + i, i, 0.35);
  const L = new THREE.PointLight(0xff6a2a, 14, 12, 2); L.position.set(cx, 6, cz); scene.add(L); anim.push((t) => { L.intensity = 12 + Math.sin(t * 3) * 3; });
  solid(cx, cz, 6.4, 6.4); use(cx, cz, 6);
}
function dock() { // cầu tàu ra biển + thuyền con
  const { x, z0, z1 } = DOCK;
  for (let z = z0; z < z1; z++) B.box(x, -0.1, z + 0.5, 2.4, 0.2, 0.92, z % 2 ? 0x9a6a3a : 0x8a5c30, 0.06);
  for (let z = z0 + 1; z < z1; z += 3) for (const s of [-1, 1]) { B.box(x + s * 1.2, -1.0, z, 0.28, 3.5, 0.28, 0x5a3a1c); if (z > 28) B.box(x + s * 1.2, 0.35, z, 0.22, 0.6, 0.22, 0x4a3018); }
  GL.add(x + 1.2, 0.8, z1 - 1, 0.28, 0xffd24d, 1.5, 0, 0.6); GL.add(x - 1.2, 0.8, z1 - 1, 0.28, 0xffd24d, 1.5, 1, 0.6);
  // thuyền con buộc cạnh cầu
  const g = new THREE.Group(); mb(g, 1.5, 0.5, 3.8, 0xb8663a, 0, 0.1, 0); mb(g, 1.1, 0.1, 3.0, 0x7a4a26, 0, 0.38, 0); mb(g, 1.6, 0.45, 0.6, 0xb8663a, 0, 0.2, -2.0); mb(g, 0.1, 0.1, 2.2, 0x4a3018, 0.9, 0.5, 0.2);
  g.position.set(x + 2.6, WATER_Y + 0.05, 34); scene.add(g); anim.push((t) => { g.position.y = WATER_Y + 0.05 + Math.sin(t * 1.2) * 0.06; g.rotation.z = Math.sin(t * 0.9) * 0.05; });
  B.box(x - 3.2, 0.5, 24.2, 1, 1, 1, 0xb5833f); B.box(x - 2.4, 0.5, 24.2, 1, 1, 1, 0xa5733a); B.box(x - 2.9, 1.5, 24.25, 1, 1, 1, 0xc59350); col(x - 2.8, 24.2, 2.2, 1.3); use(x, 28, 4);
}
function sailboat(x: number, z: number) { // thuyền buồm neo ngoài khơi
  const g = new THREE.Group(); mb(g, 3, 1, 7, 0xf1ead8, 0, 0.5, 0); mb(g, 2.4, 0.15, 5.6, 0x8a5a2e, 0, 1.05, 0.3); mb(g, 2.8, 1, 1.4, 0xf1ead8, 0, 0.5, 3.8); mb(g, 0.25, 7, 0.25, 0x4a3018, 0, 4.4, 0.4);
  for (let k = 0; k < 6; k++) mb(g, 0.08, 0.95, 3.6 - k * 0.55, 0xffffff, 0.05, 2.2 + k * 0.95, -1.1 - k * 0.1 + (k * 0.55) / 2);
  mb(g, 0.1, 0.5, 0.8, 0xd04a4a, 0, 8.1, 0.7);
  g.position.set(x, WATER_Y + 0.1, z); g.rotation.y = 0.5; scene.add(g);
  anim.push((t) => { g.position.y = WATER_Y + 0.1 + Math.sin(t * 0.9 + x) * 0.1; g.rotation.z = Math.sin(t * 0.7 + x) * 0.04; g.rotation.x = Math.sin(t * 0.55) * 0.025; });
}
function crates(x: number, z: number) { B.box(x, 0.5, z, 1, 1, 1, 0xb5833f); B.box(x + 1, 0.5, z, 1, 1, 1, 0xa5733a); B.box(x + 0.4, 1.5, z + 0.05, 1, 1, 1, 0xc59350); col(x + 0.5, z, 2.2, 1.3); use(x + 0.5, z, 2); }
function barrel(x: number, z: number, c = 0xd2553a) { B.box(x, 0.6, z, 0.8, 1.2, 0.8, c); B.box(x, 0.3, z, 0.86, 0.12, 0.86, 0x3a3f55); B.box(x, 0.9, z, 0.86, 0.12, 0.86, 0x3a3f55); col(x, z, 0.9, 0.9); use(x, z, 1); }
function hammock(x: number, z: number) { // võng giữa hai cây cọc
  B.box(x - 1.6, 1.0, z, 0.25, 2, 0.25, 0x6b4423); B.box(x + 1.6, 1.0, z, 0.25, 2, 0.25, 0x6b4423); B.box(x, 1.05, z, 3.0, 0.14, 0.9, 0xe0728a); B.box(x, 0.97, z, 2.2, 0.08, 0.7, 0xf2a0b4);
  col(x - 1.6, z, 0.4, 0.4); col(x + 1.6, z, 0.4, 0.4); use(x, z, 2.5);
}
function umbrella(x: number, z: number, c: number) { // dù bãi biển
  B.box(x, 1.2, z, 0.12, 2.4, 0.12, 0xeeeeee); for (let k = 0; k < 3; k++) B.box(x, 2.5 + k * 0.18, z, 3.2 - k * 1.0, 0.18, 3.2 - k * 1.0, k % 2 ? 0xffffff : c, 0.03);
  B.box(x + 1.5, 0.2, z + 0.4, 0.8, 0.4, 1.6, 0x6aa0e6); col(x, z, 0.3, 0.3); use(x, z, 2.2);
}

/* ───── Bố trí theo khu vực (lưới 3×3, tâm = CEN) ───── */
campfire();
for (const [x, z] of [[4.6, 4.6], [-4.6, 4.6], [4.6, -4.6], [-4.6, -4.6]]) tiki(x, z);
hut(-25, 8); hut(-25, -9);                       // Trại bên Tây
hammock(-24, 20);                                // Tây-Nam
ruins(25, -9);                                   // Đông-Bắc: tàn tích
rockPile(26, 10, 1.1); rockPile(22, 13.5, 0.8); rockPile(-13, -26, 0.9);   // đá
shipwreck(-8, -31);                              // Bắc: xác tàu
volcano(22.5, 22.5);                             // Đông-Nam: núi lửa
dock(); sailboat(-16, 48); sailboat(60, -30);     // Nam: cầu tàu + thuyền
crates(-5, -28); barrel(-4, -26.6); barrel(12, -25, 0x4a8fd2); crates(-25, 27); barrel(-22, 25, 0xe0b030);
umbrella(-4, 26, 0xe0528a); umbrella(14.5, 27, 0x4da6ff);
for (const [x, z] of [[-12, -12], [-7.5, -13.5], [-13.5, -6.5], [-4.5, -11.5], [11, -13], [5.5, -7], [13.5, -5], [12, -12.5], [-11, 6], [-6, 12.5], [-13, 13.5], [11, 6], [6.5, 13], [13, 12], [-24, -15], [24, -16], [-24, -3], [25, 4], [-14, 24], [14, -24], [-26, 14.5]] as [number, number][]) bush(x, z, [0x3a9a48, 0x2f8a40, 0x4aa850][(Math.abs(x + z) | 0) % 3]);

// Trạm nhiệm vụ: cột totem gỗ + tấm đá phát sáng (Mesh `m` giữ API cũ: đổi emissive khi xong) + chùm sáng chỉ đường
const defs: [number, number, TaskType][] = [[-18, -18, "wires"], [18, -18, "code"], [-18, 18, "hold"], [18, 18, "wires"], [0, -18, "code"]];
const ICON: Record<TaskType, number> = { wires: 0xffd24d, code: 0x4dc3ff, hold: 0x6fe08a };
export const stations: Station[] = defs.map(([x, z, type]) => {
  B.box(x, 0.5, z, 1.7, 1, 1, 0x8a5a32); B.box(x - 0.75, 1.5, z, 0.22, 1.9, 0.22, 0x6b4423); B.box(x + 0.75, 1.5, z, 0.22, 1.9, 0.22, 0x6b4423); B.box(x, 2.5, z, 1.9, 0.22, 0.3, 0x4a3018);
  GL.add(x, 2.95, z, 0.3, ICON[type], 2, x, 0.5); B.box(x, 0.06, z, 3.2, 0.12, 3.2, 0xb9a26e, 0.05);
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.14), new THREE.MeshStandardMaterial({ color: 0x1d2a2e, emissive: 0x2a1a00, roughness: 0.4 }));
  m.position.set(x, 1.4, z); m.rotation.x = -0.35; m.castShadow = true; scene.add(m);
  const beam = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cyl.position.y = 3.5; const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffcc55, toneMapped: false }));
  beam.add(cyl, dia); beam.position.set(x, 0, z); beam.visible = false; scene.add(beam); (m as any).userData.beam = { beam, dia };
  col(x, z, 1.7, 1); use(x, z, 3);
  return { x, z, type, m, active: false, done: false };
});
[...stations].sort(() => Math.random() - 0.5).slice(0, 3).forEach((s) => { s.active = true; (s.m.material as THREE.MeshStandardMaterial).emissive.setHex(0xffaa00); });

// Hang bí mật (vent): hố cát có vòng đá, đốm sáng xanh
for (const [x, z] of VENTS) {
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; B.box(x + Math.cos(a) * 1.15, 0.2, z + Math.sin(a) * 1.15, 0.6, 0.4, 0.6, i % 2 ? 0x8d8a84 : 0x77746f); }
  B.box(x, 0.04, z, 2.0, 0.08, 2.0, 0x15120f);
  for (let i = -2; i <= 2; i++) GL.add(x + i * 0.3, 0.14, z + (i % 2) * 0.3, 0.1, 0x3dff7a, 2, i * 0.7, 0.2);
  use(x, z, 2.5);
}

// Đưa vào scene
scene.add(B.build(true, true), GL.build());

/** Hoạt ảnh: lửa, đốm sáng, thuyền nhấp nhô, chùm sáng trạm nhiệm vụ. */
export function updateMap(t: number, dt: number) {
  GL.update(t); for (const f of anim) f(t, dt);
  for (const s of stations) {
    const u = (s.m.userData.beam) as { beam: THREE.Group; dia: THREE.Mesh }, on = s.active && !s.done;
    u.beam.visible = on;
    if (on) { u.dia.position.y = 3 + Math.sin(t * 2.5) * 0.3; u.dia.rotation.y = t * 2; (s.m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + 0.5 * Math.sin(t * 4); }
    else (s.m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
  }
}
void hash; void CEN;
