import * as THREE from "three";
import { scene } from "./scene";
import { VoxelBatch, Glow, voxMat, hash, fbm, smooth } from "./voxel";

/** Cảnh quan ngoài trạm: đồi voxel, hồ nước, cây, tinh thể, mây, chim, đom đóm, tuabin gió… */
const N = 58;            // bán kính địa hình (m)
const LAKE = { x: -40, z: 30, r: 15 }, POND = { x: 38, z: -34, r: 8 };
const WATER_Y = -1.35;

const lakeD = (x: number, z: number) => Math.min(Math.hypot(x - LAKE.x, z - LAKE.z) / LAKE.r, Math.hypot(x - POND.x, z - POND.z) / POND.r);
function height(x: number, z: number) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d <= 24) return 0;                       // sân bê tông quanh trạm, ngang mặt sàn
  const s = smooth(25, 52, d), h = -1 + Math.floor(fbm(x * 0.055 + 9, z * 0.055 + 4) * 11 * s * s + fbm(x * 0.2, z * 0.2) * 1.6 * Math.min(1, s * 3));
  const ld = lakeD(x, z);
  return ld < 1 ? Math.min(h, -3 + Math.floor(ld * 2.2)) : Math.min(h, ld < 1.25 ? -1 : h);   // lòng hồ + bờ thoải
}
const surface = (x: number, z: number, h: number) => {
  if (Math.max(Math.abs(x), Math.abs(z)) <= 24) return 0xa9afc4;
  if (h <= -2) return 0xe2cf93;                              // cát đáy hồ / bờ
  if (h >= 8) return 0xf4f7ff; if (h >= 6) return 0xa6abb8;   // đỉnh tuyết / đá
  if (h >= 3) return hash(x, z) > 0.5 ? 0x62b85a : 0x5aaa52;
  return (Math.floor(x) + Math.floor(z)) & 1 ? 0x6cc760 : 0x62bd58;
};

const T = new VoxelBatch(), D = new VoxelBatch(), EM = new Glow();
const hmap = new Map<string, number>();
for (let x = -N; x < N; x++) for (let z = -N; z < N; z++) hmap.set(x + "," + z, height(x + 0.5, z + 0.5));
const H = (x: number, z: number) => hmap.get(x + "," + z) ?? -1;
export const groundAt = (x: number, z: number) => H(Math.floor(x), Math.floor(z));

for (let x = -N; x < N; x++) for (let z = -N; z < N; z++) {
  const cx = x + 0.5, cz = z + 0.5;
  if (Math.abs(cx) < 21 && Math.abs(cz) < 21) continue;   // phần dưới sàn trạm
  const h = H(x, z), mn = Math.min(H(x - 1, z), H(x + 1, z), H(x, z - 1), H(x, z + 1));
  T.cube(cx, h - 0.5, cz, surface(cx, cz, h), 0.06);
  for (let y = h - 1; y > Math.max(mn, h - 4); y--) T.cube(cx, y - 0.5, cz, h >= 6 ? 0x8d92a3 : 0x8a6a4a, 0.08);   // thành đồi lộ ra
}

/* ── Cây, hoa, đá, tinh thể ── */
const tree = (x: number, z: number, h: number, kind: number) => {
  const y0 = h;
  if (kind === 0) { // thông
    const th = 3 + ((hash(x, z, 2) * 3) | 0); for (let i = 0; i < th; i++) D.cube(x, y0 + i + 0.5, z, 0x7a5232, 0.1);
    for (let t = 0; t < 4; t++) { const rr = [2, 2, 1, 1][t], yy = y0 + th - 1.5 + t * 1.1; for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) if (Math.abs(dx) + Math.abs(dz) <= rr + (rr > 1 ? 1 : 0)) D.cube(x + dx, yy + 0.5, z + dz, 0x2f8f4e, 0.1); }
    D.cube(x, y0 + th + 3.2, z, 0x2f8f4e, 0.1);
  } else { // cây tròn / hoa anh đào / cây tím lạ
    const leaf = [0, 0x58c45f, 0xff9ec4, 0xb58cff][kind], th = 3 + ((hash(x, z, 5) * 2) | 0);
    for (let i = 0; i < th; i++) D.cube(x, y0 + i + 0.5, z, 0x8a5a3a, 0.1);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 3; dy++) {
      if (Math.abs(dx) + Math.abs(dz) + dy * 1.2 > 3.6 || hash(x + dx, z + dz, dy) < 0.12) continue; D.cube(x + dx, y0 + th + dy + 0.5, z + dz, leaf, 0.12);
    }
  }
};
const crystal = (x: number, z: number, h: number, c: number) => {
  for (let i = 0; i < 4; i++) { const hh = 0.8 + hash(x, z, i) * 1.8, dx = (hash(x, z, i + 7) - 0.5) * 1.4, dz = (hash(x, z, i + 9) - 0.5) * 1.4; EM.add(x + dx, h + hh / 2, z + dz, 0.4, c, 1 + hash(x, z, i), i, 0.6); D.box(x + dx, h + hh / 2, z + dz, 0.5, hh, 0.5, c, 0.1); }
};
for (let x = -N + 1; x < N - 1; x++) for (let z = -N + 1; z < N - 1; z++) {
  const cx = x + 0.5, cz = z + 0.5, d = Math.max(Math.abs(cx), Math.abs(cz)); if (d < 27) continue;
  const h = H(x, z), r = hash(x, z, 11), flat = Math.abs(H(x + 1, z) - h) + Math.abs(H(x, z + 1) - h) <= 1;
  if (h < -1 || h > 6 || lakeD(cx, cz) < 1.3 || !flat) continue;
  if (r < 0.028) tree(cx, cz, h, r < 0.011 ? 0 : r < 0.019 ? 1 : r < 0.024 ? 2 : 3);
  else if (r < 0.06) { const c = [0xffffff, 0xffd24d, 0xff7aa8, 0x9fd8ff][(hash(x, z, 4) * 4) | 0]; D.box(cx, h + 0.25, cz, 0.25, 0.5, 0.25, 0x3f9a4a); D.box(cx, h + 0.58, cz, 0.38, 0.22, 0.38, c, 0.05); }
  else if (r < 0.066) { D.box(cx, h + 0.45, cz, 1.2, 0.9, 1.1, 0x9aa0b4, 0.1); D.box(cx + 0.2, h + 1.1, cz, 0.7, 0.5, 0.7, 0x9aa0b4, 0.1); }
  else if (r < 0.0705 && d > 32) crystal(cx, cz, h, [0x4dd8ff, 0xff6af0, 0x8dff6a][(hash(x, z, 6) * 3) | 0]);
  else if (r < 0.1 && lakeD(cx, cz) < 1.6) for (let i = 0; i < 3; i++) D.box(cx + (i - 1) * 0.3, h + 0.7, cz, 0.12, 1.4, 0.12, 0x3f8a3a); // sậy ven hồ
}

