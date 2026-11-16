import * as THREE from "three";
import { scene, camera, sun, hemi, sky, sunOrb, torch } from "./scene";
import { buildSoldier, defOf, PX, shade } from "./soldier";
import { attachGun, type GunRig } from "./guns";
import { curlArm } from "./gunpose";
import { COLORS, SQUAD, type GunId } from "../config";
import { CINE, VO } from "./cineState";
import { reserved, WALLS } from "./map";
import { groundAt, walkable, H, slopeAt, CAMP_Y } from "./island";
import { reachable } from "./nav";
import { cineSfx } from "../audio";
import { say, voicePreload, voiceStop } from "../voice";
import { N, EXT, DEP_ORDER, T_DEP, PLANE_YAW, SEAT, planeAt, toWorld, RANK, LAND, stateOf, smooth, lerp, storm } from "./cinePath";
import { CALLSIGNS } from "../story";

/**
 * Cảnh mở đầu 3D voxel — 5 phân cảnh khớp kịch bản 60 giây (CUTSCENE trong story.ts):
 *  0 (0:00) khoang máy bay: master shot toàn cảnh → cận cảnh biểu cảm từng người (giận, nghi, sợ, buồn, lạnh lùng, cười gượng…) → kẻ nội gián bấm bộ phát tín hiệu · 1 đèn xanh, ramp mở, lần lượt nhảy · 2 (0:22) rơi tự do vào tâm bão, sét, bộ đàm nhiễu ·
 *  3 (0:38) đồng hồ độ cao báo đỏ, dù tự bung, đập đầu, ngất · 4 (0:48) màn đen, rơi xuyên tán rừng xuống bùn, camera vút lên thấy cả đảo và những chiếc dù rải rác.
 * Mỗi beat là hàm thuần của (beat, t) nên bấm bỏ qua / nhảy beat vẫn đúng trạng thái. Quỹ đạo nằm ở cinePath.ts.
 */
/**
 * Phân cảnh 0 (khoang máy bay) — LỊCH CÚ MÁY. Muốn đổi nhịp phim chỉ cần sửa mấy số này (giây tính từ đầu phân cảnh):
 *  master shot (cuối khoang nhìn lên) → mỗi người một cú cận cảnh theo thứ tự SHOT → lùi ra toàn cảnh, ai cũng quay sang nhìn nhau.
 *  id 1 Bravo = TỨC GIẬN · 3 Delta = LẠNH LÙNG nhếch mép · 4 Echo = SỢ HÃI · 5 Foxtrot = BUỒN · 0 Bạn = VÔ CẢM đáng ngờ · 6 Golf = cười gượng, kẻ bấm bộ phát · 2 Charlie = hoang tưởng, gằn giọng.
 */
const CAB = 32;
const SHOT: { id: number; a: number; e: number }[] = [
  { id: 1, a: 3.8, e: 6.8 }, { id: 3, a: 6.8, e: 9.4 }, { id: 4, a: 9.4, e: 12.0 }, { id: 5, a: 12.0, e: 14.6 },
  { id: 0, a: 14.6, e: 17.9 }, { id: 6, a: 17.9, e: 23.9 }, { id: 2, a: 23.9, e: 29.7 },
];
const MASTER2 = 29.7;                                              // từ giây này: lùi ra toàn cảnh lần hai
const shotAt = (t: number) => SHOT.find((s) => t >= s.a && t < s.e);
const SA = (id: number) => SHOT.find((s) => s.id === id)!.a;       // giây bắt đầu cú cận cảnh của người id
/** Mọi điểm cắt cảnh (cả cắt trong cùng một người) — mỗi lần cắt có tiếng "bụp" + nhoè chuyển động. */
const SUBCUTS = [SA(6) + 1.7, SA(6) + 3.2, SA(6) + 5.0, SA(4) + 1.5, SA(5) + 0.9, SA(0) + 1.4, SA(0) + 2.6, SA(2) + 1.5, SA(2) + 4.2];
const CUTS = [0, ...SHOT.map((s) => s.a), ...SUBCUTS, MASTER2].sort((x, y) => x - y);
/** Đèn "key" bám theo máy quay ở từng cú cận cảnh: [màu, cường độ] — đỏ gắt cho giận dữ, lạnh xanh cho nghi kỵ, xanh bệnh cho sợ hãi, cam ấm cho nỗi buồn… */
const KEY: Record<number, [number, number]> = { 1: [0xff3a22, 3.2], 3: [0x8fd8ee, 2.6], 4: [0xd0f0d8, 2.8], 5: [0xffbe84, 2.6], 0: [0x9ab4ff, 2.4], 6: [0x5af0b4, 3.0], 2: [0xff7a3a, 3.2] };
const WFLASH = [2.6, 8.9, 13.4, 19.7, 26.1, 30.6];   // thời điểm sét xa loé qua cửa sổ
export const BEAT_MIN = [CAB, 10, 16, 10 + EXT, 12];   // thời lượng hình ảnh mỗi phân cảnh (giây) — tổng 60 + EXT giây (phân cảnh 4 dài thêm để thấy rõ cú rơi)
const GUN_IDS: GunId[] = ["rifle", "pistol", "rifle", "pistol", "rifle", "sniper", "pistol"];

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
const PANE_DARK = 0x0b1424, PANE_FLASH = 0x7ba0d4, paneMat = mb(PANE_DARK);   // kính cửa sổ phía trong khoang: tối, chớp sáng theo sét xa
const GHOST_Z = 0, GHOST_Y = 1.5;
let ghost: THREE.Mesh, ghostMat: THREE.MeshBasicMaterial;                     // bóng phản chiếu mờ của một gương mặt trên kính (cú "người vô cảm nhìn ra cửa sổ")
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
  for (let z = -7.6; z <= 5; z += 1.9) {   // cửa sổ thân: ô ngoài + khung và ô kính phía trong khoang (ngang tầm mắt người ngồi)
    bx(plane, 0.08, 0.5, 0.7, -2.07, 1.5, z, win); bx(plane, 0.08, 0.5, 0.7, 2.07, 1.5, z, win);
    for (const sx of [-1, 1]) { bx(plane, 0.03, 0.62, 0.82, sx * 1.83, 1.5, z, dark); bx(plane, 0.02, 0.5, 0.7, sx * 1.815, 1.5, z, paneMat); }
  }
  { // bóng phản chiếu trên kính cửa sổ bên phải (đối diện ghế người chơi, ngang z = 0)
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 80; const x = cv.getContext("2d")!; x.filter = "blur(1.6px)";
    const gr = x.createRadialGradient(32, 34, 4, 32, 36, 30); gr.addColorStop(0, "rgba(150,185,225,.9)"); gr.addColorStop(1, "rgba(60,90,130,0)"); x.fillStyle = gr; x.beginPath(); x.ellipse(32, 36, 19, 26, 0, 0, 6.3); x.fill();
    x.fillStyle = "rgba(255,255,255,.95)"; x.fillRect(20, 31, 9, 3); x.fillRect(36, 31, 9, 3); x.fillStyle = "rgba(10,20,40,.7)"; x.fillRect(25, 47, 15, 2); x.fillStyle = "rgba(100,140,190,.7)"; x.beginPath(); x.ellipse(32, 78, 26, 16, 0, 0, 6.3); x.fill();
    const tex = new THREE.CanvasTexture(cv); ghostMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false });
    ghost = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), ghostMat); ghost.position.set(1.8, GHOST_Y, GHOST_Z); ghost.rotation.y = -Math.PI / 2; ghost.visible = false; plane.add(ghost);
  }
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
/**
 * Khuôn mặt hoạt hình phủ lên mặt voxel (đơn vị "px" = 1 điểm ảnh voxel của đầu):
 *  mắt (lòng trắng + con ngươi đảo/co giãn), mí chớp/nheo, lông mày xoay/nhướn từng bên, MIỆNG nhiều đoạn (cười · mếu · nhếch mép · há · nghiến răng),
 *  giọt mồ hôi, nước mắt, gân xanh ở cơ hàm, cơ hàm bạnh ra; kèm tai nghe, mic, bộ đàm trước ngực có đèn LED.
 */
interface Face {
  w: THREE.Mesh[]; pu: THREE.Mesh[]; lid: THREE.Mesh[]; br: THREE.Mesh[]; ledM: THREE.MeshBasicMaterial;
  mi: THREE.Mesh[]; mt: THREE.Mesh[]; sw: THREE.Mesh[]; tear: THREE.Mesh; wet: THREE.Mesh[]; vein: THREE.Group[]; jaw: THREE.Mesh[];
}
/**
 * Tham số biểu cảm (mọi thứ mặc định 0 / trung tính):
 *  blink·squint = mí khép (chớp / nheo) · gaze·gazeY = hướng nhìn ngang / dọc (-1..1) · brow = góc lông mày (+ giận: đầu mày cụp xuống, − buồn/sợ: đầu mày xếch lên) · lift = nâng/hạ cả hai mày ·
 *  asym = nhướn một bên mày (+) · wide = trợn mắt · pupil = co/giãn đồng tử (1 = bình thường) · mouth = độ mấp máy khi nói ·
 *  curve = độ cong khoé miệng (+ cười, − mếu) · skew = nhếch lệch một bên · gap = độ há miệng (px) · mw = nửa bề rộng miệng (px) · teeth = lộ răng ·
 *  sweat = mồ hôi · tear = nước mắt · vein = gân xanh · jaw = cơ hàm bạnh.
 */
