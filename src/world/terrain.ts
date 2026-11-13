import * as THREE from "three";
import { scene } from "./scene";
import { VoxelBatch, Glow, hash, fbm, smooth } from "./voxel";
import { H, WATER_Y, PADS, PONDS, limit, dist6, slopeAt, isPond, groundAt, walkable, NG } from "./island";
import { WALLS } from "./map";

/**
 * Đảo hoang dạng Minecraft (v27): cao nguyên cỏ lượn sóng, vách đá dựng đứng ra biển, rừng thông trên sườn núi, đỉnh núi phủ tuyết, vịnh cát + cầu tàu phía Nam.
 * Mọi thứ là khối voxel gom vào InstancedMesh. Độ cao lấy từ island.ts (H). Cột đất cao = 1 khối cỏ/đá trên cùng + 3 khối đất + các khối đá xếp chồng tới mặt nước.
 */
const N = 88;                 // bán kính vùng voxel (m)
const tint = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
const snowLine = (x: number, z: number) => 25 + (fbm(x * 0.1 + 5, z * 0.1 + 2) - 0.5) * 6;
const GRASS = [[0x6bb04a, 0x62a544], [0x7cc656, 0x72b94f], [0x55963f, 0x4d8b3a]];   // đồng cỏ · đồi sáng · rừng tối
const STONE = [0x8a8a8a, 0x7d7d7d, 0x969696, 0x858585];

type Kind = "sea" | "bed" | "sand" | "grass" | "stone" | "snow" | "gravel";
export function kindAt(ix: number, iz: number): Kind {
  const h = H(ix, iz), x = ix + 0.5, z = iz + 0.5;
  if (h < 0) return "sea";
  if (isPond(x, z)) return "bed";
  const s = slopeAt(ix, iz);
  if (h > snowLine(x, z)) return s >= 3 && hash(ix, iz, 4) < 0.28 ? "stone" : "snow";
  if (h <= 1) return "sand";
  if (h <= 2 && limit(x, z) - dist6(x, z) < 9) return "sand";
  if (s >= 3 || (h > 20 && s >= 2) || (h > 23 && hash(ix, iz, 5) < 0.3)) return "stone";
  if (s <= 1 && hash(ix, iz, 6) < 0.012) return "gravel";
  return "grass";
}
const forestK = (x: number, z: number) => fbm(x * 0.055 + 40, z * 0.055 + 8);
function topColor(ix: number, iz: number, h: number, k: Kind) {
  const x = ix + 0.5, z = iz + 0.5, chk = (ix + iz) & 1, L = limit(x, z), d = dist6(x, z);
  switch (k) {
    case "sea": return h === -1 ? 0xe3d29a : h === -2 ? 0xcdbf8c : tint(0xc2b583, 0x0b3560, smooth(L + 5, L + 17, d));
    case "bed": return 0x9a8f78;
    case "sand": return chk ? 0xf1e0ab : 0xe9d79e;
    case "snow": return hash(ix, iz, 7) < 0.08 ? 0xd7e6f7 : chk ? 0xfafcff : 0xf1f6fc;
    case "gravel": return 0x8f8a85;
    case "stone": return STONE[(hash(ix, iz, 8) * 4) | 0];
    default: { const f = forestK(x, z), g = GRASS[f > 0.56 ? 2 : (fbm(x * 0.04 + 9, z * 0.04 + 2) > 0.58 ? 1 : 0)]; return g[chk]; }
  }
}

const T = new VoxelBatch(), D = new VoxelBatch(), EM = new Glow(), FOAM = new VoxelBatch(), WB = new VoxelBatch();

