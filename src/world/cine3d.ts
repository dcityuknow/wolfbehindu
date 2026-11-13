import * as THREE from "three";
import { scene, camera, sun, hemi, sky, sunOrb, torch } from "./scene";
import { buildSoldier, defOf, PX } from "./soldier";
import { attachGun, type GunRig } from "./guns";
import { COLORS, SQUAD, type GunId } from "../config";
import { CINE, VO } from "./cineState";
import { reserved, WALLS } from "./map";
import { groundAt, walkable, H, slopeAt, CAMP_Y } from "./island";
import { reachable } from "./nav";
import { cineSfx } from "../audio";
import { say, voicePreload, voiceStop } from "../voice";
import { N, PLANE_YAW, planeAt, toWorld, RANK, LAND, stateOf, smooth, lerp, storm } from "./cinePath";

/**
 * Cảnh mở đầu 3D voxel — 5 phân cảnh khớp kịch bản 60 giây (CUTSCENE trong story.ts):
 *  0 (0:00) khoang máy bay, nghi kỵ, kẻ nội gián bấm bộ phát tín hiệu · 1 (0:12) đèn xanh, ramp mở, lần lượt nhảy · 2 (0:22) rơi tự do vào tâm bão, sét, bộ đàm nhiễu ·
 *  3 (0:38) đồng hồ độ cao báo đỏ, dù tự bung, đập đầu, ngất · 4 (0:48) màn đen, rơi xuyên tán rừng xuống bùn, camera vút lên thấy cả đảo và những chiếc dù rải rác.
 * Mỗi beat là hàm thuần của (beat, t) nên bấm bỏ qua / nhảy beat vẫn đúng trạng thái. Quỹ đạo nằm ở cinePath.ts.
 */
export const BEAT_MIN = [12, 10, 16, 10, 12];   // thời lượng hình ảnh mỗi phân cảnh (giây) — tổng 60s
const GUN_IDS: GunId[] = ["rifle", "smg", "rifle", "pistol", "rifle", "shotgun", "smg"];

