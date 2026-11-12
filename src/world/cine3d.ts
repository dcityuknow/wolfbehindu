import * as THREE from "three";
import { scene, camera, sun, hemi, sky, sunOrb, torch } from "./scene";
import { buildSoldier, defOf } from "./soldier";
import { attachGun, type GunRig } from "./guns";
import { groundAt } from "./terrain";
import { COLORS, SQUAD, type GunId } from "../config";
import { CINE } from "./cineState";
import { N, PLANE_YAW, planeAt, toWorld, RANK, LAND, stateOf, smooth, lerp, storm } from "./cinePath";

/**
 * Cảnh mở đầu 3D voxel (thay cho bản SVG 2D). 6 "beat" khớp với CUTSCENE trong story.ts:
 *  0 khoang máy bay (đội ngồi, đèn đỏ) · 1 đèn xanh, lần lượt chạy ra ramp và nhảy dù · 2 bão + sét + gió ·
 *  3 trôi dạt về đảo, chạm đất, tối dần · 4 mở mắt lúc bình minh, thấy cả đội nằm quanh lửa trại · 5 cả đội dần ngồi dậy.
 * Mỗi beat là hàm thuần của (beat, t) nên bấm bỏ qua / nhảy beat vẫn đúng trạng thái. Quỹ đạo nằm ở cinePath.ts.
 */
export const BEAT_MIN = [8, 13, 10, 13, 10, 12];   // thời lượng tối thiểu của hình ảnh mỗi beat (giây)
const GUN_IDS: GunId[] = ["rifle", "smg", "rifle", "pistol", "rifle", "shotgun", "smg"];

/* ───────────── ánh sáng / bầu trời theo từng cảnh ───────────── */
interface Look { top: number; mid: number; hor: number; fog: number; fogD: number; hemi: number; hemiC: number; sun: number; sunC: number; cloud: number; stars: number; orb: number }
const NIGHT: Look = { top: 0x070b24, mid: 0x16224a, hor: 0x2b3c68, fog: 0x1d2a4d, fogD: 0.0035, hemi: 0.95, hemiC: 0x8fa4ff, sun: 0.55, sunC: 0xa9c0ff, cloud: 0x2a3558, stars: 1, orb: 0 };
const STORM: Look = { top: 0x0d1016, mid: 0x1f252d, hor: 0x39424d, fog: 0x2a313a, fogD: 0.011, hemi: 0.6, hemiC: 0x9aa6b8, sun: 0.18, sunC: 0x8899aa, cloud: 0x20252c, stars: 0, orb: 0 };
const BLACK: Look = { top: 0x000000, mid: 0x020306, hor: 0x05070b, fog: 0x020306, fogD: 0.02, hemi: 0.02, hemiC: 0x333344, sun: 0, sunC: 0x000000, cloud: 0x050608, stars: 0, orb: 0 };
const DAWN: Look = { top: 0x4a78b4, mid: 0xf2a679, hor: 0xffd9a3, fog: 0xf0cfa4, fogD: 0.0055, hemi: 1.15, hemiC: 0xffe0c0, sun: 2.0, sunC: 0xffc890, cloud: 0xf2c9a8, stars: 0, orb: 1 };
const mixHex = (a: number, b: number, k: number) => { const r = lerp((a >> 16) & 255, (b >> 16) & 255, k), g = lerp((a >> 8) & 255, (b >> 8) & 255, k), bl = lerp(a & 255, b & 255, k); return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl); };
const mixLook = (a: Look, b: Look, k: number): Look => ({
  top: mixHex(a.top, b.top, k), mid: mixHex(a.mid, b.mid, k), hor: mixHex(a.hor, b.hor, k), fog: mixHex(a.fog, b.fog, k), fogD: lerp(a.fogD, b.fogD, k), hemi: lerp(a.hemi, b.hemi, k),
  hemiC: mixHex(a.hemiC, b.hemiC, k), sun: lerp(a.sun, b.sun, k), sunC: mixHex(a.sunC, b.sunC, k), cloud: mixHex(a.cloud, b.cloud, k), stars: lerp(a.stars, b.stars, k), orb: lerp(a.orb, b.orb, k),
});