/* ── Cột địa hình ── */
for (let ix = -N; ix < N; ix++) for (let iz = -N; iz < N; iz++) {
  const h = H(ix, iz), cx = ix + 0.5, cz = iz + 0.5, k = kindAt(ix, iz);
  if (k === "sea" && dist6(cx, cz) > limit(cx, cz) + 18) continue;                    // xa bờ: để mặt phẳng đáy biển lo
  T.cube(cx, h - 0.5, cz, topColor(ix, iz, h, k), 0.05);
  const mn = Math.min(H(ix - 1, iz), H(ix + 1, iz), H(ix, iz - 1), H(ix, iz + 1)), depth = h - 1 - mn;
  if (depth <= 0 || h < 0) continue;
  const dirt = k === "grass" || k === "gravel" ? 0x8b6a45 : k === "sand" ? 0xdccb8a : k === "bed" ? 0x8a7f69 : k === "snow" ? 0xeef3fa : 0x888888;
  for (let j = 1; j <= Math.min(3, depth); j++) T.cube(cx, h - j - 0.5, cz, k === "stone" ? STONE[(hash(ix, iz, j) * 4) | 0] : dirt, 0.06);
  let top = h - 4;                                                                         // phần còn lại: đá, xếp từng đoạn ≤ 3 khối (đỡ kéo dãn hoạ tiết)
  for (let seg = 0; top > mn; seg++) {
    const len = Math.min(3, top - mn), cy = top - len / 2;
    T.box(cx, cy, cz, 1, len, 1, STONE[(hash(ix + seg, iz, 11) * 4) | 0], 0.05);
    top -= len;
  }
}
/* bọt sóng ven bờ */
for (let ix = -N + 1; ix < N - 1; ix++) for (let iz = -N + 1; iz < N - 1; iz++) {
  if (H(ix, iz) >= 0 || H(ix, iz) < -2) continue;
  if ((H(ix - 1, iz) >= 0 || H(ix + 1, iz) >= 0 || H(ix, iz - 1) >= 0 || H(ix, iz + 1) >= 0) && hash(ix, iz, 21) < 0.6) FOAM.box(ix + 0.5, WATER_Y + 0.05, iz + 0.5, 1, 0.05, 1, 0xffffff, 0);
}
/* ao nước trên cao nguyên */
for (const o of PONDS) for (let ix = Math.floor(o.x - o.r - 3); ix <= Math.ceil(o.x + o.r + 3); ix++) for (let iz = Math.floor(o.z - o.r - 3); iz <= Math.ceil(o.z + o.r + 3); iz++) {
  if (!isPond(ix + 0.5, iz + 0.5)) continue;
  const bed = H(ix, iz), hh = o.y - bed; WB.box(ix + 0.5, bed + hh / 2, iz + 0.5, 1, hh, 1, 0x2f86d6, 0);
}