/* ───────────── ánh sáng / bầu trời theo từng cảnh ───────────── */
interface Look { top: number; mid: number; hor: number; fog: number; fogD: number; hemi: number; hemiC: number; sun: number; sunC: number; cloud: number; stars: number; orb: number }
const NIGHT: Look = { top: 0x070b24, mid: 0x16224a, hor: 0x2b3c68, fog: 0x1d2a4d, fogD: 0.0035, hemi: 0.95, hemiC: 0x8fa4ff, sun: 0.55, sunC: 0xa9c0ff, cloud: 0x2a3558, stars: 1, orb: 0 };
const STORM: Look = { top: 0x0d1016, mid: 0x1f252d, hor: 0x39424d, fog: 0x2a313a, fogD: 0.011, hemi: 0.6, hemiC: 0x9aa6b8, sun: 0.18, sunC: 0x8899aa, cloud: 0x20252c, stars: 0, orb: 0 };
const BLACK: Look = { top: 0x000000, mid: 0x020306, hor: 0x05070b, fog: 0x020306, fogD: 0.02, hemi: 0.02, hemiC: 0x333344, sun: 0, sunC: 0x000000, cloud: 0x050608, stars: 0, orb: 0 };
const DAWN: Look = { top: 0x4a78b4, mid: 0xf2a679, hor: 0xffd9a3, fog: 0xf0cfa4, fogD: 0.0055, hemi: 1.15, hemiC: 0xffe0c0, sun: 2.0, sunC: 0xffc890, cloud: 0xf2c9a8, stars: 0, orb: 1 };
const INTERIOR: Look = { ...NIGHT, hemi: 0.22, hemiC: 0x4f8294, sun: 0, fogD: 0.002 };   // trong khoang: tối, ánh teal nhẹ, đèn đỏ/xanh làm chủ đạo (Chiaroscuro)
const GREY: Look = { top: 0x34445a, mid: 0x62788e, hor: 0xa3b4c0, fog: 0x8798a6, fogD: 0.0055, hemi: 0.95, hemiC: 0xb8cadb, sun: 0.4, sunC: 0xcfd9e2, cloud: 0x7b8a99, stars: 0, orb: 0 };   // bình minh xám lạnh trên biển
const FOREST_LOW: Look = { top: 0x16302b, mid: 0x24493f, hor: 0x4a6b5c, fog: 0x2c4a40, fogD: 0.016, hemi: 0.75, hemiC: 0x8fd0b4, sun: 1.7, sunC: 0xe6f4c8, cloud: 0x24493f, stars: 0, orb: 0 };    // rừng ẩm xanh rêu, tia nắng xuyên kẽ lá
const FOREST_HIGH: Look = { ...FOREST_LOW, top: 0x3c6a6a, mid: 0x6a9b8a, hor: 0xb9d6b8, fog: 0x7fa593, fogD: 0.0045, hemi: 0.95 };
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
{ // máy bay vận tải hai động cơ cánh quạt kiểu An-26 (theo ảnh minh họa): cánh cao, 2 nacelle + càng chính, mũi kính, đuôi hếch, ramp sau mở được. Mũi = -z, đuôi = +z, sàn y = 0.
  const hull = mt(0x9a9a86, 0.7, 0.15), wingM = mt(0x6a6f76, 0.65, 0.3), dark = mt(0x2c3322, 0.9), liner = mt(0x3c4630, 0.95), metal = mt(0x7b8086, 0.45, 0.6), strap = mt(0x3a4a2e, 0.95), glass = mb(0x1b2a40), win = mb(0x34506e);
  // thân rỗng (nhìn được cả từ trong lẫn từ ngoài): vỏ ngoài sáng, lớp lót trong tối để khoang vẫn u ám
  bx(plane, 4.2, 0.2, 16.3, 0, -0.1, -1.15, dark); bx(plane, 4.2, 0.2, 16.3, 0, 3.1, -1.15, hull);
  bx(plane, 0.2, 3.2, 16.3, -2, 1.5, -1.15, hull); bx(plane, 0.2, 3.2, 16.3, 2, 1.5, -1.15, hull); bx(plane, 4.2, 3.4, 0.2, 0, 1.5, -9.3, hull);
  bx(plane, 0.06, 3.0, 16.1, -1.86, 1.5, -1.15, liner); bx(plane, 0.06, 3.0, 16.1, 1.86, 1.5, -1.15, liner); bx(plane, 3.7, 0.06, 16.1, 0, 2.95, -1.15, liner);
  // bo tròn thân: vát 4 góc
  for (const sx of [-1, 1]) { const c = bx(plane, 0.5, 0.5, 16.3, sx * 1.95, 3.0, -1.15, hull); c.rotation.z = sx * Math.PI / 4; const d = bx(plane, 0.5, 0.5, 16.3, sx * 1.95, 0.05, -1.15, dark); d.rotation.z = -sx * Math.PI / 4; }
  // mũi + buồng lái + mũi kính hoa tiêu
  bx(plane, 3.6, 2.8, 3.6, 0, 1.3, -11.2, hull); bx(plane, 2.6, 2.2, 1.8, 0, 1.0, -13.4, hull); bx(plane, 1.6, 1.4, 1.2, 0, 0.6, -14.6, hull);
  bx(plane, 1.5, 0.9, 0.1, 0, 0.55, -15.25, glass); bx(plane, 2.4, 0.8, 0.1, 0, 1.0, -14.32, glass);
  bx(plane, 0.1, 0.7, 2.2, -1.82, 1.9, -11.9, glass); bx(plane, 0.1, 0.7, 2.2, 1.82, 1.9, -11.9, glass); bx(plane, 2.6, 0.7, 0.1, 0, 2.0, -13.06, glass);
  for (let z = -7.6; z <= 5; z += 1.9) { bx(plane, 0.08, 0.5, 0.7, -2.07, 1.9, z, win); bx(plane, 0.08, 0.5, 0.7, 2.07, 1.9, z, win); }   // cửa sổ thân
  // đuôi hếch + vây đứng (sọc 3 màu) + cánh đuôi
  const tail = bx(plane, 3.2, 0.3, 4.2, 0, 3.9, 9.0, hull); tail.rotation.x = 0.28; const tail2 = bx(plane, 0.3, 2.2, 3.4, -1.45, 3.4, 8.7, hull); tail2.rotation.x = 0.28; const tail3 = bx(plane, 0.3, 2.2, 3.4, 1.45, 3.4, 8.7, hull); tail3.rotation.x = 0.28;
  bx(plane, 0.4, 5.2, 3.4, 0, 5.8, 9.2, hull); bx(plane, 0.42, 1.0, 3.2, 0, 7.2, 9.3, mb(0xc8c8c8)); bx(plane, 0.42, 1.0, 3.2, 0, 6.2, 9.3, mb(0x2a4d9b)); bx(plane, 0.42, 1.0, 3.2, 0, 5.2, 9.3, mb(0xc0302a));
  bx(plane, 9.4, 0.28, 2.0, 0, 4.9, 9.6, wingM); bx(plane, 0.5, 0.4, 0.5, -4.7, 4.9, 9.6, tipR); bx(plane, 0.5, 0.4, 0.5, 4.7, 4.9, 9.6, tipG);
  // cánh cao, dải đèn mép cánh
  bx(plane, 29, 0.4, 3.8, 0, 3.55, -2.0, wingM); bx(plane, 29, 0.1, 0.6, 0, 3.77, -3.4, hull); bx(plane, 0.5, 0.3, 0.5, -14.5, 3.55, -2, tipR); bx(plane, 0.5, 0.3, 0.5, 14.5, 3.55, -2, tipG);
  for (const x of [-5.6, 5.6]) { // nacelle động cơ + ống xả + bầu càng chính + cánh quạt 4 lá
    bx(plane, 1.3, 1.3, 4.6, x, 2.7, -3.2, hull); bx(plane, 1.0, 1.0, 0.8, x, 2.7, -5.7, metal); bx(plane, 0.5, 0.5, 0.5, x, 2.7, -6.2, mb(0x3a3d42));
    bx(plane, 1.0, 1.0, 3.2, x, 2.1, -0.4, hull);
    const p = new THREE.Group(); p.position.set(x, 2.7, -6.55); bx(p, 0.16, 3.4, 0.08, 0, 0, 0, dark); bx(p, 3.4, 0.16, 0.08, 0, 0, 0, dark); plane.add(p); props.push(p);
  }
  bx(plane, 0.5, 0.5, 14.5, -1.65, 0.25, -1.5, dark); bx(plane, 0.5, 0.5, 14.5, 1.65, 0.25, -1.5, dark);                 // băng ghế
  bx(plane, 0.08, 1.3, 14.5, -1.88, 1.15, -1.5, strap); bx(plane, 0.08, 1.3, 14.5, 1.88, 1.15, -1.5, strap);             // dây đai tựa lưng
  bx(plane, 0.25, 0.06, 12, 0, 2.98, -1.5, mb(0x602020)); bx(plane, 0.35, 0.2, 0.35, 0, 2.95, 6.2, lampMat);              // đèn trần + đèn báo nhảy
  ramp.position.set(0, 0.02, 7); bx(ramp, 3.6, 3.4, 0.16, 0, 1.7, 0, dark); plane.add(ramp);
  plane.rotation.y = PLANE_YAW; root.add(plane);
}

