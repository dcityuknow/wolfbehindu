import * as THREE from "three";
import { scene } from "./scene";
import { VoxelBatch, Glow, hash, fbm, smooth } from "./voxel";
import { CEN } from "../config";
import { dist6, limit, cellOf } from "./island";
import { WALLS, reserved } from "./map";

/** Đảo hoang: nền cát/cỏ phẳng ở giữa (đi được), bãi biển thoải xuống, bốn phía là biển (Bắc/Đông/Nam/Tây hơi khác sắc). */
const N = 58;                 // bán kính vùng voxel (m)
const WATER_Y = -0.75;
const lane = (v: number) => Math.min(Math.abs(v - CEN[0]), Math.abs(v - CEN[1]), Math.abs(v - CEN[2]));
const tOf = (x: number, z: number) => dist6(x, z) - limit(x, z) + (fbm(x * 0.12 + 3, z * 0.12 + 7) - 0.5) * 2.4;
const height = (x: number, z: number) => { const t = tOf(x, z); return t <= 1.4 ? 0 : t < 4 ? -1 : t < 7.5 ? -2 : -3; };
const tint = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

const ZONE: Record<string, [number, number]> = {
  "0,0": [0x3f9a45, 0x37893d], "1,0": [0x7ccb5a, 0x6fbd50], "2,0": [0x98a684, 0x8a9877],
  "0,1": [0x8fc15a, 0x83b350], "1,1": [0x7ccb5a, 0x6fbd50], "2,1": [0xa49c88, 0x978f7b],
  "0,2": [0x4fb34c, 0x45a443], "1,2": [0x8fd05c, 0x82c354], "2,2": [0x7b7368, 0x6e675c],
};
function surface(x: number, z: number, h: number) {
  const d = dist6(x, z), L = limit(x, z), t = d - L, r = Math.hypot(x, z), chk = (Math.floor(x / 2) + Math.floor(z / 2)) & 1;
  if (h === -1) return 0xe3d29a; if (h === -2) return 0xcdbf8c;
  if (h <= -3) return tint(0xc2b583, 0x0b3560, smooth(L + 5, L + 17, d));      // đáy biển sẫm dần ra khơi
  if (r < 1.9) return 0x3b3330; if (r < 5.4) return chk ? 0xe8d69c : 0xdfcc90; if (r < 6.1) return 0xb4ae9f;   // nền đống lửa
  if (t > -4.5 + (hash(x, z, 5) - 0.5) * 2.6) return chk ? 0xf1e0ab : 0xe9d79e;   // bãi cát
  if (lane(x) < 1.3 || lane(z) < 1.3) return chk ? 0xd9c58c : 0xcfba80;           // đường mòn
  return ZONE[`${cellOf(x)},${cellOf(z)}`][chk];
}

const T = new VoxelBatch(), D = new VoxelBatch(), EM = new Glow(), FOAM = new VoxelBatch();
const hmap = new Map<string, number>();
for (let x = -N; x < N; x++) for (let z = -N; z < N; z++) hmap.set(x + "," + z, height(x + 0.5, z + 0.5));
const H = (x: number, z: number) => hmap.get(x + "," + z) ?? -3;
export const groundAt = (x: number, z: number) => H(Math.floor(x), Math.floor(z));

for (let x = -N; x < N; x++) for (let z = -N; z < N; z++) {
  const cx = x + 0.5, cz = z + 0.5, h = H(x, z), mn = Math.min(H(x - 1, z), H(x + 1, z), H(x, z - 1), H(x, z + 1));
  T.cube(cx, h - 0.5, cz, surface(cx, cz, h), 0.05);
  for (let y = h - 1; y > Math.max(mn, h - 4); y--) T.cube(cx, y - 0.5, cz, h >= -1 ? 0xc8b27a : 0xb9a771, 0.06);
  if (h === -1 && (H(x - 1, z) === 0 || H(x + 1, z) === 0 || H(x, z - 1) === 0 || H(x, z + 1) === 0) && hash(x, z, 21) < 0.55) FOAM.box(cx, WATER_Y + 0.05, cz, 1, 0.05, 1, 0xffffff, 0);
}