/* ── Cây ── */
const padFree = (x: number, z: number, pad = 0) => !PADS.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + pad);
function spruce(x: number, z: number, h: number, big: boolean) {   // thông
  const th = (big ? 6 : 4) + ((hash(x, z, 2) * 3) | 0), top = h + th;
  D.box(x, h + th / 2 - 0.3, z, 0.6, th + 0.6, 0.6, 0x5b4128, 0.05);
  const leaf = [0x2d6a3a, 0x347a41, 0x285f34][((hash(x, z, 6) * 3) | 0)];
  const lay = big ? [[5, 2.2], [5, 3.2], [3, 4.2], [3, 5.2], [1, 6.2], [1, 7.0]] : [[3, 2.4], [3, 3.4], [1, 4.4], [1, 5.0]];
  for (const [w, o] of lay) { const y = h + o + (big ? 0 : -0.5) + (th - (big ? 6 : 4)) * 0.8; D.box(x, y, z, w, 1, w, leaf, 0.08); }
  if (h > 24) D.box(x, top + (big ? 1.4 : 0.9), z, 1.1, 0.35, 1.1, 0xf4f8ff, 0.02);
  WALLS.push([x, z, 0.8, 0.8]);
}
function oak(x: number, z: number, h: number, birch: boolean) {   // sồi / bạch dương
  const th = 3 + ((hash(x, z, 2) * 2) | 0), leaf = birch ? 0x7cb248 : [0x4d9a3a, 0x5aa843, 0x428c33][((hash(x, z, 6) * 3) | 0)];
  D.box(x, h + th / 2 - 0.3, z, 0.6, th + 0.6, 0.6, birch ? 0xe6e2d8 : 0x6b4a2a, 0.05);
  D.box(x, h + th + 0.3, z, 4, 1, 4, leaf, 0.08); D.box(x, h + th + 1.3, z, 3, 1, 3, leaf, 0.08); D.box(x, h + th + 2.3, z, 1.6, 1, 1.6, leaf, 0.08);
  D.box(x + 1.4, h + th + 0.3, z - 1.0, 1.4, 1, 1.4, leaf, 0.08);
  WALLS.push([x, z, 0.8, 0.8]);
}
function palm(x: number, z: number, h: number) {   // dừa trên bãi cát
  const th = 5 + ((hash(x, z, 2) * 3) | 0), lx = (hash(x, z, 3) - 0.5) * 0.36, lz = (hash(x, z, 4) - 0.5) * 0.36;
  let px = x, pz = z;
  for (let i = 0; i < th; i++) { px = x + lx * i; pz = z + lz * i; D.box(px, h + i + 0.5, pz, 0.55 - i * 0.02, 1, 0.55 - i * 0.02, i % 2 ? 0x93693a : 0x84592f, 0.05); }
  const ty = h + th + 0.2, leaf = [0x2f9e4f, 0x3fb85a, 0x2a8f45][(hash(x, z, 6) * 3) | 0];
  D.cube(px, ty + 0.3, pz, leaf, 0.1);
  for (let a = 0; a < 8; a++) {
    const dx = Math.round(Math.cos((a * Math.PI) / 4)), dz = Math.round(Math.sin((a * Math.PI) / 4));
    for (let s = 1; s <= 3; s++) D.box(px + dx * s * 0.85, ty + 0.5 - s * s * 0.12, pz + dz * s * 0.85, dx ? 1 : 0.55, 0.16, dz ? 1 : 0.55, leaf, 0.1);
  }
  WALLS.push([x, z, 0.8, 0.8]);
}
let trees = 0;
for (let ix = -NG + 2; ix < NG - 2; ix++) for (let iz = -NG + 2; iz < NG - 2; iz++) {
  const h = H(ix, iz); if (h < 0) continue;
  const cx = ix + 0.5, cz = iz + 0.5, k = kindAt(ix, iz), s = slopeAt(ix, iz), q = hash(ix, iz, 13), r = hash(ix, iz, 11);
  if (s > 1 || !padFree(cx, cz, 1.8)) continue;
  const f = forestK(cx, cz);
  if (k === "sand") { if (h <= 2 && r < 0.012 && limit(cx, cz) - dist6(cx, cz) > 3 && walkable(cx, cz)) { palm(cx, cz, h); trees++; } continue; }
  if (k !== "grass") continue;
  if ((ix & 1) === 0 && (iz & 1) === 0) {                                        // tối đa 1 cây / ô 2×2 → cách nhau ≥ 2m
    const dens = h > 27 ? 0 : h > 17 ? (f > 0.5 ? 0.5 : 0.2) : f > 0.56 ? 0.42 : f > 0.5 ? 0.12 : 0.012;
    if (r < dens && !WALLS.some(([wx, wz, w, d]) => Math.abs(cx - wx) < w / 2 + 1.2 && Math.abs(cz - wz) < d / 2 + 1.2)) { if (h > 16 || (f > 0.56 && q < 0.7)) spruce(cx, cz, h, f > 0.5 && q < 0.65); else oak(cx, cz, h, q > 0.7); trees++; continue; }
  }
  if (s > 0) continue;
  // tầng thấp: cỏ cao, hoa, dương xỉ, đá lẻ
  const e = hash(ix, iz, 17);
  if (e < 0.06) for (let i = 0; i < 3; i++) D.box(cx + (i - 1) * 0.25, h + 0.22, cz + (hash(ix, iz, i) - 0.5) * 0.4, 0.14, 0.45, 0.14, [0x3f9a4a, 0x4fb35a, 0x2f8a40][i], 0.1);
  else if (e < 0.085 && f < 0.56) { const c = [0xffffff, 0xffd24d, 0xff7aa8, 0x9fd8ff][(hash(ix, iz, 4) * 4) | 0]; D.box(cx, h + 0.25, cz, 0.12, 0.5, 0.12, 0x3f9a4a); D.box(cx, h + 0.58, cz, 0.38, 0.22, 0.38, c, 0.05); }
  else if (e < 0.1 && f >= 0.5) for (let i = 0; i < 5; i++) { const a = i * 1.26; D.box(cx + Math.cos(a) * 0.45, h + 0.4 - (i % 2) * 0.1, cz + Math.sin(a) * 0.45, 0.9, 0.1, 0.35, 0x2f9e4f, 0.1); }
  else if (e < 0.108) { D.box(cx, h + 0.3, cz, 0.9, 0.6, 0.8, 0x8f8f8f, 0.1); D.box(cx + 0.2, h + 0.75, cz, 0.5, 0.4, 0.5, 0x9a9a9a, 0.1); }
}
void trees;