let tabCv: HTMLCanvasElement, tabTex: THREE.Texture[] = [], tabState = -1;
/** Màn hình tablet của đội trưởng: bản đồ số xanh → báo đỏ nhấp nháy "SAT-LINK COMPROMISED". */
function drawTab(st: number) {
  const x = tabCv.getContext("2d")!, bad = st > 0, hot = st === 1;
  x.fillStyle = bad ? (hot ? "#3a0707" : "#1a0404") : "#062a30"; x.fillRect(0, 0, 256, 180);
  x.strokeStyle = bad ? "#8a2020" : "#1fa8b8"; x.lineWidth = 1; for (let k = 0; k <= 256; k += 32) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 180); x.stroke(); } for (let k = 0; k <= 180; k += 30) { x.beginPath(); x.moveTo(0, k); x.lineTo(256, k); x.stroke(); }
  x.fillStyle = bad ? "#ff4a4a" : "#6ff"; x.beginPath(); x.arc(150, 92, 7, 0, 6.3); x.fill(); x.font = "bold 20px monospace"; x.textAlign = "center";
  x.fillText(bad ? "⚠ SAT-LINK" : "SAT-LINK OK", 128, bad ? 34 : 24); if (bad) { x.fillText("COMPROMISED", 128, 160); }
  for (const t of tabTex) t.needsUpdate = true;
}
let tablet: THREE.Mesh, led: THREE.Mesh;   // máy tính bảng bản đồ số của đội trưởng · đèn LED bộ phát tín hiệu của kẻ nội gián
/** Khuôn mặt hoạt hình phủ lên mặt voxel: mắt (lòng trắng + con ngươi đảo), mí chớp/nheo, lông mày nhướn/cau, miệng mở theo lời thoại; kèm tai nghe, mic, bộ đàm trước ngực có đèn LED. */
interface Face { w: THREE.Mesh[]; pu: THREE.Mesh[]; lid: THREE.Mesh[]; br: THREE.Mesh[]; mouth: THREE.Mesh; ledM: THREE.MeshBasicMaterial }
interface FaceOpt { blink: number; squint: number; gaze: number; brow: number; lift: number; mouth: number }
const fm = new Map<number, THREE.MeshStandardMaterial>();
const fmat = (c: number) => { let m = fm.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 }); fm.set(c, m); } return m; };
function buildFace(g: THREE.Group, skin: number, hair: number): Face {
  const P = PX, zf = 4 * P + 0.004, put = (w: number, h: number, c: number, x: number, y: number, z: number, parent: THREE.Object3D = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * P, h * P, 0.006), fmat(c)); m.position.set(x * P, y * P, z); parent.add(m); return m; };
  const F: Face = { w: [], pu: [], lid: [], br: [], mouth: null as any, ledM: new THREE.MeshBasicMaterial({ color: 0x20ff60 }) };
  for (const sx of [-1, 1]) {
    F.w.push(put(2.3, 1.5, 0xf4f4f0, sx * 2, 27.5, zf)); F.pu.push(put(1.1, 1.2, 0x1b1410, sx * 2, 27.5, zf + 0.003));
    F.lid.push(put(2.5, 1.7, skin, sx * 2, 27.5, zf + 0.006)); F.br.push(put(2.9, 0.65, hair, sx * 2.3, 28.75, zf + 0.004));
  }
  F.mouth = put(1, 1, 0x4a1414, 0, 25.5, zf + 0.002); F.mouth.visible = false;
  const dk = 0x1c1f22, box = (w: number, h: number, d: number, c: number | THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * P, h * P, d * P), typeof c === "number" ? fmat(c) : c); m.position.set(x * P, y * P, z * P); g.add(m); return m; };
  box(1.2, 2.6, 2.2, dk, 4.9, 27.5, 0.2); box(0.5, 0.5, 0.5, F.ledM, 5.6, 28.4, 0.2);              // tai nghe + đèn tai
  box(0.5, 0.5, 4.4, dk, 4.5, 25.9, 2.3); box(1.5, 1.1, 1.1, dk, 3.2, 25.4, 4.4);                  // mic gập sát má tới gần miệng
  box(2.4, 3.4, 1.3, 0x23282b, -3, 21, 2.7); box(0.45, 6, 0.45, dk, -3.4, 25.5, 2.5); box(0.7, 0.7, 0.4, F.ledM, -2.6, 22.3, 3.5);   // bộ đàm trước ngực + ăng-ten + LED
  return F;
}
function faceUpdate(F: Face, o: FaceOpt, g: number) {
  const P = PX, cover = Math.min(1, Math.max(o.blink, o.squint));
  for (let k = 0; k < 2; k++) {
    const sx = k ? 1 : -1, lid = F.lid[k], pu = F.pu[k];
    lid.visible = cover > 0.02; lid.scale.y = Math.max(cover, 0.001); lid.position.y = (27.5 + 0.85 - cover * 0.85) * P;
    pu.position.x = (sx * 2 + o.gaze * 0.6) * P; pu.visible = cover < 0.97;
    const br = F.br[k]; br.position.y = (28.75 + o.lift) * P; br.rotation.z = sx * o.brow * 0.5;
  }
  const m = o.mouth; F.mouth.visible = m > 0.05; F.mouth.scale.set(2 + 1.6 * m, 0.5 + 2.6 * m, 1); F.mouth.position.y = (25.5 - 0.9 * m) * P;
  const glitch = VO.glitch > 0 && Math.random() > 0.45, talk = m > 0.15 && VO.speaker >= 0;
  F.ledM.color.setHex(glitch ? 0xff2020 : talk ? 0x7ff4ff : Math.sin(S.clock * 3 + g) > 0.6 ? 0x20ff60 : 0x0a3014);
}
/** Biểu cảm theo từng phân cảnh / từng người. */
function faceOf(i: number, b: number, t: number, c: number, ct: number, mode: string): FaceOpt {
  const talk = VO.speaker === i ? 0.2 + 0.8 * Math.abs(Math.sin(c * 11 + i)) * (0.55 + 0.45 * Math.sin(c * 4.3 + 1)) : 0;
  const bl = (c + i * 1.13) % (2.6 + (i % 3) * 0.7) < 0.13 ? 1 : 0;
  const o: FaceOpt = { blink: bl, squint: 0, gaze: Math.sin(c * 0.8 + i * 2.1) * 0.6, brow: 0.15, lift: 0, mouth: talk };
  if (b === 0) { o.brow = 0.3; o.squint = 0.15; o.gaze = Math.sin(c * 0.9 + i * 2.1) > 0.3 ? 0.9 : -0.9 * (i % 2 ? 1 : -1);
    if (i === 6) { o.brow = 0.45; o.gaze = t > 5.6 && t < 7 ? -1 : 0.6; o.squint = 0.25; }
    if (i === 2) { o.brow = t > 7.9 ? 0.75 : 0.3; o.squint = t > 7.9 ? 0.3 : 0.15; o.gaze = t > 7.9 ? 0 : o.gaze; }
    if (i === 1) { o.brow = 0.2; o.gaze = 0; } }
  else if (b === 1) { o.brow = 0.35; o.squint = 0.1; if (i === 1) { o.brow = 0.6; o.lift = 0.1; } }
  else if (b === 2) { o.squint = 0.45; o.brow = -0.2; o.mouth = Math.max(talk, 0.35 + 0.5 * Math.abs(Math.sin(c * 7 + i * 1.7))); if (i === 2 && ct > 22) { o.squint = 0; o.brow = -0.7; o.lift = 0.5; o.mouth = 1; o.gaze = Math.sin(c * 9); } }
  else if (b === 3) { o.squint = 0.3; o.brow = -0.15;
    if (i === 0) { const k = smooth(3.8, 6.5, t); o.blink = Math.max(bl, k); o.squint = 0; o.brow = lerp(-0.45, 0, k); o.mouth = t < 2.4 ? 0.55 : 0.18 * k; o.gaze = t < 2.4 ? Math.sin(c * 12) * 0.5 : 0; } }
  else if (i === 0) { o.blink = 1; o.mouth = 0.22; o.brow = 0; }
  else o.brow = 0;
  return o;
}