interface FaceOpt { blink: number; squint: number; gaze: number; gazeY: number; brow: number; lift: number; asym: number; wide: number; pupil: number; mouth: number; curve: number; skew: number; gap: number; mw: number; teeth: number; sweat: number; tear: number; vein: number; jaw: number }
const fm = new Map<number, THREE.MeshStandardMaterial>();
const fmat = (c: number) => { let m = fm.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 }); fm.set(c, m); } return m; };
const MOUTH_LIP = new THREE.MeshStandardMaterial({ color: 0x6a2a28, roughness: 1 }), MOUTH_IN = new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 1 }), TEETH_A = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.8 }), TEETH_B = new THREE.MeshStandardMaterial({ color: 0xd9d3c4, roughness: 0.8 });
const ZF = 4 * PX + 0.004, MCOL = [-3, -2, -1, 0, 1, 2, 3], DEF_OPT: FaceOpt = { blink: 0, squint: 0, gaze: 0, gazeY: 0, brow: 0.15, lift: 0, asym: 0, wide: 0, pupil: 1, mouth: 0, curve: 0, skew: 0, gap: 0, mw: 2, teeth: 0, sweat: 0, tear: 0, vein: 0, jaw: 0 };
function buildFace(g: THREE.Group, skin: number, hair: number): Face {
  const P = PX, zf = ZF, wetM = new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.55, depthWrite: false }), dropM = new THREE.MeshBasicMaterial({ color: 0xbfe4ff });
  const put = (w: number, h: number, c: number | THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * P, h * P, 0.006), typeof c === "number" ? fmat(c) : c); m.position.set(x * P, y * P, z); parent.add(m); return m; };
  const F = { w: [], pu: [], lid: [], br: [], mouth: null as any, ledM: new THREE.MeshBasicMaterial({ color: 0x20ff60 }), mi: [], mt: [], sw: [], tear: null as any, wet: [], vein: [], jaw: [] } as Face;
  for (const sx of [-1, 1]) {
    F.w.push(put(2.3, 1.5, 0xf4f4f0, sx * 2, 27.5, zf)); F.pu.push(put(1.1, 1.2, 0x1b1410, sx * 2, 27.5, zf + 0.003));
    F.lid.push(put(2.5, 1.7, skin, sx * 2, 27.5, zf + 0.006)); F.br.push(put(2.9, 0.65, hair, sx * 2.3, 28.75, zf + 0.004));
    F.wet.push(put(2.3, 0.35, wetM, sx * 2, 26.55, zf + 0.007)); F.wet[F.wet.length - 1].visible = false;
    // gân xanh ở góc hàm + cơ hàm bạnh
    const vg = new THREE.Group(); vg.position.set(sx * 3.3 * P, 25.9 * P, zf + 0.004); const vc = 0x5486a6;
    put(0.45, 2.3, vc, 0, 0, 0, vg); put(1.0, 0.4, vc, -sx * 0.5, 0.9, 0, vg); put(0.9, 0.4, vc, -sx * 0.45, -0.7, 0, vg); vg.visible = false; g.add(vg); F.vein.push(vg);
    const jw = put(1.3, 2.3, shade(skin, 0.74), sx * 3.1, 25.2, zf + 0.002); jw.visible = false; F.jaw.push(jw);
  }
  // miệng = 7 cột dọc rộng 1px: mỗi cột cao theo độ há, đặt theo đường cong (cười/mếu/nhếch); cột trong = môi/khoang miệng, cột trên = răng
  for (const x of MCOL) { F.mi.push(put(1, 1, MOUTH_LIP, x, 25.5, zf + 0.002)); F.mt.push(put(1, 1, x & 1 ? TEETH_A : TEETH_B, x, 25.5, zf + 0.0035)); F.mt[F.mt.length - 1].visible = false; }
  for (const [x, y] of [[-3.75, 28.7], [3.75, 28.9], [3.7, 27.4]]) { const m = put(0.6, 1, dropM, x, y, zf + 0.004); m.visible = false; F.sw.push(m); }
  F.tear = put(0.6, 1, dropM, -2, 26.5, zf + 0.008); F.tear.visible = false;
  const dk = 0x1c1f22, box = (w: number, h: number, d: number, c: number | THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * P, h * P, d * P), typeof c === "number" ? fmat(c) : c); m.position.set(x * P, y * P, z * P); g.add(m); return m; };
  box(1.2, 2.6, 2.2, dk, 4.9, 27.5, 0.2); box(0.5, 0.5, 0.5, F.ledM, 5.6, 28.4, 0.2);              // tai nghe + đèn tai
  box(0.5, 0.5, 4.4, dk, 4.5, 25.9, 2.3); box(1.5, 1.1, 1.1, dk, 3.2, 25.4, 4.4);                  // mic gập sát má tới gần miệng
  box(2.4, 3.4, 1.3, 0x23282b, -3, 21, 2.7); box(0.45, 6, 0.45, dk, -3.4, 25.5, 2.5); box(0.7, 0.7, 0.4, F.ledM, -2.6, 22.3, 3.5);   // bộ đàm trước ngực + ăng-ten + LED
  return F;
}
function faceUpdate(F: Face, o: FaceOpt, g: number) {
  const P = PX, cover = Math.min(1, Math.max(o.blink, o.squint)), ck = S.clock;
  for (let k = 0; k < 2; k++) {
    const sx = k ? 1 : -1, lid = F.lid[k], pu = F.pu[k], w = F.w[k];
    w.scale.set(1 + 0.12 * o.wide, 1 + 0.5 * o.wide, 1); w.position.y = (27.5 + 0.12 * o.wide) * P;
    lid.visible = cover > 0.02; lid.scale.y = Math.max(cover, 0.001); lid.position.y = (27.5 + 0.85 - cover * 0.85) * P;
    pu.position.x = (sx * 2 + o.gaze * 0.6) * P; pu.position.y = (27.5 + 0.12 * o.wide + o.gazeY * 0.3) * P; pu.scale.set(o.pupil, o.pupil * (1 + 0.25 * o.wide), 1); pu.visible = cover < 0.97;
    const br = F.br[k]; br.position.y = (28.75 + o.lift + 0.25 * o.wide + (sx > 0 ? o.asym : -o.asym * 0.6) * 0.5) * P; br.rotation.z = sx * o.brow * 0.5 + (sx > 0 ? -o.asym * 0.1 : 0);
    F.vein[k].visible = o.vein > 0.05; F.vein[k].scale.set(1, (0.6 + 0.5 * o.vein) * (1 + 0.15 * Math.sin(ck * 9 + g + k)), 1);
    F.jaw[k].visible = o.jaw > 0.05; F.jaw[k].scale.set(1, 0.5 + 0.7 * o.jaw, 1);
    F.wet[k].visible = o.tear > 0.1; F.wet[k].scale.x = k ? 0.7 : 1;
  }
  // miệng: 7 cột theo đường cong curve/skew; há → khoang miệng tối + hàng răng trên
  const talk = o.mouth > 0.05 ? 0.5 + 2.6 * o.mouth : 0, gap = Math.max(o.gap, talk), mw = Math.max(o.mw, talk ? 2 + 1.6 * o.mouth : 0), open = gap > 0.45, thick = open ? gap : 0.42, base = 25.5 - (talk ? 0.5 * Math.min(talk, 1.2) : 0);
  const tOn = open && (o.teeth > 0.5 || (talk > 0 && gap > 1.3));
  F.mi.forEach((m, k) => {
    const x = MCOL[k], on = Math.abs(x) <= mw + 0.5, yc = base + o.curve * 1.6 * (x / 3) ** 2 + o.skew * (x / 3), t = F.mt[k];
    m.visible = on; t.visible = on && tOn; if (!on) return;
    m.material = open ? MOUTH_IN : MOUTH_LIP; m.scale.y = thick; m.position.y = yc * P;
    if (tOn) { t.scale.y = gap * 0.62; t.position.y = (yc + gap / 2 - gap * 0.34) * P; }
  });
  // mồ hôi lăn xuống thái dương, nước mắt lăn trên má
  F.sw.forEach((m, k) => { const on = o.sweat > 0.12 + 0.28 * k; m.visible = on; if (!on) return; const ph = (ck * 0.55 + k * 0.37 + g * 0.13) % 1, y0 = [28.7, 28.9, 27.4][k]; m.position.y = (y0 - ph * 3.0) * P; m.scale.y = 0.9 + 0.5 * ph; });
  F.tear.visible = o.tear > 0.45; if (F.tear.visible) { const ph = (ck * 0.5) % 1; F.tear.position.y = (26.5 - ph * 2.4) * P; F.tear.scale.y = 0.8 + 0.8 * ph; }
  const glitch = VO.glitch > 0 && Math.random() > 0.45, spk = talk > 0 && VO.speaker >= 0;
  F.ledM.color.setHex(glitch ? 0xff2020 : spk ? 0x7ff4ff : Math.sin(ck * 3 + g) > 0.6 ? 0x20ff60 : 0x0a3014);
}
/** Biểu cảm theo từng phân cảnh / từng người. */
function faceOf(i: number, b: number, t: number, c: number, ct: number, mode: string): FaceOpt {
  const talk = VO.speaker === i ? 0.2 + 0.8 * Math.abs(Math.sin(c * 11 + i)) * (0.55 + 0.45 * Math.sin(c * 4.3 + 1)) : 0;
  const bl = (c + i * 1.13) % (2.6 + (i % 3) * 0.7) < 0.13 ? 1 : 0;
  const o: FaceOpt = { ...DEF_OPT, blink: bl, gaze: Math.sin(c * 0.8 + i * 2.1) * 0.6, mouth: talk };
  if (b === 0) cabinFace(o, i, t, c);
  else if (b === 1) { o.brow = 0.35; o.squint = 0.1; if (i === 1) { o.brow = 0.6; o.lift = 0.1; } }
  else if (b === 2) { o.squint = 0.45; o.brow = -0.2; o.mouth = Math.max(talk, 0.35 + 0.5 * Math.abs(Math.sin(c * 7 + i * 1.7))); if (i === 2 && ct > 22) { o.squint = 0; o.brow = -0.7; o.lift = 0.5; o.mouth = 1; o.gaze = Math.sin(c * 9); } }
  else if (b === 3) { o.squint = 0.3; o.brow = -0.15; const u = t - EXT;   // u = giây tính từ lúc đồng hồ độ cao báo đỏ
    if (i === 0) { const k = smooth(3.8, 6.5, u); o.blink = Math.max(bl, k); o.squint = 0; o.brow = lerp(-0.45, 0, k); o.mouth = u < 2.4 ? 0.55 : 0.18 * k; o.gaze = u < 2.4 ? Math.sin(c * 12) * 0.5 : 0; } }
  else if (i === 0) { o.blink = 1; o.mouth = 0.22; o.brow = 0; }
  else o.brow = 0;
  return o;
}