/* ── Đảo nhỏ & cột đá ngoài khơi ── */
function islet(cx: number, cz: number, r: number, palms = true) {
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const dd = Math.hypot(dx, dz); if (dd > r) continue;
    const top = Math.round(1.6 - (dd / r) * 4.6 + (hash(cx + dx, cz + dz) - 0.5) * 1.2); if (top < -2) continue;
    for (let y = top; y > Math.max(-3, top - 4); y--) D.cube(cx + dx, y - 0.5, cz + dz, y > 0 ? (top >= 1 && y === top ? 0x5fbf58 : 0xe9d79e) : y > -1 ? 0xe3d29a : 0xc9bb88, 0.06);
    if (palms && r >= 4 && top >= 1 && hash(cx + dx, cz + dz, 9) < 0.13) palm2(cx + dx, cz + dz, top);
  }
}
function palm2(x: number, z: number, h: number) { // dừa không va chạm (trên đảo xa)
  const th = 4 + ((hash(x, z, 2) * 2) | 0);
  for (let i = 0; i < th; i++) D.box(x, h + i + 0.5, z, 0.5, 1, 0.5, 0x8a5e32, 0.05);
  for (let a = 0; a < 8; a++) { const dx = Math.round(Math.cos((a * Math.PI) / 4)), dz = Math.round(Math.sin((a * Math.PI) / 4)); for (let s = 1; s <= 2; s++) D.box(x + dx * s * 0.9, h + th + 0.4 - s * s * 0.15, z + dz * s * 0.9, dx ? 1 : 0.55, 0.16, dz ? 1 : 0.55, 0x34a850, 0.1); }
}
for (const [x, z, r] of [[-104, -78, 6], [86, -102, 5], [112, 26, 7], [-112, 44, 4], [38, 108, 6], [-60, 104, 4], [126, -34, 3], [-8, -126, 5], [-122, -14, 5], [80, 92, 4]] as [number, number, number][]) islet(x, z, r);
for (const [x, z] of [[104, -50], [-98, 52], [74, 74], [-90, -58]] as [number, number][]) for (let i = 0; i < 7; i++) {   // cột đá giữa biển
  const w = 3 - i * 0.3; D.box(x + (i % 2) * 0.2, -3 + i + 0.5, z, w, 1, w * 0.85, i % 2 ? 0x8f8c87 : 0x7e7b76, 0.08);
}