/* ── Công trình ngoài trời: tuabin gió, trạm radar, tàu đáp ── */
const turbines: { g: THREE.Group }[] = [];
for (const [x, z] of [[30, 34], [-34, -30], [46, 8]] as [number, number][]) {
  const h = H(Math.floor(x), Math.floor(z));
  for (let i = 0; i < 9; i++) D.box(x, h + i + 0.5, z, 0.5 - i * 0.02, 1, 0.5 - i * 0.02, 0xf3f4fa, 0.03);
  const g = new THREE.Group(), bm = voxMat(0xffffff);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 0.12), bm); b.position.y = 2.1; const p = new THREE.Group(); p.rotation.z = i * 2.094; p.add(b); g.add(p); }
  g.position.set(x, h + 9.2, z + 0.5); g.traverse((o) => { o.castShadow = true; }); scene.add(g); turbines.push({ g });
}
{ // tàu đáp ngoài sân
  const x = -30, z = -38, h = H(-30, -38);
  D.box(x, h + 1.3, z, 5, 1.8, 2.4, 0xf3f4fa); D.box(x + 3, h + 1.3, z, 1.2, 1.2, 1.6, 0xd04a4a); D.box(x - 0.2, h + 2.5, z, 2.4, 0.8, 1.8, 0xe5e8f3); D.box(x - 2.8, h + 1.5, z, 0.6, 2.4, 3.2, 0x3b4268);
  for (let i = 0; i < 4; i++) EM.add(x - 1.5 + i * 1.1, h + 1.8, z + 1.23, 0.45, 0x7fd8ff, 1.2, i, 0.5);
  D.box(x, h + 0.25, z + 1, 4, 0.5, 0.3, 0x3b4268); D.box(x, h + 0.25, z - 1, 4, 0.5, 0.3, 0x3b4268);
}

/* ── Nước (gợn sóng) ── */
const water: { x: number; z: number }[] = [];
for (let x = -N; x < N; x++) for (let z = -N; z < N; z++) if (H(x, z) <= -3 && lakeD(x + 0.5, z + 0.5) < 1.3) water.push({ x: x + 0.5, z: z + 0.5 });
const wMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x3da9ff, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 }), Math.max(1, water.length));
wMesh.receiveShadow = true; wMesh.frustumCulled = false; wMesh.count = water.length;
const WM = new THREE.Matrix4(), WC = new THREE.Color();
water.forEach((w, i) => wMesh.setColorAt(i, WC.setHex(0x3da9ff).offsetHSL(0, 0, (hash(w.x, w.z) - 0.5) * 0.12)));
// Sen nổi
const pads = new VoxelBatch(); for (let i = 0; i < 40; i++) { const w = water[(hash(i, 3) * water.length) | 0]; if (w) pads.box(w.x, WATER_Y + 0.28, w.z, 0.8, 0.06, 0.8, 0x4fc261, 0.1); }

scene.add(T.build(false, true), D.build(true, true), EM.build(), wMesh);
if (water.length) scene.add(pads.build(false, false));