/* ───────────── PHÂN CẢNH 0 · diễn xuất khuôn mặt từng người (hàm thuần của t) ───────────── */
/** Biểu cảm "lộ ra" dần ngay trước khi máy quay vào mặt (k = 0.3 là trạng thái căng thẳng ngầm lúc toàn cảnh → 1 ở đỉnh biểu cảm). */
const exprK = (i: number, t: number) => 0.3 + 0.7 * smooth(SA(i) - 0.7, SA(i) + 0.6, t);
function cabinFace(o: FaceOpt, i: number, t: number, c: number) {
  const a = SA(i), r = t - a, k = exprK(i, t);
  switch (i) {
    case 1: // BRAVO (đội trưởng) · TỨC GIẬN, căm phẫn: nghiến răng, cơ hàm bạnh gân xanh, mắt tóe lửa nhìn thẳng như muốn ăn tươi nuốt sống kẻ phản bội
      o.brow = 0.35 + 0.65 * k; o.lift = -0.4 * k; o.squint = 0.32 * k; o.pupil = 1 - 0.3 * k; o.gaze = 0; o.gazeY = -0.15 * k; o.blink = 0;
      o.curve = -0.6 * k; o.gap = 0.9 * k; o.mw = 2 + 1.1 * k; o.teeth = k > 0.7 ? 1 : 0; o.vein = k; o.jaw = k * (0.65 + 0.35 * Math.sin(c * 9)); break;
    case 3: // DELTA · NGHI HOẶC / LẠNH LÙNG: liếc ngang qua khe ghế, nhếch nửa miệng thách thức, một bên mày nhướn nhưng cơ mặt căng cứng
      o.asym = 1.1 * k; o.brow = 0.12; o.squint = 0.3 * k; o.pupil = 1 - 0.1 * k; o.gaze = lerp(0.2, -1, smooth(a - 0.4, a + 0.8, t)); o.blink = (c % 3.6) < 0.16 ? 1 : 0;
      o.skew = 1.15 * k + 0.2 * Math.sin(c * 5) * smooth(a + 1.2, a + 1.8, t); o.curve = 0.3 * k; o.mw = 2 + 0.6 * k; o.jaw = 0.35 * k; break;
    case 4: { // ECHO · LO LẮNG / SỢ HÃI: mồ hôi túa, mắt trợn đảo liên tục, thở dốc há miệng, tay bấu chặt mép ghế
      const sl = Math.floor(c * 3.6 + i * 5); o.wide = 0.9 * k; o.pupil = 1 - 0.38 * k; o.brow = -0.5 * k; o.lift = 0.35 * k; o.blink = 0; o.gaze = ((sl * 0.618034) % 1) * 2 - 1; o.gazeY = (((sl * 0.382) % 1) - 0.5) * 0.8;
      o.gap = k * (0.8 + 0.55 * (0.5 + 0.5 * Math.sin(c * 7))); o.curve = -0.25 * k; o.mw = 1.7; o.sweat = k; break; }
    case 5: // FOXTROT · BUỒN BÃ: mày cụp xuống, mắt nhìn xuống ráo hoảnh, môi mếu run run, nước mắt lăn trên má
      o.brow = -0.9 * k; o.lift = -0.05 * k; o.squint = 0.25 * k; o.gazeY = -k; o.gaze = Math.sin(c * 0.6) * 0.3; o.curve = -k * (1 + 0.12 * Math.sin(c * 11)); o.mw = 1.9; o.tear = smooth(a + 0.3, a + 1.1, t); o.blink = (c % 3.1) < 0.2 ? 1 : 0; break;
    case 0: // BẠN · BÌNH TĨNH ĐÁNG NGỜ / VÔ CẢM: mặt phẳng lặng như tờ, ít chớp, ánh mắt thẫn thờ nhìn ra ô cửa sổ nhỏ — rồi trượt theo bóng phản chiếu
      o.brow = 0.05; o.squint = 0.1; o.pupil = 0.95; o.blink = (c % 4.3) < 0.15 ? 1 : 0; o.curve = -0.04; o.mw = 2;
      o.gaze = lerp(0, 0.95, smooth(a + 1.5, a + 2.7, t)) - 0.7 * smooth(a + 3.0, a + 3.3, t); break;
    case 6: { // GOLF (kẻ bấm bộ phát) · CƯỜI GƯỢNG toe toét rồi vụt tắt, mắt liếc quét quanh, mồ hôi lạnh, sau cùng nhếch mép hài lòng
      const gr = smooth(a - 0.4, a + 0.25, t) * (1 - smooth(a + 1.6, a + 1.85, t)), sm = smooth(a + 4.9, a + 5.4, t);
      o.curve = 0.95 * gr + 0.3 * sm; o.skew = 0.9 * sm; o.gap = 0.85 * gr; o.teeth = gr > 0.5 ? 1 : 0; o.mw = lerp(2, 3.3, gr); o.wide = 0.25 * gr; o.lift = 0.25 * gr; o.sweat = 0.5 * smooth(a + 1.6, a + 2.3, t) * (1 - sm);
      o.gaze = r > 1.7 && r < 4.6 ? Math.sin(r * 3.2) * 0.95 : 0; o.blink = gr > 0.3 ? 0 : o.blink; o.squint = 0.12 * sm; o.brow = 0.2; break; }
    case 2: { // CHARLIE · HOANG TƯỞNG / HUNG HĂNG: mắt đảo giật, gằn giọng "Nhìn cái gì? Mày hả? Hay là mày?" rồi trừng trừng nhìn thẳng
      const tw = r < 1.9 ? Math.floor(c * 5.5) : 0, who = r < 1.9 ? ((tw * 0.754877) % 1) * 2 - 1 : r < 3.0 ? -0.9 : r < 3.9 ? 0.9 : 0;
      o.brow = 0.35 + 0.6 * k; o.lift = -0.25 * k; o.squint = 0.25 * k; o.pupil = 1 - 0.2 * k; o.gaze = who; o.blink = 0;
      o.curve = -0.7 * k; o.gap = 0.6 * k; o.mw = 2.4; o.teeth = k > 0.6 ? 1 : 0; o.vein = 0.6 * k; o.jaw = 0.5 * k; break; }
  }
}