/* ── Biển: mặt nước gợn sóng, sắc khác nhau 4 hướng (B xanh ngọc · Đ xanh dương · N lục bảo · T chàm) ── */
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2aa6c8, transparent: true, opacity: 0.8, roughness: 0.22, metalness: 0.05, depthWrite: false });
const wu = { uT: { value: 0 } };
waterMat.onBeforeCompile = (s) => {
  s.uniforms.uT = wu.uT;
  s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nuniform float uT;\nvarying vec3 vW;")
    .replace("#include <begin_vertex>", `vec3 transformed = position;
      vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
      transformed.z += sin(wp.x * .35 + uT * 1.3) * .07 + sin(wp.z * .5 + uT * 1.7) * .06 + sin((wp.x + wp.z) * .2 + uT * .8) * .09;
      vW = wp;`);
  s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uT;\nvarying vec3 vW;")
    .replace("#include <color_fragment>", `#include <color_fragment>
      vec2 q = vW.xz; float ax = abs(q.x), az = abs(q.y);
      vec3 cN = vec3(.08,.62,.66), cE = vec3(.07,.30,.80), cS = vec3(.10,.56,.42), cW = vec3(.20,.24,.66);
      vec3 cx = q.x > 0. ? cE : cW; vec3 cz = q.y < 0. ? cN : cS;
      vec3 c = mix(cz, cx, smoothstep(-24., 24., ax - az));
      float dd = pow(pow(ax, 6.) + pow(az, 6.), 1. / 6.);
      c = mix(vec3(.25,.78,.72), c, smoothstep(70., 118., dd));
      c += step(.987, sin(vW.x * 2.9 + uT * 1.8) * sin(vW.z * 3.3 - uT * 1.4)) * .3;
      diffuseColor.rgb = c;`);
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(760, 760, 380, 380), waterMat);
water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.frustumCulled = false; water.renderOrder = 1; scene.add(water);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x0b3560 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -3.02; scene.add(floor);
const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
const pondMat = new THREE.MeshStandardMaterial({ color: 0x2f86d6, transparent: true, opacity: 0.78, roughness: 0.2, depthWrite: false });

scene.add(T.build(false, true), D.build(true, true), EM.build(), FOAM.build(false, false, foamMat), WB.build(false, false, pondMat));

/* ── Mây (cao hơn đỉnh núi) ── */
const clouds = new THREE.Group(), cv = new VoxelBatch();
for (let i = 0; i < 26; i++) {
  const ox = (hash(i, 1) - 0.5) * 520, oz = (hash(i, 2) - 0.5) * 520, oy = 78 + hash(i, 3) * 26, cw = 5 + ((hash(i, 4) * 6) | 0);
  for (let a = 0; a < cw; a++) for (let b = 0; b < 3 + ((hash(i, a) * 3) | 0); b++) cv.box(ox + a * 3, oy + (a % 2 ? 1.5 : 0), oz + b * 3, 3.2, 2.6, 3.2, 0xffffff, 0.03);
}
clouds.add(cv.build(false, false, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false }))); scene.add(clouds);