interface Rig { face: Face; rig: THREE.Group; s: ReturnType<typeof buildSoldier>; chute: THREE.Group; gun: GunRig }
const rigs: Rig[] = [];
/** Dù cánh (ram-air) như ảnh minh họa: tán cong hình cánh gồm nhiều ô xanh olive có gân tối màu, miệng hút gió phía trước, dây xoè hình quạt dồn về đai yên, túi dù phụ nhỏ treo giữa. */
const makeChute = (_c: number) => {
  const g = new THREE.Group(), cell = mt(0xa3b08a, 0.9), cell2 = mt(0x91a077, 0.9), rib = mt(0x4c5a3a, 0.95), mouth = mb(0x1a1f14), bag = mt(0xd2ccb4, 0.95);
  const C = 9, R = 5.4, SP = 0.84, CH = 2.9;
  for (let k = 0; k < C; k++) {
    const u = (k + 0.5) / C * 2 - 1, th = u * 0.78, x = R * Math.sin(th), y = R * (Math.cos(th) - 1) + 0.3;
    const c = bx(g, SP - 0.05, 0.42, CH, x, y, 0, k % 2 ? cell2 : cell); c.rotation.z = -th;
    const m = bx(g, SP - 0.16, 0.16, 0.06, x, y - 0.02, -CH / 2 - 0.02, mouth); m.rotation.z = -th;                       // miệng hút gió phía trước
  }
  const pts: number[] = [], hx = 0.28;
  for (let k = 0; k <= C; k++) {
    const u = k / C * 2 - 1, th = u * 0.78, x = R * Math.sin(th), y = R * (Math.cos(th) - 1) + 0.3;
    if (k > 0 && k < C) { const r = bx(g, 0.07, 0.5, CH, x, y, 0, rib); r.rotation.z = -th; }
    for (const z of [-CH / 2 + 0.2, 0, CH / 2 - 0.2]) pts.push(x, y - 0.22, z, Math.sign(x) * hx, -2.3, z * 0.12);               // dây xoè hình quạt xuống đai yên
  }
  pts.push(-hx, -2.3, 0, -hx, -3.1, 0, hx, -2.3, 0, hx, -3.1, 0);                                                           // dây đai vai
  const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xe6e6dc })));
  bx(g, 0.5, 0.42, 0.5, 0, -0.9, 0.5, bag); bx(g, 0.04, 1.0, 0.04, 0, -0.2, 0.5, rib);                                      // túi dù phụ treo giữa các dây
  return g;
};
function buildRigs() {
  if (rigs.length) return;
  for (let i = 0; i < N; i++) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const s = buildSoldier(defOf(SQUAD[i]), m, COLORS[i]), gun = attachGun(s.g, GUN_IDS[i]);
    const rig = new THREE.Group(), chute = makeChute(COLORS[i]); chute.visible = false; rig.add(s.g, chute); root.add(rig);
    rigs.push({ rig, s, chute, gun, face: buildFace(s.g, defOf(SQUAD[i]).skin, defOf(SQUAD[i]).hair) });
  }
  tabCv = document.createElement("canvas"); tabCv.width = 256; tabCv.height = 180; drawTab(0);
  const t1 = new THREE.CanvasTexture(tabCv), t2 = t1.clone(); t2.wrapS = THREE.RepeatWrapping; t2.repeat.x = -1; t2.needsUpdate = true; tabTex = [t1, t2];
  const edge = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.6 });
  tablet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.3), [edge, edge, new THREE.MeshBasicMaterial({ map: t1 }), new THREE.MeshBasicMaterial({ map: t2 }), edge, edge]); tablet.position.set(0, 0.95, 0.5); tablet.rotation.x = -0.6; rigs[1].rig.add(tablet);
  led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.03), mb(0xff2020)); led.position.set(0.1, 1.12, 0.14); rigs[6].s.g.add(led);
}
/* mây bão, sao, mưa */
const cloudMat = new THREE.MeshStandardMaterial({ color: 0x2a3558, roughness: 1, flatShading: true });
const clouds = new THREE.Group();
{ let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 90; c++) { const cl = new THREE.Group(); cl.position.set(-330 + rnd() * 560, 60 + rnd() * 640, -200 + rnd() * 400);
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
let ovFade: HTMLElement | null, ovFlash: HTMLElement | null, ovBlur: HTMLElement | null, ovLidT: HTMLElement | null, ovLidB: HTMLElement | null, ovAlt: HTMLElement | null, ovAltV: HTMLElement | null, ovVig: HTMLElement | null, ovRays: HTMLElement | null;
let ovStatic: HTMLElement | null;
let LZ = 0, fired = new Set<number>();   // LZ: vị trí dọc khoang của camera (để đặt đèn đỏ bên cạnh khuôn mặt)
const V = new THREE.Vector3(), P0 = new THREE.Vector3(), T0 = new THREE.Vector3(), P1 = new THREE.Vector3(), T1 = new THREE.Vector3(), CEN = new THREE.Vector3();

/** Mỗi lính rơi xuống một điểm NGẪU NHIÊN khác nhau trên đảo: trong đất liền, không đè lên nhà/đá/bụi/cây, cách nhau ít nhất ~10m. */
function pickLandings() {
  const pts: { x: number; z: number; a: number }[] = [];
  for (let i = 0; i < N; i++) {
    let p: { x: number; z: number; a: number } | null = null;
    for (let tries = 0; tries < 600 && !p; tries++) {
      const x = (Math.random() * 2 - 1) * 56, z = (Math.random() * 2 - 1) * 56, minD = Math.max(8, 20 - tries * 0.03), ix = Math.floor(x), iz = Math.floor(z);
      if (!walkable(x, z) || !reachable(x, z) || H(ix, iz) < 3 || H(ix, iz) > 24 || slopeAt(ix, iz) > 1) continue;   // đồng cỏ/đồi thoải, nối được tới lửa trại
      if (reserved.some(([rx, rz, rr]) => Math.hypot(rx - x, rz - z) < rr + 1.5)) continue;
      if (WALLS.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + 1.4 && Math.abs(z - cz) < d / 2 + 1.4)) continue;
      if (pts.some((q) => Math.hypot(q.x - x, q.z - z) < minD)) continue;
      p = { x, z, a: Math.random() * Math.PI * 2 };
    }
    pts.push(p ?? LAND[i]);   // hiếm: không tìm được chỗ -> dùng điểm mặc định
  }
  LAND.splice(0, LAND.length, ...pts);
}
export function cineBegin() {
  pickLandings();
  buildRigs();
  GL = LAND.map((l) => groundAt(l.x, l.z));
  const u = (sky.material as THREE.ShaderMaterial).uniforms, fog = scene.fog as THREE.FogExp2;
  env = { hemiI: hemi.intensity, hemiC: hemi.color.getHex(), sunI: sun.intensity, sunC: sun.color.getHex(), fogC: fog.color.getHex(), fogD: fog.density, top: u.top.value.getHex(), mid: u.mid.value.getHex(), hor: u.hor.value.getHex(), bg: (scene.background as THREE.Color).getHex(), torchI: torch.intensity, orb: sunOrb.visible, fov: camera.fov, far: camera.far };
  ovFade = document.getElementById("cineFade"); ovFlash = document.getElementById("cineFlash"); ovBlur = document.getElementById("cineBlur"); ovLidT = document.getElementById("cineLidT"); ovLidB = document.getElementById("cineLidB");
  ovAlt = document.getElementById("cineAlt"); ovAltV = document.getElementById("cineAltV"); ovVig = document.getElementById("cineVig"); ovRays = document.getElementById("cineRays"); fired = new Set(); cineSfx.ambStart(); voicePreload(); ovStatic = document.getElementById("cineStatic");
  S.beat = 0; S.t = 0; S.clock = 0; S.cut = 0; camera.far = 1500; camera.updateProjectionMatrix();
  scene.add(root); CINE.active = true;
}
export function cineBeat(b: number) { S.beat = b; S.t = 0; fired = new Set(); voiceStop(); if (b === 1 || b === 2 || b === 3) S.cut = 1; }
export function cineEnd() {
  if (!CINE.active) return;
  CINE.active = false; scene.remove(root); cineLight.intensity = 0; cineSfx.ambStop(); voiceStop();
  const u = (sky.material as THREE.ShaderMaterial).uniforms, fog = scene.fog as THREE.FogExp2;
  hemi.intensity = env.hemiI; hemi.color.setHex(env.hemiC); sun.intensity = env.sunI; sun.color.setHex(env.sunC); fog.color.setHex(env.fogC); fog.density = env.fogD;
  u.top.value.setHex(env.top); u.mid.value.setHex(env.mid); u.hor.value.setHex(env.hor); (scene.background as THREE.Color).setHex(env.bg); torch.intensity = env.torchI;
  sunOrb.visible = env.orb; sky.position.set(0, 0, 0); camera.fov = env.fov; camera.far = env.far; camera.rotation.set(0, 0, 0); camera.updateProjectionMatrix();
  for (const o of [ovFade, ovFlash, ovAlt, ovVig, ovRays]) if (o) o.style.opacity = "0";
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
      const tum = i === 2 ? smooth(22, 22.6, ct) : 0;   // người bị sóng xung kích của tia sét hất văng: xoay tít mất kiểm soát
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.set(Math.sin(c * 6 + i) * 0.12 + tum * (ct - 22) * 4.5, Math.PI / 2, tum * (ct - 22) * 3.2);
      g.rotation.x = Math.PI / 2; g.position.set(0, 0, -0.9); r.gun.pivot.visible = false;
      r.s.armL.rotation.set(-0.3, 0, -1.3 + w); r.s.armR.rotation.set(-0.3, 0, 1.3 - w); r.s.legL.rotation.set(0.3, 0, -0.35); r.s.legR.rotation.set(0.3, 0, 0.35); break;
    }
    case "chute": { // treo dưới dù, gió bão làm lắc mạnh
      const A = 0.06 + 0.42 * storm(ct), o = st.open;
      r.rig.position.set(st.wx, st.wy + 3.55, st.wz); r.rig.rotation.set(Math.sin(ct * 1.5 + i) * A * 0.6, i + ct * 0.25, Math.sin(ct * 1.9 + i * 2.1) * A);
      g.position.y = -3.55; r.chute.visible = true; r.chute.scale.set(0.2 + 0.8 * o, 0.1 + 0.9 * o, 0.2 + 0.8 * o); r.gun.pivot.visible = false;
      r.s.armL.rotation.set(-2.9, 0, 0.15); r.s.armR.rotation.set(-2.9, 0, -0.15);
      r.s.legL.rotation.x = Math.sin(c * 2 + i) * 0.15; r.s.legR.rotation.x = -Math.sin(c * 2 + i) * 0.15;
      if (i === 0 && S.beat >= 4) { // người bị ngất: buông thõng, tụt qua tán lá — dù mắc lại trên ngọn cây
        r.s.armL.rotation.set(0.15, 0, 0.2); r.s.armR.rotation.set(0.15, 0, -0.2); r.s.legL.rotation.x = 0.25; r.s.legR.rotation.x = -0.1; g.rotation.x = 0.4;
        const top = GL[0] + 7.5; if (r.rig.position.y < top) r.chute.position.y = top - r.rig.position.y; r.chute.scale.set(0.9, 0.55, 0.9);
      }
      break;
    }
    case "landed": { // chạm đất, ngã nằm ngửa; dù xẹp xuống bên cạnh. rise > 0: ngồi/đứng dậy
      const L = st.land * (1 - rise), e = smooth(0, 1, st.land);
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.y = LAND[i].a + Math.PI + 0.6 * Math.sin(i * 2.7);
      g.rotation.x = (-Math.PI / 2) * L; g.position.set(0, 0.13 * L, 0.9 * L); armsLow(r, lerp(-0.95, 0.12, L));
      r.chute.visible = true; r.chute.position.set(lerp(0, 3.0, e), lerp(3.55, 0.05, e), lerp(0, 0.8, e)); r.chute.scale.set(1 + 0.1 * e, lerp(1, 0.09, e), 1 + 0.1 * e); r.chute.rotation.y = i;
      if (i === 0 && S.beat >= 4) { r.chute.position.set(0, 7.5, 0.8); r.chute.scale.set(0.9, 0.55, 0.9); r.chute.rotation.y = 0.4; }   // chiếc dù trắng vắt vẻo trên ngọn cây như dấu hiệu chỉ điểm
      break;
    }
  }
  // diễn xuất trong khoang (phân cảnh 1): kẻ nội gián (id 6, người nhảy cuối) liếc ngang rồi bấm bộ phát tín hiệu; người bên cạnh (id 2) liếc sang thì tay vội rụt về
  const inCab = S.beat === 0, tt = S.t;
  tablet.visible = inCab; led.visible = inCab && tt > 8.0 && Math.sin(c * 14) > -0.2;
  if (i === 1 && inCab) { const ts = tt < 0.6 ? 0 : 1 + (Math.floor(c * 2.5) % 2); if (ts !== tabState) { tabState = ts; drawTab(ts); } }
  faceUpdate(r.face, faceOf(i, S.beat, tt, c, ct, st.mode), i);
  if (inCab && i === 6) {
    const p = smooth(6.9, 7.5, tt) * (1 - smooth(8.4, 9.0, tt)); r.s.armR.rotation.set(lerp(-0.95, -1.15, p), 0, lerp(-0.3, -0.55, p));
    g.rotation.y = -0.55 * smooth(5.6, 6.1, tt) * (1 - smooth(6.6, 7.0, tt));
  }
  if (inCab && i === 2) g.rotation.y = 0.55 * smooth(7.9, 8.3, tt) * (1 - smooth(9.0, 9.5, tt));
}