/* ───────────── dựng đối tượng (một lần) ───────────── */
const cineLight = new THREE.PointLight(0xff3a1a, 0, 10, 2); scene.add(cineLight);   // đèn đỏ báo nhảy (tạo sẵn để không phải biên dịch lại shader giữa chừng)
const root = new THREE.Group();
const mt = (c: number, r = 0.85, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const mb = (c: number) => new THREE.MeshBasicMaterial({ color: c, fog: false });
const bx = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); g.add(k); return k; };

const plane = new THREE.Group(), ramp = new THREE.Group(), props: THREE.Group[] = [];
const lampMat = mb(0xff2a2a), tipR = mb(0xff2020), tipG = mb(0x20ff40);
{ // máy bay vận tải C-130 voxel: thân rỗng (nhìn được cả từ trong lẫn từ ngoài), đuôi hở, ramp mở được. Mũi = -z, đuôi = +z, sàn y = 0.
  const hull = mt(0x56663c, 0.8), dark = mt(0x2c3322, 0.9), metal = mt(0x6c7178, 0.5, 0.6), strap = mt(0x3a4a2e, 0.95);
  bx(plane, 4.2, 0.2, 16.3, 0, -0.1, -1.15, dark); bx(plane, 4.2, 0.2, 16.3, 0, 3.1, -1.15, hull);
  bx(plane, 0.2, 3.2, 16.3, -2, 1.5, -1.15, hull); bx(plane, 0.2, 3.2, 16.3, 2, 1.5, -1.15, hull); bx(plane, 4.2, 3.4, 0.2, 0, 1.5, -9.3, hull);
  bx(plane, 3.6, 2.8, 3.6, 0, 1.3, -11.2, hull); bx(plane, 2.4, 2.0, 1.6, 0, 1.1, -13.4, hull); bx(plane, 2.6, 0.7, 0.1, 0, 2.0, -13.06, mb(0x1b2a40));
  bx(plane, 3.6, 0.2, 3.4, 0, 3.4, 8.7, hull); bx(plane, 0.4, 4.2, 3.2, 0, 5.2, 8.4, hull); bx(plane, 8, 0.3, 2, 0, 6.2, 8.6, hull);
  bx(plane, 28, 0.4, 3.6, 0, 3.0, -2.0, hull); bx(plane, 0.5, 0.3, 0.5, -14, 3.1, -2, tipR); bx(plane, 0.5, 0.3, 0.5, 14, 3.1, -2, tipG);
  for (const x of [-10, -5.5, 5.5, 10]) {
    bx(plane, 1.1, 1.1, 2.4, x, 2.6, -3.4, metal);
    const p = new THREE.Group(); p.position.set(x, 2.6, -4.7); bx(p, 0.12, 2.8, 0.1, 0, 0, 0, dark); bx(p, 2.8, 0.12, 0.1, 0, 0, 0, dark); plane.add(p); props.push(p);
  }
  bx(plane, 0.5, 0.5, 14.5, -1.65, 0.25, -1.5, dark); bx(plane, 0.5, 0.5, 14.5, 1.65, 0.25, -1.5, dark);                 // băng ghế
  bx(plane, 0.08, 1.3, 14.5, -1.88, 1.15, -1.5, strap); bx(plane, 0.08, 1.3, 14.5, 1.88, 1.15, -1.5, strap);             // dây đai tựa lưng
  bx(plane, 0.25, 0.06, 12, 0, 2.98, -1.5, mb(0x602020)); bx(plane, 0.35, 0.2, 0.35, 0, 2.95, 6.2, lampMat);              // đèn trần + đèn báo nhảy
  ramp.position.set(0, 0.02, 7); bx(ramp, 3.6, 3.4, 0.16, 0, 1.7, 0, dark); plane.add(ramp);
  plane.rotation.y = PLANE_YAW; root.add(plane);
}