/* ── Mây voxel trôi ── */
const clouds = new THREE.Group(), cv = new VoxelBatch();
for (let i = 0; i < 14; i++) {
  const ox = (hash(i, 1) - 0.5) * 300, oz = (hash(i, 2) - 0.5) * 300, oy = 38 + hash(i, 3) * 22, cw = 5 + ((hash(i, 4) * 6) | 0);
  for (let a = 0; a < cw; a++) for (let b = 0; b < 3 + ((hash(i, a) * 3) | 0); b++) cv.box(ox + a * 3, oy + (a % 2 ? 1.5 : 0), oz + b * 3, 3.2, 2.6, 3.2, 0xffffff, 0.03);
}
const cMesh = cv.build(false, false, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false })); clouds.add(cMesh); scene.add(clouds);

/* ── Chim bay lượn (voxel, vỗ cánh) ── */
const birds: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; sp: number; ph: number; h: number }[] = [];
for (let i = 0; i < 7; i++) {
  const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: [0xff7a59, 0xffd24d, 0x6fa8ff, 0xffffff][i % 4] });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.7), body), wl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.4), body), wr = wl.clone();
  wl.position.x = -0.6; wr.position.x = 0.6; g.add(b, wl, wr); scene.add(g); birds.push({ g, wl, wr, r: 30 + hash(i, 1) * 28, sp: 0.18 + hash(i, 2) * 0.15, ph: hash(i, 3) * 6.28, h: 12 + hash(i, 4) * 10 });
}
/* ── Slime nhảy nhót ở bìa rừng ── */
const slimes: { m: THREE.Mesh; x: number; z: number; tx: number; tz: number; t: number; c: number }[] = [];
for (let i = 0; i < 6; i++) {
  const a = hash(i, 8) * 6.28, d = 30 + hash(i, 9) * 14, x = Math.cos(a) * d, z = Math.sin(a) * d;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: [0x7ee86a, 0xff9ec4, 0x7fd8ff][i % 3], transparent: true, opacity: 0.88 }));
  m.castShadow = true; scene.add(m); slimes.push({ m, x, z, tx: x, tz: z, t: hash(i, 4) * 3, c: i });
}
/* ── Đom đóm / phấn hoa ── */
const FN = 160, fp = new Float32Array(FN * 3), fg = new THREE.BufferGeometry();
for (let i = 0; i < FN; i++) { fp[i * 3] = (hash(i, 1) - 0.5) * 110; fp[i * 3 + 1] = 0.5 + hash(i, 2) * 9; fp[i * 3 + 2] = (hash(i, 3) - 0.5) * 110; }
fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xfff3a0, size: 0.28, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
flies.frustumCulled = false; scene.add(flies);

export function updateTerrain(t: number, dt: number) {
  water.forEach((w, i) => { WM.makeTranslation(w.x, WATER_Y + Math.sin(t * 1.4 + w.x * 0.7 + w.z * 0.5) * 0.06, w.z); wMesh.setMatrixAt(i, WM); });
  wMesh.instanceMatrix.needsUpdate = true;
  EM.update(t);
  clouds.position.x = (t * 1.4) % 300 - 0; if (clouds.position.x > 150) clouds.position.x -= 300;
  turbines.forEach((w, i) => { w.g.rotation.z = t * (0.7 + i * 0.15); });
  for (const b of birds) {
    const a = t * b.sp + b.ph, x = Math.cos(a) * b.r, z = Math.sin(a) * b.r;
    b.g.position.set(x, b.h + Math.sin(t * 0.7 + b.ph) * 1.5, z); b.g.rotation.y = -a;
    const f = Math.sin(t * 9 + b.ph) * 0.7; b.wl.rotation.z = f; b.wr.rotation.z = -f;
  }
  for (const s of slimes) {
    s.t -= dt;
    if (s.t <= 0) { s.t = 1.2 + hash(s.c, Math.floor(t)) * 2; const a = hash(s.c, Math.floor(t * 3)) * 6.28; s.tx = s.x + Math.cos(a) * 3; s.tz = s.z + Math.sin(a) * 3; if (Math.max(Math.abs(s.tx), Math.abs(s.tz)) < 26 || lakeD(s.tx, s.tz) < 1.3) { s.tx = s.x; s.tz = s.z; } }
    s.x += (s.tx - s.x) * Math.min(1, dt * 1.5); s.z += (s.tz - s.z) * Math.min(1, dt * 1.5);
    const hop = Math.abs(Math.sin(t * 3 + s.c)), gh = H(Math.floor(s.x), Math.floor(s.z));
    s.m.position.set(s.x, gh + 0.35 + hop * 0.6, s.z); s.m.scale.set(1 + (1 - hop) * 0.15, 0.85 + hop * 0.3, 1 + (1 - hop) * 0.15);
  }
  const p = fg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < FN; i++) { p.setY(i, 0.8 + (fp[i * 3 + 1] + Math.sin(t * 0.6 + i) * 0.8) % 9); p.setX(i, fp[i * 3] + Math.sin(t * 0.3 + i * 1.7) * 1.2); }
  p.needsUpdate = true;
}