/* ───────────── camera từng cảnh ───────────── */
const look = (p: THREE.Vector3, t: THREE.Vector3, shake = 0) => {
  camera.position.copy(p); if (shake) camera.position.add(V.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
  camera.lookAt(t); if (shake) camera.rotateZ((Math.random() - 0.5) * shake * 0.03);
};
const setFov = (f: number) => { if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); } };
const Wv = (ct: number, lx: number, ly: number, lz: number, v: THREE.Vector3) => { const w = toWorld(ct, lx, ly, lz); return v.set(w.x, w.y, w.z); };
/** Chớp sét theo từng phân cảnh (giây trong phân cảnh). */
const flashAt: Record<number, number[]> = { 1: [2.2, 4.9, 8.4], 2: [0.8, 1.05, 3.7, 5.0, 8.2, 8.5, 11.9, 12.1, 14.6], 3: [0.3] };
/** Âm thanh theo mốc thời gian trong từng phân cảnh. */
const EV: { t: number; f: () => void }[][] = [
  [...Array.from({ length: 11 }, (_, k) => ({ t: 1.5 + k, f: () => cineSfx.heart() })), { t: 8.0, f: () => cineSfx.beep() }, { t: 0.5, f: () => say("v1") }, { t: 8.8, f: () => say("v2") }],      // tim đập trầm đục · bíp ở 0:08
  [{ t: 0.8, f: () => say("v3") }],
  [...[0.8, 3.7, 5.0, 8.2, 14.6].map((t) => ({ t: t + 0.15, f: () => cineSfx.thunder(false) })), { t: 12.0, f: () => cineSfx.thunder(true) }, { t: 2.0, f: () => say("v4a") }, { t: 5.2, f: () => say("v4b") }, { t: 8.0, f: () => say("v4c") }, { t: 4.6, f: () => cineSfx.static(0.5, 0.6) }, { t: 7.5, f: () => cineSfx.static(0.5, 0.6) }],
  [...[0.2, 0.7, 1.2, 1.7, 2.2].map((t) => ({ t, f: () => cineSfx.alarm() })), { t: 2.4, f: () => cineSfx.chute() }, { t: 0.0, f: () => say("v5") }],            // cảnh báo độ cao · dù bung "BOOM"
  [{ t: 2.35, f: () => cineSfx.crack() }, { t: 2.5, f: () => cineSfx.crack() }, { t: 2.9, f: () => cineSfx.thud() },
    ...[4.2, 5.3, 6.9, 8.4].map((t) => ({ t, f: () => cineSfx.drip() })), ...[5.0, 7.2, 9.0].map((t) => ({ t, f: () => cineSfx.cricket() })), { t: 10.0, f: () => cineSfx.beep(0.6) }, { t: 6.4, f: () => say("v6") }],   // rừng đêm · bíp ở 0:58
];