interface Rig { rig: THREE.Group; s: ReturnType<typeof buildSoldier>; chute: THREE.Group; gun: GunRig }
const rigs: Rig[] = [];
const makeChute = (c: number) => {
  const g = new THREE.Group(), m1 = mt(c, 0.9), m2 = mt(0xe8e8e8, 0.9), W = [6, 5.6, 4.8, 3.6, 2.2, 1];
  W.forEach((w, l) => bx(g, w, 0.32, w, 0, 0.16 + l * 0.32, 0, l % 2 ? m2 : m1));
  const pts: number[] = []; for (const [x, z] of [[2.6, 2.6], [-2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]]) pts.push(x, 0, z, 0, -2.2, 0);
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd }))); return g;
};
function buildRigs() {
  if (rigs.length) return;
  for (let i = 0; i < N; i++) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const s = buildSoldier(defOf(SQUAD[i]), m, COLORS[i]), gun = attachGun(s.g, GUN_IDS[i]);
    const rig = new THREE.Group(), chute = makeChute(COLORS[i]); chute.visible = false; rig.add(s.g, chute); root.add(rig);
    rigs.push({ rig, s, chute, gun });
  }
}
/* mây bão, sao, mưa */
const cloudMat = new THREE.MeshStandardMaterial({ color: 0x2a3558, roughness: 1, flatShading: true });
const clouds = new THREE.Group();
{ let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 26; c++) { const cl = new THREE.Group(); cl.position.set(-260 + rnd() * 420, 95 + rnd() * 100, -140 + rnd() * 280);
    for (let b = 0; b < 5; b++) bx(cl, 10 + rnd() * 12, 3 + rnd() * 3, 8 + rnd() * 8, (rnd() - 0.5) * 16, (rnd() - 0.5) * 3, (rnd() - 0.5) * 12, cloudMat); clouds.add(cl); }
  root.add(clouds); }
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
const stars = (() => { const p: number[] = []; for (let i = 0; i < 380; i++) { const a = Math.random() * 6.283, e = 0.08 + Math.random() * 1.4, r = 380; p.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); const pt = new THREE.Points(g, starMat); pt.frustumCulled = false; root.add(pt); return pt; })();
const RN = 450, rp = new Float32Array(RN * 3), rpos = new Float32Array(RN * 6);
for (let i = 0; i < RN; i++) { rp[i * 3] = (Math.random() - 0.5) * 50; rp[i * 3 + 1] = Math.random() * 35 - 10; rp[i * 3 + 2] = (Math.random() - 0.5) * 50; }
const rainMat = new THREE.LineBasicMaterial({ color: 0xaec0d8, transparent: true, opacity: 0.5, fog: false, depthWrite: false });
const rain = (() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(rpos, 3)); const l = new THREE.LineSegments(g, rainMat); l.frustumCulled = false; root.add(l); return l; })();

/* ───────────── trạng thái chạy ───────────── */
const S = { beat: -1, t: 0, clock: 0, cut: 0 };
let GL: number[] = [], env: any = null;
let ovFade: HTMLElement | null, ovFlash: HTMLElement | null, ovBlur: HTMLElement | null, ovLidT: HTMLElement | null, ovLidB: HTMLElement | null;
const V = new THREE.Vector3(), P0 = new THREE.Vector3(), T0 = new THREE.Vector3(), P1 = new THREE.Vector3(), T1 = new THREE.Vector3(), CEN = new THREE.Vector3();