interface Pack { lidG: THREE.Group; body: THREE.Mesh }
interface Fx { g: THREE.Group; pilot: THREE.Group; bridle: THREE.Mesh; ring: THREE.Mesh; puffs: THREE.Mesh[]; drops: THREE.Mesh[]; puffM: THREE.MeshBasicMaterial; dropM: THREE.MeshBasicMaterial; ringM: THREE.MeshBasicMaterial }
interface Rig { face: Face; rig: THREE.Group; s: ReturnType<typeof buildSoldier>; chute: THREE.Group; gun: GunRig; pack: Pack; fx: Fx }
let knuckM: THREE.MeshStandardMaterial, photo: THREE.Group, photoTex: THREE.CanvasTexture;   // bàn tay bấu ghế trắng bệch (Echo) · tấm ảnh gia đình Foxtrot cầm trên tay
const rigs: Rig[] = [];
/** Dù cánh (ram-air) như ảnh minh họa: tán cong hình cánh gồm nhiều ô xanh olive có gân tối màu, miệng hút gió phía trước, dây xoè hình quạt dồn về đai yên, túi dù phụ nhỏ treo giữa. */
/** Dù phóng to CK lần cho dễ thấy logo; HANG = khoảng cách từ tán dù xuống người treo. */
const CK = 1.5, HANG = 3.55 * CK;
const makeChute = (_c: number) => {
  const g = new THREE.Group(), cell = mt(0xa3b08a, 0.9), cell2 = mt(0x91a077, 0.9), rib = mt(0x4c5a3a, 0.95), mouth = mb(0x1a1f14), bag = mt(0xd2ccb4, 0.95);
  const C = 9, R = 5.4, SP = 0.84, CH = 2.9;
  for (let k = 0; k < C; k++) {
    const u = (k + 0.5) / C * 2 - 1, th = u * 0.78, x = R * Math.sin(th), y = R * (Math.cos(th) - 1) + 0.3;
    const c = bx(g, SP - 0.05, 0.42, CH, x, y, 0, k % 2 ? cell2 : cell); c.rotation.z = -th;
    const m = bx(g, SP - 0.16, 0.16, 0.06, x, y - 0.02, -CH / 2 - 0.02, mouth); m.rotation.z = -th;                       // miệng hút gió phía trước
  }
  /* Logo "Z" voxel (nền vàng, chữ Z đen) in trên nóc dù, đọc đúng chiều khi nhìn từ trên xuống (đầu chữ hướng về phía miệng hút gió). */
  const ZM = ["111111111", "111111111", "000001110", "000011100", "000111000", "001110000", "011100000", "111111111", "111111111"], GN = 11, VS = 0.26;
  const yellow = new THREE.InstancedMesh(new THREE.BoxGeometry(VS, 0.05, VS), mb(0xffd21a), GN * GN), black = new THREE.InstancedMesh(new THREE.BoxGeometry(VS, 0.09, VS), mb(0x0b0b0b), 81);
  const dm = new THREE.Object3D(); let ny = 0, nk = 0;
  for (let r = 0; r < GN; r++) for (let q = 0; q < GN; q++) {
    const x = (q - (GN - 1) / 2) * VS, th = Math.asin(x / R), yb = R * (Math.cos(th) - 1) + 0.3 + 0.21;   // bám theo đường cong của tán dù
    dm.rotation.set(0, 0, -th); dm.position.set(x, yb + 0.025, (r - (GN - 1) / 2) * VS); dm.updateMatrix(); yellow.setMatrixAt(ny++, dm.matrix);
    if (r >= 1 && r <= 9 && q >= 1 && q <= 9 && ZM[r - 1][q - 1] === "1") { dm.position.set(x, yb + 0.07, (r - (GN - 1) / 2) * VS); dm.updateMatrix(); black.setMatrixAt(nk++, dm.matrix); }
  }
  black.count = nk; g.add(yellow, black);
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
/** Ba lô dù sau lưng (mọi lính): thân ba lô + nắp bật mở được + dây đeo vai/ngực. Nắp bật ra, ba lô xẹp xuống khi dù bung. */
function buildPack(s: THREE.Group): Pack {
  const olive = mt(0x58613c, 0.92, 0.05), dark = mt(0x1f2418, 0.95, 0.05), tan = mt(0x8a7d52, 0.9, 0.05);
  const g = new THREE.Group(); g.position.set(0, 1.02, -0.25); s.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.58, 0.2), olive); g.add(body);
  const lidG = new THREE.Group(); lidG.position.set(0, 0.3, -0.1); g.add(lidG);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.22), tan); lid.position.set(0, 0, 0.11); lidG.add(lid);
  bx(g, 0.38, 0.5, 0.05, 0, 0, 0.125, dark); bx(g, 0.5, 0.05, 0.22, 0, -0.08, 0, dark);   // tấm lưng + dây thắt ngang ba lô
  for (const sx of [-1, 1]) { bx(s, 0.07, 0.035, 0.36, sx * 0.13, 1.355, -0.04, dark); bx(s, 0.07, 0.52, 0.03, sx * 0.13, 1.08, 0.125, dark); }   // dây đeo vai + dây trước ngực
  bx(s, 0.34, 0.03, 0.03, 0, 1.15, 0.14, dark);
  return { lidG, body };
}
/** Hiệu ứng dù bung: dù phụ (kéo dù chính ra), dây nối, vòng khí, khói/bụi bung ra từ ba lô, nước mưa văng khỏi tán dù. Tất cả là hàm thuần của ou (giây kể từ lúc bung). */
const FXR = (() => { let sd = 11; return () => ((sd = (sd * 16807) % 2147483647) / 2147483647); })();
const PUFF = Array.from({ length: 16 }, () => { const a = FXR() * 6.283, e = FXR() * 1.2 - 0.3; return { dx: Math.cos(a) * Math.cos(e), dy: Math.sin(e) + 0.4, dz: Math.sin(a) * Math.cos(e), k: 0.5 + 0.5 * FXR(), s: 0.35 + 0.35 * FXR() }; });
const DROP = Array.from({ length: 26 }, () => ({ x: (FXR() * 2 - 1) * 5.5, z: (FXR() * 2 - 1) * 2, vx: 0, vy: 1 + FXR() * 3.5, vz: (FXR() * 2 - 1) * 2, d: FXR() * 0.25 }));
for (const d of DROP) d.vx = d.x * (0.5 + FXR() * 0.6);
function buildFx(): Fx {
  const g = new THREE.Group(); g.visible = false;
  const white = new THREE.MeshBasicMaterial({ color: 0xece6d2, fog: false }), puffM = new THREE.MeshBasicMaterial({ color: 0xd9dde0, transparent: true, depthWrite: false, fog: false });
  const dropM = new THREE.MeshBasicMaterial({ color: 0xcfe3ff, transparent: true, depthWrite: false, fog: false }), ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const pilot = new THREE.Group(); for (const [w, h, y] of [[0.62, 0.06, 0], [0.42, 0.06, 0.06], [0.2, 0.06, 0.12]] as number[][]) bx(pilot, w, h, w, 0, y, 0, white); g.add(pilot);
  const bridle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.025), white); g.add(bridle);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), ringM); ring.rotation.x = -Math.PI / 2; g.add(ring);
  const puffs = PUFF.map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), puffM); g.add(m); return m; });
  const drops = DROP.map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), dropM); g.add(m); return m; });
  return { g, pilot, bridle, ring, puffs, drops, puffM, dropM, ringM };
}
function deployFx(r: Rig, ou: number, b2: number) {
  const F = r.fx, ox = 0, oy = lerp(0.25, 1.02 - HANG, b2), oz = lerp(0.12, -0.25, b2);   // vị trí ba lô trong hệ toạ độ rig
  F.g.visible = ou > 0 && ou < 1.7;
  if (!F.g.visible) return;
  const pl = ou < 0.8, L = 5.4 * (1 - Math.exp(-9 * ou)), py = oy + 0.25 + L;
  F.pilot.visible = F.bridle.visible = pl;
  if (pl) { const s = 1 - smooth(0.5, 0.8, ou); F.pilot.position.set(ox + Math.sin(ou * 30) * 0.05, py, oz); F.pilot.scale.setScalar(s * (0.6 + 0.4 * smooth(0, 0.12, ou)));
    F.bridle.position.set(ox, (oy + 0.25 + py) / 2, oz); F.bridle.scale.y = Math.max(0.01, py - oy - 0.25); }
  F.ring.visible = ou < 0.48; F.ring.position.set(ox, oy, oz); F.ring.scale.setScalar(0.3 + 8 * ou); F.ringM.opacity = 0.6 * (1 - smooth(0, 0.46, ou));
  const pv = ou < 0.75, pf = 1 - smooth(0.15, 0.75, ou); F.puffM.opacity = 0.75 * pf;
  F.puffs.forEach((m, k) => { m.visible = pv; if (!pv) return; const p = PUFF[k], d = 3.4 * (1 - Math.exp(-6 * ou)) * p.k; m.position.set(ox + p.dx * d, oy + p.dy * d, oz + p.dz * d); m.scale.setScalar(p.s * (1 + 3.5 * ou)); m.rotation.set(ou * 3 + k, ou * 2, 0); });
  F.dropM.opacity = 0.9 * (1 - smooth(1.1, 1.6, ou));
  F.drops.forEach((m, k) => { const p = DROP[k], tt = ou - 0.42 - p.d; m.visible = tt > 0 && ou < 1.65; if (!m.visible) return;
    m.position.set(ox + p.x + p.vx * tt, 0.2 + p.vy * tt - 4.9 * tt * tt, oz + p.z * 0.6 + p.vz * tt); m.rotation.z = Math.atan2(p.vx, p.vy - 9.8 * tt) * 0.5; });
}
function buildRigs() {
  if (rigs.length) return;
  for (let i = 0; i < N; i++) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const s = buildSoldier(defOf(SQUAD[i]), m, COLORS[i]), gun = attachGun(s.g, GUN_IDS[i], false, defOf(SQUAD[i]).pack ? -0.27 : -0.16);
    // Cảnh mở đầu: sau lưng là ba lô dù nên TẤT CẢ súng đeo ở hông (không vắt sau lưng, không cầm tay): súng dài hai bên hông, súng ngắn trong bao, lựu đạn + túi đạn hông trái
    const HIP: Record<string, { p: [number, number, number]; s: number }> = { rifle: { p: [-0.4, 0.8, -0.1], s: 0.85 }, sniper: { p: [0.4, 0.78, -0.1], s: 0.72 } };
    for (const t of ["rifle", "sniper"] as const) { const sl = gun.slung[t]!, h = HIP[t]; sl.position.set(...h.p); sl.scale.setScalar(h.s); sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0.04).normalize()); }
    for (const t of Object.keys(gun.slung) as GunId[]) gun.slung[t]!.visible = true;
    const pack = buildPack(s.g), fx = buildFx();
    const rig = new THREE.Group(), chute = makeChute(COLORS[i]); chute.visible = false; rig.add(s.g, chute, fx.g); root.add(rig);
    rigs.push({ rig, s, chute, gun, pack, fx, face: buildFace(s.g, defOf(SQUAD[i]).skin, defOf(SQUAD[i]).hair) });
  }
  { // Echo (id 4): bàn tay bấu mép ghế — hộp da nhợt đè lên bàn tay, đổi từ màu da sang trắng bệch theo độ siết
    knuckM = new THREE.MeshStandardMaterial({ color: 0xf0c9a2, roughness: 0.9 });
    for (const arm of [rigs[4].s.armL, rigs[4].s.armR]) { const h = new THREE.Mesh(new THREE.BoxGeometry(4.6 * PX, 2.8 * PX, 4.6 * PX), knuckM); h.position.set(0, -1.3 * PX, 0); arm.userData.hand.add(h); }   // lòng bàn tay trắng bệch
    // Foxtrot (id 5): tấm ảnh nhỏ (bố + con gái dưới nắng) pixel-art
    const cv = document.createElement("canvas"); cv.width = 20; cv.height = 14; const x = cv.getContext("2d")!;
    x.fillStyle = "#79b8e8"; x.fillRect(0, 0, 20, 14); x.fillStyle = "#4f9a3c"; x.fillRect(0, 10, 20, 4); x.fillStyle = "#ffd84a"; x.fillRect(15, 1, 3, 3);
    x.fillStyle = "#3a4a6a"; x.fillRect(6, 5, 3, 6); x.fillStyle = "#f0c9a2"; x.fillRect(6, 3, 3, 2); x.fillStyle = "#c0392b"; x.fillRect(11, 7, 2, 4); x.fillStyle = "#f0c9a2"; x.fillRect(11, 5, 2, 2); x.fillStyle = "#5a3a20"; x.fillRect(11, 4, 2, 1);
    photoTex = new THREE.CanvasTexture(cv); photoTex.magFilter = THREE.NearestFilter; photoTex.minFilter = THREE.NearestFilter;
    photo = new THREE.Group(); const fr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.008), new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.8 })); photo.add(fr);
    const im = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.119), new THREE.MeshBasicMaterial({ map: photoTex })); im.position.z = 0.0045; photo.add(im);
    const im2 = im.clone(); im2.position.z = -0.0045; im2.rotation.y = Math.PI; photo.add(im2);   // ảnh in hai mặt: người cầm nhìn thấy, máy quay cũng thấy
    photo.position.set(0, 1.2, 0.72); photo.rotation.x = -0.2; photo.scale.setScalar(1.5); photo.visible = false; rigs[5].s.g.add(photo);
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
let ovStatic: HTMLElement | null, ovTag: HTMLElement | null, tagId = -2;
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
  ovAlt = document.getElementById("cineAlt"); ovAltV = document.getElementById("cineAltV"); ovVig = document.getElementById("cineVig"); ovRays = document.getElementById("cineRays"); fired = new Set(); cineSfx.ambStart(); voicePreload(); ovStatic = document.getElementById("cineStatic"); ovTag = document.getElementById("cineTag"); tagId = -2;
  S.beat = 0; S.t = 0; S.clock = 0; S.cut = 0; camera.far = 1500; camera.updateProjectionMatrix();
  scene.add(root); CINE.active = true;
}
/** Nhảy tới giây t của phân cảnh hiện tại (để xem thử / chỉnh từng cú máy; lời thoại và âm thanh sẽ không phát lại). */
export function cineSeek(t: number) { S.t = Math.max(0, Math.min(t, BEAT_MIN[Math.max(0, S.beat)] - 0.001)); fired = new Set(); for (let e = 0; e < 99; e++) fired.add(e); }
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
function armsLow(r: Rig, th = -0.95) { r.s.armL.rotation.set(th, 0, 0.3); r.s.armR.rotation.set(th, 0, -0.3); r.s.armL.userData.elbow.rotation.x = r.s.armR.userData.elbow.rotation.x = -0.25 + 0.4 * th; r.gun.pivot.rotation.x = th + Math.PI / 2; }
function poseSoldier(i: number, ct: number, rise: number) {
  const r = rigs[i], st = stateOf(i, ct, GL[i]), c = S.clock, g = r.s.g;
  r.rig.rotation.set(0, 0, 0); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); r.s.legL.rotation.set(0, 0, 0); r.s.legR.rotation.set(0, 0, 0);
  r.chute.visible = false; r.chute.position.set(0, 0, 0); r.chute.scale.set(1, 1, 1); r.chute.rotation.set(0, 0, 0); r.gun.pivot.visible = false; r.gun.extra.visible = true;   // không cầm súng: súng đeo hông
  r.s.legL.userData.knee.rotation.x = r.s.legR.userData.knee.rotation.x = 0; curl(r, 0.9, 0.5); r.s.armL.userData.elbow.rotation.x = r.s.armR.userData.elbow.rotation.x = -0.22;   // khớp gối thẳng, cùi chỏ hơi gập, bàn tay buông lỏng
  r.fx.g.visible = false; r.pack.lidG.rotation.x = 0; r.pack.lidG.position.y = 0.3; r.pack.body.scale.y = 1;
  switch (st.mode) {
    case "seat": case "walk": { // ngồi trên ghế → đứng dậy, đi tới ramp xếp hàng
      const sit = 1 - st.stand, sw = Math.sin(c * 7 + i) * (st.walking ? 0.6 : 0.12) * st.stand;
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.y = st.wyaw;
      g.position.y = -0.17 * sit + Math.sin(c * 8 + i * 1.3) * 0.015 * sit;
      r.s.legL.rotation.x = (-Math.PI / 2) * sit + sw; r.s.legR.rotation.x = (-Math.PI / 2) * sit - sw;
      r.s.legL.userData.knee.rotation.x = (Math.PI / 2) * sit + Math.max(0, sw) * 1.2; r.s.legR.userData.knee.rotation.x = (Math.PI / 2) * sit + Math.max(0, -sw) * 1.2;   // ngồi: cẳng chân buông xuống, đi: gối gập
      armsLow(r, -0.5 + Math.sin(c * 2 + i) * 0.02); break;   // tay đặt thả lỏng (không cầm súng)
    }
    case "fall": { // rơi tự do, sấp, dang tay
      const w = Math.sin(c * 9 + i) * 0.1;
      const tum = i === 2 ? smooth(22, 22.6, ct) : 0;   // người bị sóng xung kích của tia sét hất văng: xoay tít mất kiểm soát
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.set(Math.sin(c * 6 + i) * 0.12 + tum * (ct - 22) * 4.5, Math.PI / 2, tum * (ct - 22) * 3.2);
      g.rotation.x = Math.PI / 2; g.position.set(0, 0, -0.9);
      r.s.armL.rotation.set(-0.3, 0, -1.3 + w); r.s.armR.rotation.set(-0.3, 0, 1.3 - w); r.s.legL.rotation.set(0.3, 0, -0.35); r.s.legR.rotation.set(0.3, 0, 0.35); r.s.legL.userData.knee.rotation.x = r.s.legR.userData.knee.rotation.x = 0.35; curl(r, 0.8, 0.7); break;
    }
    case "chute": { // treo dưới dù, gió bão làm lắc mạnh
      const A = 0.06 + 0.42 * storm(ct), ou = st.ou, b1 = smooth(0, 0.5, ou), b2 = smooth(0, 0.6, ou), tau = Math.max(0, ou - 0.4);
      // Trình tự bung dù (ou = giây kể từ lúc bung): 0 nắp ba lô bật, dù phụ vọt lên · 0.1–0.4 dù chính bị kéo ra thành dải dài · 0.4+ phồng bung, nảy qua lại rồi ổn định · người bị giật thẳng lên, chân hất
      const yaw = ct * 0.25 + i, d0 = (((yaw - Math.PI / 2) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;   // quay ngắn nhất từ hướng rơi sang hướng treo
      r.rig.position.set(st.wx, st.wy + HANG * b2, st.wz);
      r.rig.rotation.set(Math.sin(ct * 1.5 + i) * A * 0.6 * b2 + (1 - b2) * Math.sin(c * 6 + i) * 0.12, Math.PI / 2 + d0 * b2, Math.sin(ct * 1.9 + i * 2.1) * A * b2);
      const jolt = Math.exp(-5 * ou) * smooth(0, 0.08, ou);
      g.rotation.x = (Math.PI / 2) * (1 - b2); g.position.set(0, -HANG * b2 - 0.3 * jolt, -0.9 * (1 - b2));
      const sy = lerp(0.25, 1, smooth(0.1, 0.35, ou)), sx = ou < 0.4 ? lerp(0.06, 0.14, smooth(0.1, 0.4, ou)) : 1 - 0.86 * Math.exp(-5 * tau) * Math.cos(11 * tau), sz = ou < 0.4 ? lerp(0.3, 0.5, smooth(0.1, 0.4, ou)) : 1 - 0.5 * Math.exp(-4 * tau) * Math.cos(9 * tau);
      const anc = -HANG * b2 + 1.34 * b2 + 0.4 * (1 - b2), rock = smooth(0.38, 0.5, ou);
      r.chute.visible = ou > 0.08; r.chute.position.set(0, anc + 2.7 * CK * sy, 0); r.chute.scale.set(sx * CK, sy * CK * (1 + 0.04 * Math.sin(ct * 5 + i) * b2), sz * CK);
      r.chute.rotation.set(0.28 * rock * Math.exp(-3 * tau) * Math.sin(8 * tau + 1), 0, 0.22 * rock * Math.exp(-3.5 * tau) * Math.sin(9 * tau));
      r.pack.lidG.rotation.x = -1.5 * smooth(0, 0.1, ou); const pk = 1 - 0.55 * smooth(0.15, 0.5, ou); r.pack.body.scale.y = pk; r.pack.lidG.position.y = 0.3 * pk;
      r.s.armL.rotation.set(lerp(-0.3, -2.9, b1), 0, lerp(-1.3, 0.15, b1)); r.s.armR.rotation.set(lerp(-0.3, -2.9, b1), 0, lerp(1.3, -0.15, b1));
      r.s.legL.rotation.set(lerp(0.3, Math.sin(c * 2 + i) * 0.15, b1) - 0.9 * jolt, 0, lerp(-0.35, 0, b1)); r.s.legR.rotation.set(lerp(0.3, -Math.sin(c * 2 + i) * 0.15, b1) - 0.9 * jolt, 0, lerp(0.35, 0, b1));
      r.s.legL.userData.knee.rotation.x = r.s.legR.userData.knee.rotation.x = 0.25 + 0.2 * Math.sin(c * 2 + i); curl(r, 1.1, 0.8);   // đầu gối hơi co, tay nắm dây dù
      deployFx(r, ou, b2);
      if (i === 0 && S.beat >= 4) { // người bị ngất: buông thõng, tụt qua tán lá — dù mắc lại trên ngọn cây
        r.s.armL.rotation.set(0.15, 0, 0.2); r.s.armR.rotation.set(0.15, 0, -0.2); r.s.legL.rotation.x = 0.25; r.s.legR.rotation.x = -0.1; g.rotation.x = 0.4;
        const top = GL[0] + 7.5; if (r.rig.position.y < top) r.chute.position.y = top - r.rig.position.y; r.chute.scale.set(0.9 * CK, 0.55 * CK, 0.9 * CK);
      }
      break;
    }
    case "landed": { // chạm đất, ngã nằm ngửa; dù xẹp xuống bên cạnh. rise > 0: ngồi/đứng dậy
      const L = st.land * (1 - rise), e = smooth(0, 1, st.land);
      r.pack.lidG.rotation.x = -1.5; r.pack.body.scale.y = 0.45; r.pack.lidG.position.y = 0.3 * 0.45;
      r.rig.position.set(st.wx, st.wy, st.wz); r.rig.rotation.y = LAND[i].a + Math.PI + 0.6 * Math.sin(i * 2.7);
      g.rotation.x = (-Math.PI / 2) * L; g.position.set(0, 0.13 * L, 0.9 * L); armsLow(r, lerp(-0.95, 0.12, L));
      r.chute.visible = true; r.chute.position.set(lerp(0, 3.0 * CK, e), lerp(HANG, 0.05, e), lerp(0, 0.8 * CK, e)); r.chute.scale.set((1 + 0.1 * e) * CK, lerp(1, 0.09, e) * CK, (1 + 0.1 * e) * CK); r.chute.rotation.y = i;
      if (i === 0 && S.beat >= 4) { r.chute.position.set(0, 7.5, 0.8); r.chute.scale.set(0.9 * CK, 0.55 * CK, 0.9 * CK); r.chute.rotation.y = 0.4; }   // chiếc dù trắng vắt vẻo trên ngọn cây như dấu hiệu chỉ điểm
      break;
    }
  }
  // diễn xuất trong khoang (phân cảnh 0): mỗi người một kiểu biểu cảm + dáng ngồi (xem cabinFace / cabinBody); kẻ nội gián (id 6) liếc quanh rồi bấm bộ phát tín hiệu
  const inCab = S.beat === 0, tt = S.t;
  tablet.visible = inCab; led.visible = inCab && tt > SA(6) + 4.3 && Math.sin(c * 14) > -0.2;
  if (i === 5) photo.visible = inCab;
  if (i === 1 && inCab) { const ts = tt < 0.6 ? 0 : 1 + (Math.floor(c * 2.5) % 2); if (ts !== tabState) { tabState = ts; drawTab(ts); } }
  faceUpdate(r.face, faceOf(i, S.beat, tt, c, ct, st.mode), i);
  if (inCab) cabinBody(i, r, tt, c);
}
/** Gập các ngón tay: c = độ nắm (0 duỗi → 1.6 nắm chặt), th = độ co ngón cái. Mỗi ngón gập hai đốt, ngón sau lệch pha nhẹ cho tự nhiên. */
function curl(r: Rig, c: number, th: number) { for (const arm of [r.s.armL, r.s.armR]) curlArm(arm, c, th); }
/** Dáng ngồi / cử động thân của từng người trong khoang. Cúi–nghiêng–quay đều xoay quanh hông (không quanh chân) nên đầu dịch chuyển tự nhiên. */
const HIP = new THREE.Vector3(0, 0.672, 0), HIPR = new THREE.Vector3();
const AVERT = [-0.35, 0.3, 0.35, 0.3, -0.3, -0.3, 0.35];   // hướng né mắt lúc toàn cảnh (rad)
const LOOK = [0.5, -0.6, -0.5, -0.3, 0.6, 0.6, -0.7];   // cuối cảnh: góc quay đầu của từng người sang nhìn nhau (rad)
function cabinBody(i: number, r: Rig, t: number, c: number) {
  const g = r.s.g, a = SA(i), rel = t - a, k = exprK(i, t), fin = smooth(MASTER2 + 0.2, MASTER2 + 1.0, t);
  const idle = 1 - smooth(a - 0.7, a + 0.6, t);   // trước cú cận cảnh của mình: ngồi cứng đờ, cúi mặt/né ánh mắt, không dám nhìn thẳng ai
  let pitch = 0.1 * idle, yaw = fin * LOOK[i] + idle * AVERT[i], roll = 0, bob = 0, grip = 0;
  switch (i) {
    case 1: pitch += 0.1 * k; r.s.armL.rotation.x = r.s.armR.rotation.x = -0.9 - 0.04 * Math.sin(c * 21) * k; r.s.armL.userData.elbow.rotation.x = r.s.armR.userData.elbow.rotation.x = -0.9; break;                     // đội trưởng rướn người, siết máy tính bảng, tay run vì giận
    case 3: pitch += -0.05 * k; yaw += -0.3 * k * (1 - fin); break;                                                                        // Delta ngả lưng, hơi nghiêng đầu liếc sang bên
    case 4: { const br = Math.sin(c * 10); bob = 0.012 * br * k; pitch += 0.035 * br * k; roll = 0.012 * Math.sin(c * 29) * k; grip = k;   // Echo thở dốc, run bần bật, bấu chặt ghế
      r.s.armL.rotation.set(-0.28, 0, 0.02); r.s.armR.rotation.set(-0.28, 0, -0.02); break; }   // hai bàn tay vừa chạm mép băng ghế
    case 5: pitch += 0.12 * k; yaw += 0.1 * Math.sin(c * 0.5) * k;                                                                          // Foxtrot cúi đầu, hai tay nâng tấm ảnh
      r.s.armL.rotation.set(-1.0, 0, 0.45); r.s.armR.rotation.set(-1.0, 0, -0.45); r.s.armL.userData.elbow.rotation.x = r.s.armR.userData.elbow.rotation.x = -1.0; break;
    case 0: break;                                                                                                                         // BẠN: ngồi im như tượng
    case 6: { // Golf: ngoái đầu liếc quanh rồi nhấc tay bấm bộ phát (sau khi tắt nụ cười gượng)
      const p = smooth(a + 3.2, a + 3.7, t) * (1 - smooth(a + 4.7, a + 5.2, t));
      r.s.armR.rotation.set(lerp(-0.95, -1.15, p), 0, lerp(-0.3, -0.55, p)); yaw += -0.55 * smooth(a + 1.9, a + 2.4, t) * (1 - smooth(a + 3.0, a + 3.4, t)); break; }
    case 2: { // Charlie: giật mình quay sang Golf khi nghe tiếng bíp, rồi quay đi quay lại gằn giọng theo từng câu
      yaw += 0.55 * smooth(a + 0.3, a + 0.7, t) * (1 - smooth(a + 1.4, a + 1.8, t)) + 0.6 * smooth(a + 1.9, a + 2.3, t) * (1 - smooth(a + 3.0, a + 3.3, t)) - 0.5 * smooth(a + 3.0, a + 3.3, t) * (1 - smooth(a + 3.9, a + 4.3, t));
      roll = 0.01 * Math.sin(c * 17) * k; break; }
  }
  if (i === 4) curl(r, 0.5 + 0.9 * grip, 0.4 + 0.6 * grip);                // Echo: ngón tay co quắp bấu mép ghế
  if (i === 5) curl(r, 0.9, 0.6);                                           // Foxtrot: ngón tay giữ hai mép ảnh
  if (i === 1) curl(r, 1.0 + 0.3 * Math.sin(c * 21) * k, 0.8);              // Bravo: nắm chặt máy tính bảng, run vì giận
  if (i === 6) { const p = smooth(SA(6) + 3.2, SA(6) + 3.7, t) * (1 - smooth(SA(6) + 4.7, SA(6) + 5.2, t)); curlArm(r.s.armR, 0.9 - 0.7 * p, 0.5); }   // Golf: duỗi ngón trỏ bấm nút
  knuckM.color.setHex(i === 4 ? lerpHex(0xf0c9a2, 0xf6f2ea, grip) : 0xf0c9a2);
  g.rotation.set(pitch, yaw, roll); g.position.y += bob;
  HIPR.copy(HIP).applyEuler(g.rotation); g.position.add(HIP).sub(HIPR);
  void rel;
}
const lerpHex = (a: number, b: number, k: number) => mixHex(a, b, k);

/* ───────────── camera từng cảnh ───────────── */
const look = (p: THREE.Vector3, t: THREE.Vector3, shake = 0) => {
  camera.position.copy(p); if (shake) camera.position.add(V.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
  camera.lookAt(t); if (shake) camera.rotateZ((Math.random() - 0.5) * shake * 0.03);
};
const setFov = (f: number) => { if (Math.abs(camera.fov - f) > 0.05) { camera.fov = f; camera.updateProjectionMatrix(); } };
const Wv = (ct: number, lx: number, ly: number, lz: number, v: THREE.Vector3) => { const w = toWorld(ct, lx, ly, lz); return v.set(w.x, w.y, w.z); };
/** Chớp sét theo từng phân cảnh (giây trong phân cảnh). */
const flashAt: Record<number, number[]> = { 1: [2.2, 4.9, 8.4], 2: [0.8, 1.05, 3.7, 5.0, 8.2, 8.5, 11.9, 12.1, 14.6], 3: [0.3, 2.6, 4.9, 7.4, EXT + 0.3] };
/** Tim đập dồn dần: nhịp thưa lúc toàn cảnh, nhanh hơn ở cuối. */
const HEARTS: number[] = (() => { const o: number[] = []; for (let t = 1.5; t < CAB - 0.5; t += t < 12 ? 1.1 : t < 22 ? 0.9 : 0.7) o.push(t); return o; })();
/** Âm thanh theo mốc thời gian trong từng phân cảnh. */
const EV: { t: number; f: () => void }[][] = [
  [...HEARTS.map((t) => ({ t, f: () => cineSfx.heart() })), ...CUTS.filter((t) => t > 0).map((t) => ({ t, f: () => cineSfx.cut() })),
    ...[0.9, 2.5, SA(4) + 0.2, SA(4) + 1.0, SA(4) + 1.8, SA(4) + 2.4, MASTER2 + 0.6].map((t) => ({ t, f: () => cineSfx.breath() })),                       // thở gấp
    { t: SA(6) + 4.2, f: () => cineSfx.beep() },
    // lời thoại: mỗi người nói đúng trong cú cận cảnh của mình (giờ khớp với VOICE trong story.ts)
    { t: 0.5, f: () => say("v1") }, { t: SA(1) + 0.15, f: () => say("v1b") }, { t: SA(3) + 0.1, f: () => say("v7") }, { t: SA(4) + 0.05, f: () => say("v8") },
    { t: SA(5) + 0.1, f: () => say("v9") }, { t: SA(0) + 0.3, f: () => say("v10") }, { t: SA(6) + 0.25, f: () => say("v11") },
    { t: SA(2) + 0.4, f: () => say("v2") }, { t: SA(2) + 1.9, f: () => say("v2b") }, { t: SA(2) + 3.0, f: () => say("v2c") }, { t: MASTER2 + 0.05, f: () => say("v12") }],      // bíp của bộ phát tín hiệu · lời thoại
  [{ t: 0.8, f: () => say("v3") }],
  [...[0.8, 3.7, 5.0, 8.2, 14.6].map((t) => ({ t: t + 0.15, f: () => cineSfx.thunder(false) })), { t: 12.0, f: () => cineSfx.thunder(true) }, { t: 2.0, f: () => say("v4a") }, { t: 5.2, f: () => say("v4b") }, { t: 8.0, f: () => say("v4c") }, { t: 4.6, f: () => cineSfx.static(0.5, 0.6) }, { t: 7.5, f: () => cineSfx.static(0.5, 0.6) }],
  [...[0.2, 0.7, 1.2, 1.7, 2.2].map((t) => ({ t: t + EXT, f: () => cineSfx.alarm() })), { t: 2.4 + EXT, f: () => cineSfx.chute() }, { t: EXT, f: () => say("v5") },
    ...DEP_ORDER.flatMap((i) => [{ t: T_DEP(i) - 0.45, f: () => cineSfx.whoosh() }, { t: T_DEP(i), f: () => cineSfx.pop() }])],   // mỗi đồng đội bung dù: camera lia tới (vút) + tiếng dù bung            // cảnh báo độ cao · dù bung "BOOM"
  [{ t: 2.35, f: () => cineSfx.crack() }, { t: 2.5, f: () => cineSfx.crack() }, { t: 2.9, f: () => cineSfx.thud() },
    ...[4.2, 5.3, 6.9, 8.4].map((t) => ({ t, f: () => cineSfx.drip() })), ...[5.0, 7.2, 9.0].map((t) => ({ t, f: () => cineSfx.cricket() })), { t: 10.0, f: () => cineSfx.beep(0.6) }, { t: 6.4, f: () => say("v6") }],   // rừng đêm · bíp ở 0:58
];

/** Mỗi đồng đội bung dù: camera lia nhanh tới người đó (SH_A giây trước lúc bung → SH_B giây sau), zoom dần vào tán dù có logo, rồi lia về góc nhìn của người chơi. */
const SH_A = 0.4, SH_B = 0.8;
let WHIP = 0;   // độ "vút" của camera (0..1) để nhoè chuyển động
function shotOf(k: number, p: number, tc: number, w: { x: number; y: number; z: number }, i: number, oP: THREE.Vector3, oT: THREE.Vector3): number {
  oT.set(w.x, w.y + lerp(0.8, HANG + 0.4, smooth(0, 0.5, tc)), w.z);   // nhìn người đang rơi → tán dù bung ra
  const v = k % 3;
  if (v === 0) { oP.set(oT.x + lerp(3, 1, p), oT.y + lerp(15, 10, p), oT.z + lerp(7, 2, p)); return lerp(46, 34, p); }                                   // từ trên cao nhìn thẳng xuống nóc dù (thấy rõ logo), dolly vào
  if (v === 1) { const a = 0.6 + i * 1.3 + p * 1.7, r = lerp(17, 11, p); oP.set(oT.x + Math.cos(a) * r, oT.y + lerp(8, 10, p), oT.z + Math.sin(a) * r); return lerp(44, 34, p); }   // xoay vòng quanh, hạ gần dần
  oP.set(oT.x - lerp(11, 6, p), oT.y + lerp(12, 11, p), oT.z - lerp(9, 4, p)); return lerp(50, 36, p);                                                   // chéo từ trên-sau xuống
}
/* ───────── PHÂN CẢNH 0 · máy quay trong khoang ───────── */
/** Cú cận cảnh khuôn mặt người i. Máy đứng phía lối đi: dolly-in chớp nhoáng d[0]→d[1] (~0.4s, ease-out) rồi trôi chậm tới d[2]; fov co dần cùng nhịp (f).
 *  az = lệch góc quanh đầu (rad, + về phía đuôi), el = độ cao máy so với mắt, ty/tz = chỗ nhìn lệch so với tâm đầu, roll = nghiêng máy (Dutch angle). */
interface Cu { d: [number, number, number]; f: [number, number, number]; az?: number; el?: number; ty?: number; tz?: number; roll?: number }
const HEADY = 1.31;   // độ cao tâm vùng mắt–miệng của người ngồi, tính từ sàn (đầu cao 1.4, mũ che phía trên)
function faceCam(i: number, u: number, dur: number, ct: number, s: Cu) {
  const q = 1 - Math.exp(-u * 7), sl = Math.min(1, u / dur), d = lerp(s.d[0], s.d[1], q) + (s.d[2] - s.d[1]) * sl, f = lerp(s.f[0], s.f[1], q) + (s.f[2] - s.f[1]) * sl;
  const sx = SEAT[i].x, sz = SEAT[i].z, dir = -Math.sign(sx), az = s.az ?? 0, face = 0.224;   // dir = hướng mặt người ngồi (về phía lối đi)
  Wv(ct, sx + dir * (face + d) * Math.cos(az), HEADY + (s.el ?? 0), sz + (face + d) * Math.sin(az), P0);
  Wv(ct, sx + dir * face, HEADY + (s.ty ?? 0), sz + (s.tz ?? 0), T0);
  setFov(f); look(P0, T0, 0.004 + 0.003 * Math.sin(S.clock * 3)); if (s.roll) camera.rotateZ(s.roll);
}
function cabinCam(t: number, ct: number) {
  let lc = 0; for (const x of CUTS) if (t >= x) lc = x;
  WHIP = t > 0.05 ? 0.9 * Math.exp(-(t - lc) * 18) : 0;   // mỗi lần cắt cảnh: nhoè chuyển động rất ngắn
  const sd = shotAt(t);
  if (!sd) { // MASTER SHOT: góc rộng từ cuối khoang nhìn lên, hơi tiến vào; cuối cảnh lùi ra
    const fin = t >= MASTER2, u = fin ? t - MASTER2 : t, lz = fin ? lerp(4.4, 6.2, smooth(0, 2.3, u)) : lerp(6.4, 5.4, smooth(0, 3.8, u));
    Wv(ct, Math.sin(S.clock * 0.7) * 0.05, 1.6, lz, P0); Wv(ct, 0, 1.25, -6.5, T0); setFov(fin ? lerp(56, 64, Math.min(1, u / 2.3)) : 64); LZ = lz - 1;
    look(P0, T0, 0.006); camera.rotateZ(0.012 * Math.sin(S.clock * 1.3)); return;
  }
  const u = t - sd.a, dur = sd.e - sd.a; LZ = SEAT[sd.id].z;
  switch (sd.id) {
    case 1: faceCam(1, u, dur, ct, { d: [2.4, 1.5, 1.1], f: [36, 28, 24], az: 0.3, roll: 0.04 }); break;                                    // đội trưởng giận dữ
    case 3: faceCam(3, u, dur, ct, { d: [2.6, 1.7, 1.3], f: [34, 26, 22], az: -0.5, roll: -0.05 }); break;                                  // Delta nhếch mép, nhìn chéo qua vai
    case 4: if (u < 1.5) faceCam(4, u, 1.5, ct, { d: [2.4, 1.5, 1.15], f: [34, 26, 23] });                                                 // Echo: mặt đẫm mồ hôi…
      else { const k = (u - 1.5) / 1.1; setFov(34); Wv(ct, lerp(-0.2, -0.45, k), 0.95, SEAT[4].z + 0.55, P0); Wv(ct, -1.4, 0.62, SEAT[4].z, T0); look(P0, T0, 0.006); } break;   // …rồi bàn tay bấu mép ghế
    case 5: faceCam(5, u, dur, ct, { d: [2.4, 1.9, 1.6], f: [34, 30, 26], ty: lerp(-0.35, 0, smooth(0.5, 1.5, u)), az: -0.15 }); break;       // Foxtrot: tấm ảnh → ngước lên mặt rưng rưng
    case 0:
      if (u < 1.4) faceCam(0, u, 1.4, ct, { d: [2.4, 1.5, 1.15], f: [34, 26, 22] });                                                       // BẠN: mặt lạnh như tiền
      else if (u < 2.6) { const k = (u - 1.4) / 1.2; setFov(40); Wv(ct, lerp(-0.2, 0.5, k), 1.5, 0.75, P0); Wv(ct, 1.82, 1.5, GHOST_Z, T0); look(P0, T0, 0.003); }   // POV nhìn ô cửa sổ, bóng phản chiếu lướt qua
      else faceCam(0, u - 2.6, 0.7, ct, { d: [1.4, 1.1, 0.95], f: [24, 20, 18], ty: 0.04, az: 0.1 }); break;                               // mắt trượt theo bóng
    case 6:
      if (u < 1.7) faceCam(6, u, 1.7, ct, { d: [2.6, 1.6, 1.2], f: [34, 26, 23], az: 0.2 });                                               // cười gượng
      else if (u < 3.2) faceCam(6, u - 1.7, 1.5, ct, { d: [1.4, 1.1, 0.95], f: [24, 20, 18], az: 0.25, ty: 0.04 });                       // mắt liếc quét
      else if (u < 5.0) { const k = (u - 3.2) / 1.8; setFov(30); Wv(ct, lerp(0.2, 0.0, k), 1.15, -4.1, P0); Wv(ct, -1.3, 0.98, -4.88, T0); look(P0, T0, 0.003); }   // tay bấm bộ phát tín hiệu
      else faceCam(6, u - 5.0, 1.0, ct, { d: [1.6, 1.2, 1.0], f: [28, 24, 22], az: -0.2 }); break;                                        // nhếch mép hài lòng
    case 2:
      if (u < 1.5) faceCam(2, u, 1.5, ct, { d: [1.5, 1.15, 1.0], f: [24, 20, 18], ty: 0.04, az: 0.15 });                                   // Charlie: mắt đảo giật
      else if (u < 4.2) faceCam(2, u - 1.5, 2.7, ct, { d: [2.2, 1.4, 1.1], f: [34, 26, 22], az: -0.3, roll: 0.05 });                       // gằn giọng
      else faceCam(2, u - 4.2, 1.6, ct, { d: [1.5, 1.05, 0.85], f: [26, 21, 19], ty: 0.0 }); break;                                                  // trừng trừng nhìn thẳng
  }
}

function camera3d(b: number, t: number, ct: number, win: { x: number; y: number; z: number }[]) {
  WHIP = 0;
  CEN.set(0, 0, 0); for (const w of win) CEN.add(V.set(w.x, w.y, w.z)); CEN.multiplyScalar(1 / N);
  const c = S.clock;
  if (b === 0) { cabinCam(t, ct); return; }   // PHÂN CẢNH 1 · trong khoang: master shot + cận cảnh từng người
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
    // t chạy 0 → EXT: rơi tự do, camera nhìn xuống đất từ trên cao (mặt đất to dần) · u = t - EXT: đồng hồ báo đỏ → dù bung (u ≈ 2.4) → ngất
    const w0 = win[0], u = t - EXT, pre = smooth(0, EXT, t), kUp = smooth(2.4, 2.75, u), droop = smooth(3.6, 7, u);
    P0.set(w0.x, w0.y + 1.6, w0.z); let fovF = lerp(lerp(lerp(62, 70, pre), 86, smooth(0, 2.4, u)), 58, kUp);
    T0.set(P0.x + 1, P0.y - 8, P0.z + 2); T1.set(P0.x + 0.4, P0.y + 6, P0.z + 0.3); T0.lerp(T1, kUp); T0.y -= droop * 2;
    let shake = u < 2.4 ? 0.05 + 0.07 * pre : 0.5 * Math.exp(-(u - 2.4) * 3) + 0.01, roll = 0, wmax = 0;
    if (t < EXT + 0.3) for (let k = 0; k < DEP_ORDER.length; k++) {   // lia tới từng người đang bung dù
      const i = DEP_ORDER[k], td = T_DEP(i), wk = smooth(td - SH_A, td - SH_A + 0.22, t) * (1 - smooth(td + SH_B, td + SH_B + 0.22, t));
      if (wk <= 0.001) continue;
      const f = shotOf(k, Math.min(1, Math.max(0, (t - td + SH_A) / (SH_A + SH_B))), t - td, win[i], i, P1, T1);
      P0.lerp(P1, wk); T0.lerp(T1, wk); fovF = lerp(fovF, f, wk); wmax = Math.max(wmax, wk);
      const wh = 4 * wk * (1 - wk); if (wh > WHIP) { WHIP = wh; roll = (k % 2 ? 1 : -1) * 0.22 * wh; }
    }
    setFov(fovF); look(P0, T0, shake * (1 - wmax) + 0.03 * wmax); camera.rotateZ(roll + droop * 0.5 * Math.sin(u * 0.6 + 1)); return;
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
  const t = S.t, ct = b === 0 ? -CAB + t : b === 1 ? t : b === 2 ? 10 + t : b === 3 ? 26 + t : 36 + EXT + t;
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
  if (b === 0) { L = INTERIOR; lid = 0.085 * smooth(0, 0.8, t); vig = shotAt(t) ? 0.5 : 0.28; }   // khoang: tối, dải đen điện ảnh, viền tối góc hình
  else if (b === 1) L = mixLook(INTERIOR, NIGHT, smooth(6.2, 8, t));
  else if (b === 2) { L = mixLook(NIGHT, STORM, smooth(0, 3, t)); rainK = smooth(1, 4, t); }
  else if (b === 3) { const u = t - EXT; L = mixLook(STORM, GREY, smooth(0, 3, u)); rainK = 1 - smooth(0, 2.5, u); blur = 14 * smooth(3.0, 7.0, u); vig = smooth(3.4, 7.2, u); fade = smooth(7.3, 8.5, u); }
  else { L = mixLook(FOREST_LOW, FOREST_HIGH, smooth(5, 11.3, t)); fade = Math.max(1 - smooth(1.9, 2.4, t), smooth(11.3, 12, t)); }
  for (const te of flashAt[b] ?? []) if (t >= te) flash += Math.exp(-(t - te) * 12);
  flash = Math.min(1, flash);
  let wf = 0; if (b === 0) for (const te of WFLASH) if (t >= te) wf += Math.exp(-(t - te) * 7);   // sét xa ngoài cửa sổ: kính chớp sáng, khoang sáng loé
  wf = Math.min(1, wf); paneMat.color.setHex(mixHex(PANE_DARK, PANE_FLASH, wf));
  const u = (sky.material as THREE.ShaderMaterial).uniforms, fog = scene.fog as THREE.FogExp2;
  u.top.value.setHex(L.top); u.mid.value.setHex(L.mid); u.hor.value.setHex(L.hor); (scene.background as THREE.Color).setHex(L.hor); fog.color.setHex(L.fog); fog.density = L.fogD;
  hemi.color.setHex(L.hemiC); hemi.intensity = L.hemi + 4 * flash + (b === 0 ? (shotAt(t) ? 0.55 : 1.5) + 0.5 * wf : 0); sun.color.setHex(L.sunC); sun.intensity = L.sun; torch.intensity = b >= 4 ? env.torchI * smooth(0, 1, L.hemi) : 0;
  cloudMat.color.setHex(L.cloud); starMat.opacity = L.stars; stars.visible = L.stars > 0.01; sunOrb.visible = L.orb > 0.5; clouds.position.x = -6 * ct * (b <= 3 ? 1 : 0);
  clouds.visible = b <= 3;

  camera3d(b, t, ct, win);
  if (b === 0) { // đèn "key" bám theo máy quay, màu theo cảm xúc từng người; ghost phản chiếu; thẻ tên
    const sd = shotAt(t), K = sd ? KEY[sd.id] : null;
    if (K) { cineLight.color.setHex(K[0]); cineLight.position.copy(V.set(0.3, 0.42, 0.1).applyQuaternion(camera.quaternion).add(camera.position)); cineLight.intensity = K[1] * (sd!.id === 6 || sd!.id === 1 ? 0.8 + 0.2 * blink : 1); }
    const gq = shotAt(t)?.id === 0 ? (t - SA(0) - 1.4) / 1.2 : -1; ghost.visible = gq >= 0 && gq <= 1;
    if (ghost.visible) { ghost.position.z = GHOST_Z + lerp(0.3, -0.3, gq); ghostMat.opacity = 0.6 * Math.sin(Math.PI * gq) ** 0.8; }
    if (ovTag) { const id = sd ? sd.id : -1; if (id !== tagId) { tagId = id; ovTag.textContent = id >= 0 ? CALLSIGNS[id].toUpperCase() : ""; } ovTag.style.opacity = sd ? String(smooth(0.2, 0.5, t - sd.a) * (1 - smooth(sd.e - sd.a - 0.35, sd.e - sd.a - 0.05, t - sd.a))) : "0"; }
  } else { ghost.visible = false; if (ovTag) ovTag.style.opacity = "0"; }
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
  if (ovBlur) { const bb = Math.max(blur, 7 * WHIP), f = bb > 0.05 ? `blur(${bb.toFixed(1)}px)` : "none"; ovBlur.style.backdropFilter = f; (ovBlur.style as any).webkitBackdropFilter = f; }
  if (ovVig) ovVig.style.opacity = String(vig);
  if (ovAlt) { const on = b === 3 && t >= EXT - 0.1 && t < EXT + 2.45; ovAlt.style.opacity = on ? String(0.6 + 0.4 * Math.sin(S.clock * 14)) : "0"; if (on && ovAltV) ovAltV.textContent = String(Math.max(0, Math.round(win[0].y - GL[0]))); }
  if (ovStatic) ovStatic.style.opacity = String(VO.glitch ? 0.12 + 0.3 * Math.random() : 0);
  if (ovRays) ovRays.style.opacity = String(b === 4 ? 0.55 * smooth(2.6, 4, t) * (1 - smooth(5.4, 8, t)) : 0);

  // nền âm thanh: động cơ ù ù (muffled) → gió rít khi ramp mở → bão → ù đặc như chìm dưới nước → rừng tĩnh lặng
  if (b === 0) cineSfx.ambSet(0.3, 170, 0.1 + 0.06 * wf, 1500);   // động cơ gầm đều + gió rít ngoài vỏ máy bay
  else if (b === 1) cineSfx.ambSet(0.3, 260, 0.5 * smooth(0.2, 1.6, t), 1800);
  else if (b === 2) cineSfx.ambSet(0.45, 130, 0.4 + 0.3 * flash, 1400);
  else if (b === 3) { const u = t - EXT; if (u < 2.4) cineSfx.ambSet(0.35, 130, 0.3 + 0.2 * smooth(0, EXT, t), 1500); else cineSfx.ambSet(0.14 * (1 - smooth(2.6, 7.2, u)), 80, 0, 1500); }   // gió rít mạnh dần khi rơi gần đất
  else cineSfx.ambSet(0.04 * smooth(2.5, 4, t), 90, 0.02 * smooth(2.5, 4, t), 3200);
  const ev = EV[b] ?? []; for (let e = 0; e < ev.length; e++) if (!fired.has(e) && t >= ev[e].t) { fired.add(e); if (t - ev[e].t < 0.7) ev[e].f(); }
}