/* ── Hải âu: bay vòng quanh cả đảo, cao hơn đỉnh núi ── */
const birds: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; sp: number; ph: number; h: number }[] = [];
for (let i = 0; i < 12; i++) {
  const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: i % 3 ? 0xffffff : 0xdfe6ee });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.7), body), wl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.4), body), wr = wl.clone();
  wl.position.x = -0.6; wr.position.x = 0.6; g.add(b, wl, wr); scene.add(g);
  birds.push({ g, wl, wr, r: 40 + hash(i, 1) * 90, sp: 0.1 + hash(i, 2) * 0.1, ph: hash(i, 3) * 6.28, h: 30 + hash(i, 4) * 26 });
}
/* ── Cua đỏ bò ngang trên bãi cát phía Nam ── */
const crabs: { g: THREE.Group; x: number; z: number; tx: number; tz: number; t: number; c: number }[] = [];
const beachOK = (x: number, z: number) => walkable(x, z) && groundAt(x, z) <= 2 && groundAt(x, z) >= 0;
for (let i = 0, made = 0; i < 80 && made < 9; i++) {
  const a = Math.PI / 2 + (hash(i, 8) - 0.5) * 1.1, ux = Math.cos(a), uz = Math.sin(a);
  let x = 0, z = 0, ok = false;
  for (let r = 90; r > 20; r -= 0.5) { x = ux * r; z = uz * r; if (H(Math.floor(x), Math.floor(z)) >= 0) { x = ux * (r - 2.5); z = uz * (r - 2.5); ok = beachOK(x, z); break; } }
  if (!ok) continue; made++;
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: i % 3 ? 0xe2452f : 0xff7a3d, roughness: 0.7 });
  const add = (w: number, h: number, d: number, px: number, py: number, pz: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); };
  add(0.7, 0.28, 0.5, 0, 0.2, 0); add(0.22, 0.2, 0.22, -0.5, 0.32, 0.3); add(0.22, 0.2, 0.22, 0.5, 0.32, 0.3); add(0.08, 0.14, 0.08, -0.15, 0.42, 0.2); add(0.08, 0.14, 0.08, 0.15, 0.42, 0.2);
  scene.add(g); crabs.push({ g, x, z, tx: x, tz: z, t: hash(i, 4) * 3, c: i });
}
/* ── Phấn hoa / bụi nắng bay lơ lửng trên mặt đất cả đảo ── */
const FN = 260, fp = new Float32Array(FN * 3), fg = new THREE.BufferGeometry(), fy = new Float32Array(FN);
for (let i = 0; i < FN; i++) { fp[i * 3] = (hash(i, 1) - 0.5) * 130; fp[i * 3 + 2] = (hash(i, 3) - 0.5) * 130; fy[i] = Math.max(0, groundAt(fp[i * 3], fp[i * 3 + 2])); fp[i * 3 + 1] = 0.5 + hash(i, 2) * 8; }
fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FN * 3), 3));
const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xfff3a0, size: 0.26, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
flies.frustumCulled = false; scene.add(flies);

export function updateTerrain(t: number, dt: number) {
  wu.uT.value = t; foamMat.opacity = 0.45 + 0.2 * Math.sin(t * 1.5);
  EM.update(t);
  clouds.position.x = (t * 1.4) % 520; if (clouds.position.x > 260) clouds.position.x -= 520;
  for (const b of birds) {
    const a = t * b.sp + b.ph, x = Math.cos(a) * b.r, z = Math.sin(a) * b.r;
    b.g.position.set(x, b.h + Math.sin(t * 0.7 + b.ph) * 1.5, z); b.g.rotation.y = -a;
    const f = Math.sin(t * 9 + b.ph) * 0.7; b.wl.rotation.z = f; b.wr.rotation.z = -f;
  }
  for (const s of crabs) {
    s.t -= dt;
    if (s.t <= 0) { s.t = 1 + hash(s.c, Math.floor(t)) * 2.5; const a = hash(s.c, Math.floor(t * 3)) * 6.28; s.tx = s.x + Math.cos(a) * 2.5; s.tz = s.z + Math.sin(a) * 2.5; if (!beachOK(s.tx, s.tz)) { s.tx = s.x; s.tz = s.z; } }
    const dx = s.tx - s.x, dz = s.tz - s.z; s.x += dx * Math.min(1, dt * 1.6); s.z += dz * Math.min(1, dt * 1.6);
    s.g.position.set(s.x, groundAt(s.x, s.z) + Math.abs(Math.sin(t * 10 + s.c)) * 0.04, s.z); if (Math.hypot(dx, dz) > 0.05) s.g.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
  }
  const p = fg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < FN; i++) { p.setXYZ(i, fp[i * 3] + Math.sin(t * 0.3 + i * 1.7) * 1.2, fy[i] + 0.8 + (fp[i * 3 + 1] + Math.sin(t * 0.6 + i) * 0.8) % 9, fp[i * 3 + 2]); }
  p.needsUpdate = true;
}