export function cineBegin() {
  buildRigs();
  GL = LAND.map((l) => groundAt(l.x, l.z));
  const u = (sky.material as THREE.ShaderMaterial).uniforms, fog = scene.fog as THREE.FogExp2;
  env = { hemiI: hemi.intensity, hemiC: hemi.color.getHex(), sunI: sun.intensity, sunC: sun.color.getHex(), fogC: fog.color.getHex(), fogD: fog.density, top: u.top.value.getHex(), mid: u.mid.value.getHex(), hor: u.hor.value.getHex(), bg: (scene.background as THREE.Color).getHex(), torchI: torch.intensity, orb: sunOrb.visible, fov: camera.fov, far: camera.far };
  ovFade = document.getElementById("cineFade"); ovFlash = document.getElementById("cineFlash"); ovBlur = document.getElementById("cineBlur"); ovLidT = document.getElementById("cineLidT"); ovLidB = document.getElementById("cineLidB");
  S.beat = 0; S.t = 0; S.clock = 0; S.cut = 0; camera.far = 1500; camera.updateProjectionMatrix();
  scene.add(root); CINE.active = true;
}
export function cineBeat(b: number) { S.beat = b; S.t = 0; if (b === 1 || b === 2 || b === 3 || b === 5) S.cut = 1; }
export function cineEnd() {
  if (!CINE.active) return;
  CINE.active = false; scene.remove(root); cineLight.intensity = 0;
  const u = (sky.material as THREE.ShaderMaterial).uniforms, fog = scene.fog as THREE.FogExp2;
  hemi.intensity = env.hemiI; hemi.color.setHex(env.hemiC); sun.intensity = env.sunI; sun.color.setHex(env.sunC); fog.color.setHex(env.fogC); fog.density = env.fogD;
  u.top.value.setHex(env.top); u.mid.value.setHex(env.mid); u.hor.value.setHex(env.hor); (scene.background as THREE.Color).setHex(env.bg); torch.intensity = env.torchI;
  sunOrb.visible = env.orb; sky.position.set(0, 0, 0); camera.fov = env.fov; camera.far = env.far; camera.rotation.set(0, 0, 0); camera.updateProjectionMatrix();
  for (const o of [ovFade, ovFlash]) if (o) o.style.opacity = "0";
}