/* ── Cây dừa, cỏ, hoa, vỏ sò, đá ── */
const free = (x: number, z: number, pad = 0) => !reserved.some(([rx, rz, rr]) => Math.hypot(rx - x, rz - z) < rr + pad);
function palm(x: number, z: number, h: number, k: number) {
  const th = 5 + ((hash(x, z, 2) * 3) | 0), lx = (hash(x, z, 3) - 0.5) * 0.36, lz = (hash(x, z, 4) - 0.5) * 0.36;
  let px = x, pz = z;
  for (let i = 0; i < th; i++) { px = x + lx * i; pz = z + lz * i; D.box(px, h + i + 0.5, pz, 0.55 - i * 0.02, 1, 0.55 - i * 0.02, i % 2 ? 0x93693a : 0x84592f, 0.05); }
  const ty = h + th + 0.2, leaf = [0x2f9e4f, 0x3fb85a, 0x2a8f45][k % 3];
  D.cube(px, ty + 0.3, pz, leaf, 0.1);
  for (let a = 0; a < 8; a++) {
    const dx = Math.round(Math.cos((a * Math.PI) / 4)), dz = Math.round(Math.sin((a * Math.PI) / 4));
    for (let s = 1; s <= 3; s++) D.box(px + dx * s * 0.85, ty + 0.5 - s * s * 0.12, pz + dz * s * 0.85, dx ? 1 : 0.55, 0.16, dz ? 1 : 0.55, leaf, 0.1);
  }
  D.cube(px + 0.3, ty - 0.1, pz + 0.2, 0x6b4a2a, 0.05); D.cube(px - 0.3, ty - 0.1, pz - 0.1, 0x6b4a2a, 0.05);
  WALLS.push([x, z, 0.8, 0.8]);
}
for (let x = -N + 1; x < N - 1; x++) for (let z = -N + 1; z < N - 1; z++) {
  const cx = x + 0.5, cz = z + 0.5;
  if (H(x, z) !== 0) continue;
  const t = dist6(cx, cz) - limit(cx, cz); if (t > -0.8) continue;
  const rr = Math.hypot(cx, cz), r = hash(x, z, 11), q = hash(x, z, 13), onLane = lane(cx) < 2.4 || lane(cz) < 2.4, zone = `${cellOf(cx)},${cellOf(cz)}`;
  const jungle = zone === "0,0" || zone === "0,2", barren = zone === "2,0" || zone === "2,1" || zone === "2,2", beach = t > -6;
  if (!onLane && rr > 7.5 && free(cx, cz, 1.8) && r < (jungle ? 0.034 : beach ? 0.03 : barren ? 0.004 : 0.012)) { palm(cx, cz, 0, (hash(x, z, 6) * 3) | 0); continue; }
  if (rr < 6.5 || !free(cx, cz, 0.5)) continue;
  if (t > -3.4) {                                                           // đồ vật trên bãi cát
    if (q < 0.03) D.box(cx, 0.08, cz, 0.3, 0.16, 0.22, 0xffe9ee, 0.04);
    else if (q < 0.04) D.box(cx, 0.06, cz, 0.4, 0.1, 0.4, hash(x, z, 8) > 0.5 ? 0xff6a4d : 0xffa24d, 0.05);
    else if (q < 0.045 && !onLane) D.box(cx, 0.1, cz, 1.6, 0.2, 0.3, 0x9b7b55, 0.06);
  } else if (t < -4.5) {
    if (!barren && q < 0.09) for (let i = 0; i < 3; i++) D.box(cx + (i - 1) * 0.25, 0.22, cz + (hash(x, z, i) - 0.5) * 0.4, 0.14, 0.45, 0.14, [0x3f9a4a, 0x4fb35a, 0x2f8a40][i], 0.1);
    else if (!barren && q < 0.115) { const c = [0xffffff, 0xffd24d, 0xff7aa8, 0x9fd8ff][(hash(x, z, 4) * 4) | 0]; D.box(cx, 0.25, cz, 0.12, 0.5, 0.12, 0x3f9a4a); D.box(cx, 0.58, cz, 0.38, 0.22, 0.38, c, 0.05); }
    else if (jungle && q < 0.15) for (let i = 0; i < 5; i++) { const a = i * 1.26; D.box(cx + Math.cos(a) * 0.45, 0.4 - (i % 2) * 0.1, cz + Math.sin(a) * 0.45, 0.9, 0.1, 0.35, 0x2f9e4f, 0.1); }
    else if (barren && q < 0.03) { D.box(cx, 0.35, cz, 0.9, 0.7, 0.8, 0x9aa0a4, 0.1); D.box(cx + 0.2, 0.85, cz, 0.5, 0.4, 0.5, 0xa8aeb2, 0.1); }
  }
}

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
for (const [x, z, r] of [[-78, -62, 6], [70, -84, 5], [96, 22, 7], [-92, 40, 4], [30, 96, 6], [-48, 88, 4], [112, -30, 3], [-6, -110, 5], [-100, -10, 5], [64, 70, 4]] as [number, number, number][]) islet(x, z, r);
for (const [x, z] of [[46, -40], [-52, 30], [40, 52], [-44, -50]] as [number, number][]) for (let i = 0; i < 7; i++) {   // cột đá giữa biển
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
      vec3 c = mix(cz, cx, smoothstep(-12., 12., ax - az));
      float dd = pow(pow(ax, 6.) + pow(az, 6.), 1. / 6.);
      c = mix(vec3(.25,.78,.72), c, smoothstep(34., 58., dd));
      c += step(.987, sin(vW.x * 2.9 + uT * 1.8) * sin(vW.z * 3.3 - uT * 1.4)) * .3;
      diffuseColor.rgb = c;`);
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 210, 210), waterMat);
water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.frustumCulled = false; water.renderOrder = 1; scene.add(water);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x0b3560 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -3.1; scene.add(floor);
const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });

scene.add(T.build(false, true), D.build(true, true), EM.build(), FOAM.build(false, false, foamMat));

/* ── Mây ── */
const clouds = new THREE.Group(), cv = new VoxelBatch();
for (let i = 0; i < 14; i++) {
  const ox = (hash(i, 1) - 0.5) * 300, oz = (hash(i, 2) - 0.5) * 300, oy = 38 + hash(i, 3) * 22, cw = 5 + ((hash(i, 4) * 6) | 0);
  for (let a = 0; a < cw; a++) for (let b = 0; b < 3 + ((hash(i, a) * 3) | 0); b++) cv.box(ox + a * 3, oy + (a % 2 ? 1.5 : 0), oz + b * 3, 3.2, 2.6, 3.2, 0xffffff, 0.03);
}
clouds.add(cv.build(false, false, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false }))); scene.add(clouds);

/* ── Hải âu ── */
const birds: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; sp: number; ph: number; h: number }[] = [];
for (let i = 0; i < 8; i++) {
  const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: i % 3 ? 0xffffff : 0xdfe6ee });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.7), body), wl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.4), body), wr = wl.clone();
  wl.position.x = -0.6; wr.position.x = 0.6; g.add(b, wl, wr); scene.add(g);
  birds.push({ g, wl, wr, r: 24 + hash(i, 1) * 50, sp: 0.16 + hash(i, 2) * 0.14, ph: hash(i, 3) * 6.28, h: 9 + hash(i, 4) * 10 });
}
/* ── Cua đỏ bò ngang trên bãi cát ── */
const crabs: { g: THREE.Group; x: number; z: number; tx: number; tz: number; t: number; c: number }[] = [];
for (let i = 0; i < 9; i++) {
  const a = hash(i, 8) * 6.28, ux = Math.cos(a), uz = Math.sin(a), k = (limit(ux, uz) - 2.2) / dist6(ux, uz), x = ux * k, z = uz * k;
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: i % 3 ? 0xe2452f : 0xff7a3d, roughness: 0.7 });
  const add = (w: number, h: number, d: number, px: number, py: number, pz: number) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); };
  add(0.7, 0.28, 0.5, 0, 0.2, 0); add(0.22, 0.2, 0.22, -0.5, 0.32, 0.3); add(0.22, 0.2, 0.22, 0.5, 0.32, 0.3); add(0.08, 0.14, 0.08, -0.15, 0.42, 0.2); add(0.08, 0.14, 0.08, 0.15, 0.42, 0.2);
  scene.add(g); crabs.push({ g, x, z, tx: x, tz: z, t: hash(i, 4) * 3, c: i });
}
/* ── Phấn hoa / bụi nắng ── */
const FN = 120, fp = new Float32Array(FN * 3), fg = new THREE.BufferGeometry();
for (let i = 0; i < FN; i++) { fp[i * 3] = (hash(i, 1) - 0.5) * 66; fp[i * 3 + 1] = 0.5 + hash(i, 2) * 8; fp[i * 3 + 2] = (hash(i, 3) - 0.5) * 66; }
fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
const flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xfff3a0, size: 0.26, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
flies.frustumCulled = false; scene.add(flies);

export function updateTerrain(t: number, dt: number) {
  wu.uT.value = t; foamMat.opacity = 0.45 + 0.2 * Math.sin(t * 1.5);
  EM.update(t);
  clouds.position.x = (t * 1.4) % 300; if (clouds.position.x > 150) clouds.position.x -= 300;
  for (const b of birds) {
    const a = t * b.sp + b.ph, x = Math.cos(a) * b.r, z = Math.sin(a) * b.r;
    b.g.position.set(x, b.h + Math.sin(t * 0.7 + b.ph) * 1.5, z); b.g.rotation.y = -a;
    const f = Math.sin(t * 9 + b.ph) * 0.7; b.wl.rotation.z = f; b.wr.rotation.z = -f;
  }
  for (const s of crabs) {
    s.t -= dt;
    if (s.t <= 0) { s.t = 1 + hash(s.c, Math.floor(t)) * 2.5; const a = hash(s.c, Math.floor(t * 3)) * 6.28; s.tx = s.x + Math.cos(a) * 2.5; s.tz = s.z + Math.sin(a) * 2.5; if (dist6(s.tx, s.tz) > limit(s.tx, s.tz) - 1 || dist6(s.tx, s.tz) < limit(s.tx, s.tz) - 4.5) { s.tx = s.x; s.tz = s.z; } }
    const dx = s.tx - s.x, dz = s.tz - s.z; s.x += dx * Math.min(1, dt * 1.6); s.z += dz * Math.min(1, dt * 1.6);
    s.g.position.set(s.x, Math.abs(Math.sin(t * 10 + s.c)) * 0.04, s.z); if (Math.hypot(dx, dz) > 0.05) s.g.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
  }
  const p = fg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < FN; i++) { p.setY(i, 0.8 + (fp[i * 3 + 1] + Math.sin(t * 0.6 + i) * 0.8) % 9); p.setX(i, fp[i * 3] + Math.sin(t * 0.3 + i * 1.7) * 1.2); }
  p.needsUpdate = true;
}