function camera3d(b: number, t: number, ct: number, win: { x: number; y: number; z: number }[]) {
  CEN.set(0, 0, 0); for (const w of win) CEN.add(V.set(w.x, w.y, w.z)); CEN.multiplyScalar(1 / N);
  const c = S.clock;
  if (b === 0) { // PHÂN CẢNH 1 · trong khoang
    const sh = 0.008 + 0.006 * Math.sin(c * 3);
    if (t < 2.6) { setFov(40); LZ = lerp(0.5, -0.3, t / 2.6); Wv(ct, -0.2, 1.45, LZ, P0); Wv(ct, 1.55, 1.38, -1.1, T0); look(P0, T0, sh); }                                       // đội trưởng nói qua bộ đàm
    else if (t < 5.6) { setFov(46); LZ = lerp(3.2, -5.4, smooth(2.6, 5.4, t)); Wv(ct, 0.1, 1.45, LZ, P0); Wv(ct, -1.55, 1.3, LZ - 0.25, T0); look(P0, T0, sh); }    // tracking ngang qua từng gương mặt
    else if (t < 7.6) { setFov(28); LZ = -4.8; Wv(ct, -0.7, 1.45, -4.5, P0); Wv(ct, -1.55, 1.42, -4.8, T0); look(P0, T0, sh * 0.5); }                         // cận cực đại: đôi mắt liếc ngang
    else if (t < 9.0) { setFov(30); LZ = -4.8; Wv(ct, -0.8, 0.95, -4.3, P0); Wv(ct, -1.5, 0.9, -4.75, T0); look(P0, T0, sh * 0.5); }                         // cận cực đại: tay bấm nút
    else { setFov(34); const k = smooth(9, 12, t); LZ = -2.3; Wv(ct, lerp(-0.2, -0.7, k), 1.5, lerp(-1.2, -1.7, k), P0); Wv(ct, -1.55, 1.42, -2.3, T0); look(P0, T0, sh * 0.6); }   // lính số 2 gằn giọng, mắt trừng trừng
    return;
  }
  if (b === 1) { // PHÂN CẢNH 2 · góc thấp từ sàn nhìn ngược lên bóng người ngược sáng ở cửa, rồi lao theo người nhảy cuối
    const w6 = win[6], kF = smooth(5.8, 7.6, t); LZ = 1.0;
    Wv(ct, 0.3, 0.28, 1.0, P1); Wv(ct, 0, 1.7, 8.0, T1); P0.set(w6.x + 4.5, w6.y + 1.6, w6.z + 2.2); T0.set(w6.x, w6.y + 0.9, w6.z);
    setFov(lerp(62, 58, kF)); look(P1.lerp(P0, kF), T1.lerp(T0, kF), 0.02); return;
  }
  if (b === 2) { // PHÂN CẢNH 3 · toàn cảnh đội hình bị xé lẻ → POV xoay 360° → áp sát người bị sét hất văng
    const sh = 0.05 + 0.15 * storm(ct);
    if (t < 5) { setFov(58); const a = -2.2 + 0.08 * t; P0.set(CEN.x + Math.cos(a) * 70, CEN.y + 10 + Math.sin(t) * 4, CEN.z + Math.sin(a) * 70); look(P0, CEN, sh); }
    else if (t < 11) {
      const w0 = win[0], a = (t - 5) * 4.2, p = -0.6 + 0.35 * Math.sin(t * 3.1), cp = Math.cos(p); setFov(lerp(75, 85, smooth(5, 8, t)));
      P0.set(w0.x, w0.y + 0.8, w0.z); T0.set(P0.x + Math.cos(a) * cp * 10, P0.y + Math.sin(p) * 10, P0.z + Math.sin(a) * cp * 10);
      look(P0, T0, 0.35); camera.rotateZ((t - 5) * 2.6);
    } else { setFov(64); const w2 = win[2]; P0.set(w2.x - 8, w2.y + 2, w2.z + 7); T0.set(w2.x, w2.y, w2.z); look(P0, T0, 0.3 + 0.5 * smooth(11.7, 12.1, t) * (1 - smooth(12.1, 13.5, t))); }
    return;
  }
  if (b === 3) { // PHÂN CẢNH 4 · POV người chơi: nhìn xuống đồng hồ cảnh báo → giật ngược lên theo lực dù bung → mờ dần, đầu gục, tối sầm
    const w0 = win[0], kUp = smooth(2.4, 2.75, t), droop = smooth(3.6, 7, t);
    P0.set(w0.x, w0.y + 1.6, w0.z); setFov(lerp(lerp(70, 86, smooth(0, 2.4, t)), 58, kUp));
    T0.set(P0.x + 1, P0.y - 8, P0.z + 2); T1.set(P0.x + 0.4, P0.y + 6, P0.z + 0.3); T0.lerp(T1, kUp); T0.y -= droop * 2;
    look(P0, T0, t < 2.4 ? 0.12 : 0.5 * Math.exp(-(t - 2.4) * 3) + 0.01); camera.rotateZ(droop * 0.5 * Math.sin(t * 0.6 + 1)); return;
  }
  // PHÂN CẢNH 5 · máy tĩnh sát mặt bùn khi nhân vật rơi xuống → crane xuyên tán rừng, vút lên nhìn toàn cảnh hòn đảo cô lập
  const L0 = LAND[0], aC = L0.a + 0.6, cx0 = L0.x + Math.cos(aC) * 3.2, cz0 = L0.z + Math.sin(aC) * 3.2, w0 = win[0];
  setFov(t < 5.2 ? 58 : 60);
  if (t < 5.2) { P0.set(cx0, GL[0] + 0.28, cz0); T0.set(L0.x, Math.max(GL[0] + 0.5, w0.y + 1.0), L0.z); look(P0, T0, 0); return; }
  const k = smooth(5.2, 11.3, t), ang = aC + 0.9 * k;
  look(P0.set(lerp(cx0, Math.cos(ang) * 122, k), lerp(GL[0] + 0.28, 96, k), lerp(cz0, Math.sin(ang) * 122, k)), T0.set(lerp(L0.x, 0, k), lerp(GL[0] + 0.4, CAMP_Y + 6, k), lerp(L0.z, 0, k)), 0);
}