/* ───────────── tư thế từng người ───────────── */
function armsLow(r: Rig, th = -0.95) { r.s.armL.rotation.set(th, 0, 0.3); r.s.armR.rotation.set(th, 0, -0.3); r.gun.pivot.rotation.x = th + Math.PI / 2; }
function poseSoldier(i: number, ct: number, rise: number) {
  const r = rigs[i], st = stateOf(i, ct, GL[i]), c = S.clock, g = r.s.g;
  r.rig.rotation.set(0, 0, 0); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); r.s.legL.rotation.set(0, 0, 0); r.s.legR.rotation.set(0, 0, 0);
  r.chute.visible = false; r.chute.position.set(0, 0, 0); r.chute.scale.set(1, 1, 1); r.chute.rotation.set(0, 0, 0); r.gun.pivot.visible = true;
  switch (st.mode) {
    case "seat": case "walk": { // ngồi trên ghế → đứng dậy, đi tới ramp xếp hàng
      const sit = 1 - st.stand, sw = Math.sin(c * 7 + i) * (st.walking ? 0.6 : 0.12) * st.stand;
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.y = st.wyaw;
      g.position.y = -0.17 * sit + Math.sin(c * 8 + i * 1.3) * 0.015 * sit;
      r.s.legL.rotation.x = (-Math.PI / 2) * sit + sw; r.s.legR.rotation.x = (-Math.PI / 2) * sit - sw;
      armsLow(r, -0.95 + Math.sin(c * 2 + i) * 0.02); break;
    }
    case "fall": { // rơi tự do, sấp, dang tay
      const w = Math.sin(c * 9 + i) * 0.1;
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.set(Math.sin(c * 6 + i) * 0.12, Math.PI / 2, 0);
      g.rotation.x = Math.PI / 2; g.position.set(0, 0, -0.9); r.gun.pivot.visible = false;
      r.s.armL.rotation.set(-0.3, 0, -1.3 + w); r.s.armR.rotation.set(-0.3, 0, 1.3 - w); r.s.legL.rotation.set(0.3, 0, -0.35); r.s.legR.rotation.set(0.3, 0, 0.35); break;
    }
    case "chute": { // treo dưới dù, gió bão làm lắc mạnh
      const A = 0.06 + 0.42 * storm(ct), o = st.open;
      r.rig.position.set(st.wx, st.wy + 3.55, st.wz); r.rig.rotation.set(Math.sin(ct * 1.5 + i) * A * 0.6, i + ct * 0.25, Math.sin(ct * 1.9 + i * 2.1) * A);
      g.position.y = -3.55; r.chute.visible = true; r.chute.scale.set(0.2 + 0.8 * o, 0.1 + 0.9 * o, 0.2 + 0.8 * o); r.gun.pivot.visible = false;
      r.s.armL.rotation.set(-2.9, 0, 0.15); r.s.armR.rotation.set(-2.9, 0, -0.15);
      r.s.legL.rotation.x = Math.sin(c * 2 + i) * 0.15; r.s.legR.rotation.x = -Math.sin(c * 2 + i) * 0.15; break;
    }
    case "landed": { // chạm đất, ngã nằm ngửa; dù xẹp xuống bên cạnh. rise > 0: ngồi/đứng dậy
      const L = st.land * (1 - rise), e = smooth(0, 1, st.land);
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.y = LAND[i].a + Math.PI + 0.6 * Math.sin(i * 2.7);
      g.rotation.x = (-Math.PI / 2) * L; g.position.set(0, 0.13 * L, 0.9 * L); armsLow(r, lerp(-0.95, 0.12, L));
      r.chute.visible = true; r.chute.position.set(lerp(0, 3.0, e), lerp(3.55, 0.05, e), lerp(0, 0.8, e)); r.chute.scale.set(1 + 0.1 * e, lerp(1, 0.09, e), 1 + 0.1 * e); r.chute.rotation.y = i; break;
    }
  }
}

/* ───────────── camera từng cảnh ───────────── */
const look = (p: THREE.Vector3, t: THREE.Vector3, shake = 0) => {
  camera.position.copy(p); if (shake) camera.position.add(V.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
  camera.lookAt(t); if (shake) camera.rotateZ((Math.random() - 0.5) * shake * 0.03);
};
const setFov = (f: number) => { if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); } };
const flashAt: Record<number, number[]> = { 2: [2.0, 2.25, 5.4, 8.3], 3: [1.2] };

function camera3d(b: number, t: number, ct: number, win: { x: number; y: number; z: number }[]) {
  CEN.set(0, 0, 0); for (const w of win) CEN.add(V.set(w.x, w.y, w.z)); CEN.multiplyScalar(1 / N);
  const p = planeAt(ct), c = S.clock;
  if (b <= 0) { // trong khoang: dolly dọc lối đi, rung nhẹ vì nhiễu động
    const lz = -7.6 + 0.45 * t, w = toWorld(ct, 0.15 * Math.sin(t * 0.5), 1.5, lz), tg = toWorld(ct, 0, 1.25, lz + 5);
    setFov(64); look(P0.set(w.x, w.y, w.z), T0.set(tg.x, tg.y, tg.z), 0.012 + 0.01 * Math.sin(c * 3)); return;
  }
  if (b === 1) { // bám theo máy bay từ phía sau → quay sang nhìn cả đàn dù
    setFov(56);
    P0.set(p.x - 17, p.y + 3.2 + 0.4 * Math.sin(t * 0.7), p.z + 6.5); T0.set(p.x - 8.5, p.y + 0.9, p.z);
    P1.set(CEN.x - 24, CEN.y + 7, CEN.z + 18); T1.copy(CEN);
    const w = smooth(9.5, 13, t), w2 = smooth(5, 12, t);
    T0.lerp(T1, w2 * 0.6); look(P0.lerp(P1, w), T0.lerp(T1, w), 0.03); return;
  }
  if (b === 2) { // bão: quay quanh đàn dù, rồi áp sát một người
    setFov(60); const a = -2.2 + 0.1 * t, sh = 0.25 * storm(ct);
    P0.set(CEN.x + Math.cos(a) * 30, CEN.y + 4 + Math.sin(t) * 3, CEN.z + Math.sin(a) * 30); T0.copy(CEN);
    const w0 = win[0]; P1.set(w0.x - 7, w0.y + 1, w0.z + 6); T1.set(w0.x, w0.y + 0.5, w0.z);
    look(P0.lerp(P1, smooth(4.5, 6.5, t)), T0.lerp(T1, smooth(4.5, 6.5, t)), sh); return;
  }
  if (b === 3) { // hạ độ cao theo đàn dù, tới sát mặt đất
    setFov(62); const a = -1.6 + 0.12 * t, d = lerp(26, 10, smooth(0, 11, t));
    P0.set(CEN.x + Math.cos(a) * d, Math.max(2.2, CEN.y + 3), CEN.z + Math.sin(a) * d); look(P0, T0.set(CEN.x, Math.max(1, CEN.y), CEN.z), 0.12 * storm(ct) + 0.02); return;
  }
  // 4 + 5: trên đảo, lúc bình minh
  const L0 = LAND[0], aC = L0.a + 0.6;
  if (b === 4) { // mở mắt: nhìn trời, rồi lướt qua từng người đang nằm
    setFov(58); P0.set(Math.cos(aC) * 8, GL[0] + 0.35 + 0.5 * smooth(3, 10, t), Math.sin(aC) * 8);
    const sky0 = T1.set(P0.x + 0.6, P0.y + 8, P0.z + 0.6), u = Math.max(0, 0.5 * (t - 2)), j = Math.min(N - 1, Math.floor(u)), j2 = Math.min(N - 1, j + 1), f = smooth(0, 1, u - j);
    const a = LAND[j], a2 = LAND[j2]; T0.set(lerp(a.x, a2.x, f), GL[j] + 0.3, lerp(a.z, a2.z, f));
    look(P0, sky0.lerp(T0, smooth(1.5, 3.8, t)), 0.004 * (1 - smooth(1, 4, t))); return;
  }
  const k = smooth(0, 12, t), ang = aC + 1.0 * k, rad = lerp(8, 17, k);   // 5: cần cẩu nâng lên toàn cảnh
  setFov(60); look(P0.set(Math.cos(ang) * rad, GL[0] + lerp(1.2, 11, k), Math.sin(ang) * rad), T0.set(0, 1, 0), 0);
}