/* ───────────── cập nhật mỗi frame ───────────── */
export function cineUpdate(dt: number) {
  if (!CINE.active) return;
  const b = Math.max(0, S.beat);
  S.clock += dt; S.cut = Math.max(0, S.cut - dt * 2.2); S.t = Math.min(S.t + dt, BEAT_MIN[b] - 0.001);   // hết thời lượng phân cảnh thì giữ nguyên khung cuối
  const t = S.t, ct = b === 0 ? -12 + t : b === 1 ? t : b === 2 ? 10 + t : b === 3 ? 26 + t : 36 + t;
  const win: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < N; i++) { poseSoldier(i, ct, 0); const w = stateOf(i, ct, GL[i]); win.push({ x: w.wx, y: w.wy, z: w.wz }); }
  const pa = planeAt(Math.min(ct, 60));
  plane.visible = b <= 3; plane.position.set(pa.x, pa.y, pa.z); ramp.rotation.x = (b <= 0 ? 0 : b === 1 ? smooth(0.2, 1.6, t) : 1) * (Math.PI / 2);
  for (const p of props) p.rotation.z += dt * 40;
  const green = ct >= 0, blink = Math.max(0, Math.sin(S.clock * 4.5)) ** 2;
  if (green) lampMat.color.setHex(0x20ff40); else lampMat.color.setHex(mixHex(0x401010, 0xff2a2a, blink));
  tipR.color.setHex(Math.sin(S.clock * 6) > 0 ? 0xff2020 : 0x300808); tipG.color.setHex(Math.sin(S.clock * 6 + 2) > 0 ? 0x20ff40 : 0x083010);
  { const w = toWorld(ct, -0.5, 2.2, LZ + 1.1); cineLight.position.set(w.x, w.y, w.z); cineLight.color.setHex(green ? 0x35ff70 : 0xff2a1a);   // đèn đỏ báo động hắt nửa khuôn mặt · đèn xanh khi cửa mở
    cineLight.intensity = b === 0 || (b === 1 && t < 7) ? (green ? 4.5 : 7 * (0.3 + 0.7 * blink)) : 0; }

  // ánh sáng + bầu trời + bão
  let L = NIGHT, rainK = 0, fade = 0, lid = 0, blur = 0, flash = 0, vig = 0;
  if (b === 0) L = INTERIOR;
  else if (b === 1) L = mixLook(INTERIOR, NIGHT, smooth(6.2, 8, t));
  else if (b === 2) { L = mixLook(NIGHT, STORM, smooth(0, 3, t)); rainK = smooth(1, 4, t); }
  else if (b === 3) { L = mixLook(STORM, GREY, smooth(0, 3, t)); rainK = 1 - smooth(0, 2.5, t); blur = 14 * smooth(3.0, 7.0, t); vig = smooth(3.4, 7.2, t); fade = smooth(7.3, 8.5, t); }
  else { L = mixLook(FOREST_LOW, FOREST_HIGH, smooth(5, 11.3, t)); fade = Math.max(1 - smooth(1.9, 2.4, t), smooth(11.3, 12, t)); }
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

  // lớp phủ DOM: chớp sét, tối dần, nhoè + vignette (ngất), đồng hồ độ cao, tia nắng xuyên lá
  if (ovFade) ovFade.style.opacity = String(Math.max(fade, S.cut));
  if (ovFlash) ovFlash.style.opacity = String(0.6 * flash);
  if (ovLidT && ovLidB) { ovLidT.style.height = ovLidB.style.height = lid * 50 + "%"; }
  if (ovBlur) { const f = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : "none"; ovBlur.style.backdropFilter = f; (ovBlur.style as any).webkitBackdropFilter = f; }
  if (ovVig) ovVig.style.opacity = String(vig);
  if (ovAlt) { const on = b === 3 && t < 2.45; ovAlt.style.opacity = on ? String(0.6 + 0.4 * Math.sin(S.clock * 14)) : "0"; if (on && ovAltV) ovAltV.textContent = String(Math.max(0, Math.round(win[0].y - GL[0]))); }
  if (ovStatic) ovStatic.style.opacity = String(VO.glitch ? 0.12 + 0.3 * Math.random() : 0);
  if (ovRays) ovRays.style.opacity = String(b === 4 ? 0.55 * smooth(2.6, 4, t) * (1 - smooth(5.4, 8, t)) : 0);

  // nền âm thanh: động cơ ù ù (muffled) → gió rít khi ramp mở → bão → ù đặc như chìm dưới nước → rừng tĩnh lặng
  if (b === 0) cineSfx.ambSet(0.26, 170, 0, 1500);
  else if (b === 1) cineSfx.ambSet(0.3, 260, 0.5 * smooth(0.2, 1.6, t), 1800);
  else if (b === 2) cineSfx.ambSet(0.45, 130, 0.4 + 0.3 * flash, 1400);
  else if (b === 3) { if (t < 2.4) cineSfx.ambSet(0.35, 130, 0.35, 1500); else cineSfx.ambSet(0.14 * (1 - smooth(2.6, 7.2, t)), 80, 0, 1500); }
  else cineSfx.ambSet(0.04 * smooth(2.5, 4, t), 90, 0.02 * smooth(2.5, 4, t), 3200);
  const ev = EV[b] ?? []; for (let e = 0; e < ev.length; e++) if (!fired.has(e) && t >= ev[e].t) { fired.add(e); if (t - ev[e].t < 0.7) ev[e].f(); }
}