/* ───────────── cập nhật mỗi frame ───────────── */
export function cineUpdate(dt: number) {
  if (!CINE.active) return;
  S.t += dt; S.clock += dt; S.cut = Math.max(0, S.cut - dt * 2.2);
  const b = S.beat, t = S.t, ct = b <= 0 ? -8 + t : b === 1 ? t : b === 2 ? 13 + t : b === 3 ? 23 + t : 999;
  const win: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < N; i++) { poseSoldier(i, ct, b === 5 ? smooth(2 + 0.9 * RANK[i], 3.8 + 0.9 * RANK[i], t) : 0); const w = stateOf(i, ct, GL[i]); win.push({ x: w.wx, y: w.wy, z: w.wz }); }
  const pa = planeAt(Math.min(ct, 60));
  plane.visible = b <= 3; plane.position.set(pa.x, pa.y, pa.z); ramp.rotation.x = (b <= 0 ? 0 : b === 1 ? smooth(0.2, 1.6, t) : 1) * (Math.PI / 2);
  for (const p of props) p.rotation.z += dt * 40;
  const blink = Math.max(0, Math.sin(S.clock * 4.5)) ** 2; lampMat.color.setHex(mixHex(0x401010, 0xff2a2a, blink)); tipR.color.setHex(Math.sin(S.clock * 6) > 0 ? 0xff2020 : 0x300808); tipG.color.setHex(Math.sin(S.clock * 6 + 2) > 0 ? 0x20ff40 : 0x083010);
  { const w = toWorld(ct, 0, 2.6, 5.5); cineLight.position.set(w.x, w.y, w.z); cineLight.intensity = b <= 1 && ct < 3 ? 5 * blink : 0; }

  // ánh sáng + bầu trời + bão
  let L = NIGHT, rainK = 0, fade = 0, lid = 0, blur = 0, flash = 0;
  if (b === 2) { L = mixLook(NIGHT, STORM, smooth(0, 2.5, t)); rainK = smooth(0.3, 2.5, t); }
  else if (b === 3) { L = mixLook(STORM, BLACK, smooth(4, 12.8, t)); rainK = 1 - smooth(7, 12, t); fade = smooth(11.6, 13, t); }
  else if (b === 4) { L = mixLook(BLACK, DAWN, smooth(0.5, 9, t)); lid = 1 - (t < 1.1 ? 0.35 * smooth(0.3, 1.1, t) : t < 1.5 ? lerp(0.35, 0.05, smooth(1.1, 1.5, t)) : lerp(0.05, 1, smooth(1.5, 3.6, t))); blur = 16 * (1 - smooth(1.2, 5.5, t)); }
  else if (b >= 5) L = DAWN;
  for (const te of flashAt[b] ?? []) if (t >= te) flash += Math.exp(-(t - te) * 12);
  flash = Math.min(1, flash);
  const u = (sky.material as THREE.ShaderMaterial).uniforms, fog = scene.fog as THREE.FogExp2;
  u.top.value.setHex(L.top); u.mid.value.setHex(L.mid); u.hor.value.setHex(L.hor); (scene.background as THREE.Color).setHex(L.hor); fog.color.setHex(L.fog); fog.density = L.fogD;
  hemi.color.setHex(L.hemiC); hemi.intensity = L.hemi + 4 * flash; sun.color.setHex(L.sunC); sun.intensity = L.sun; torch.intensity = b >= 4 ? env.torchI * smooth(0, 1, L.hemi) : 0;
  cloudMat.color.setHex(L.cloud); starMat.opacity = L.stars; stars.visible = L.stars > 0.01; sunOrb.visible = L.orb > 0.5; clouds.position.x = -6 * ct * (b <= 3 ? 1 : 0);
  clouds.visible = b <= 3;

  camera3d(b, t, ct, win);
  sky.position.copy(camera.position); stars.position.copy(camera.position);

  // mưa xiên theo gió
  rain.visible = rainK > 0.01; rainMat.opacity = 0.5 * rainK;
  if (rain.visible) {
    const wind = 28 * rainK;
    for (let i = 0; i < RN; i++) {
      let x = rp[i * 3] + wind * dt * 0.6, y = rp[i * 3 + 1] - 55 * dt, z = rp[i * 3 + 2];
      if (y < -12) y += 35; if (x > 25) x -= 50;
      rp[i * 3] = x; rp[i * 3 + 1] = y;
      const hx = camera.position.x + x, hy = camera.position.y + y, hz = camera.position.z + z;
      rpos.set([hx, hy, hz, hx - wind * 0.02, hy + 1.1, hz], i * 6);
    }
    (rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // lớp phủ DOM: chớp sét, tối dần, mí mắt, nhoè
  if (ovFade) ovFade.style.opacity = String(Math.max(fade, S.cut));
  if (ovFlash) ovFlash.style.opacity = String(0.6 * flash);
  if (ovLidT && ovLidB) { ovLidT.style.height = ovLidB.style.height = lid * 50 + "%"; }
  if (ovBlur) { const f = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : "none"; ovBlur.style.backdropFilter = f; (ovBlur.style as any).webkitBackdropFilter = f; }
}
