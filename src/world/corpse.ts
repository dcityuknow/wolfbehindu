import * as THREE from "three";
import { groundAt } from "./island";
import { curlArm } from "./gunpose";

/**
 * Tư thế xác / người ngất: KHÔNG cầm súng, tay chân buông hoặc dang ra, mỗi người ngã một kiểu khác nhau.
 * Quy ước khớp (mặt nhìn +z): tay trái ở −x, tay phải ở +x · arm.rotation.z = ±φ dang ngang (φ≈π/2 là ngang vai, φ>π/2 là vươn lên phía đầu) ·
 * lean: +π/2 = nằm SẤP, −π/2 = nằm NGỬA, 0 + roll = nằm NGHIÊNG · k = độ gập khuỷu / gối.
 */
interface Limb { x?: number; z?: number; k?: number }
interface Pose { name: string; lean: number; roll: number; head: [number, number]; aL: Limb; aR: Limb; lL: Limb; lR: Limb; twist?: number }
export const POSES: Pose[] = [
  { name: "ngửa dang tay dang chân (chữ X)", lean: -Math.PI / 2, roll: 0, head: [0.15, 0.2], aL: { z: -1.9, k: 0.1 }, aR: { z: 1.9, k: 0.1 }, lL: { z: -0.6 }, lR: { z: 0.6 } },
  { name: "sấp dạng như sao biển", lean: Math.PI / 2, roll: 0, head: [0, 1.15], aL: { z: -2.3, k: 0.15 }, aR: { z: 2.3, k: 0.15 }, lL: { z: -0.5 }, lR: { z: 0.5 } },
  { name: "ngửa, một tay gác lên đầu, co một gối", lean: -Math.PI / 2, roll: 0, head: [0.1, -0.5], aL: { z: -2.9, k: 0.6 }, aR: { z: 1.3, k: 0.3 }, lL: { x: -1.1, z: -0.12, k: 1.35 }, lR: { z: 0.3 }, twist: 0.25 },
  { name: "sấp, bò ngã, một chân co lên", lean: Math.PI / 2, roll: 0, head: [0, -1.05], aL: { z: -3.0, k: 0.3 }, aR: { z: 1.15, k: 0.7 }, lL: { z: -0.4, k: 0.2 }, lR: { x: 0.2, z: 0.3, k: 1.1 }, twist: -0.3 },
  { name: "nằm nghiêng co người", roll: Math.PI / 2, lean: 0, head: [0.3, 0], aL: { x: -0.9, z: 0.3, k: 1.2 }, aR: { x: -0.5, z: 0.3, k: 1.0 }, lL: { x: -1.2, z: -0.1, k: 1.5 }, lR: { x: -0.8, z: 0.1, k: 1.4 } },
  { name: "ngửa buông thõng, chân dạng rộng", lean: -Math.PI / 2, roll: 0, head: [0.2, 0.55], aL: { z: -0.55, k: 0.1 }, aR: { z: 0.5, x: 0.15, k: 0.2 }, lL: { z: -0.85 }, lR: { z: 0.8, k: 0.15 } },
  { name: "sấp, hai tay vươn quá đầu", lean: Math.PI / 2, roll: 0, head: [0, -0.8], aL: { z: -2.75, k: 0.1 }, aR: { z: 2.7, k: 0.1 }, lL: { z: -0.18, k: 0.45 }, lR: { z: 0.2, k: 0.1 } },
  { name: "nằm nghiêng bên kia, dang chân tay", roll: -Math.PI / 2, lean: 0, head: [0.2, 0], aL: { x: -0.4, z: -1.3, k: 0.2 }, aR: { x: -1.0, z: 0.1, k: 0.6 }, lL: { x: 0.5, z: -0.45 }, lR: { x: -0.6, z: 0.05, k: 0.7 } },
  { name: "ngửa, tay buông dọc, hai gối co dạng", lean: -Math.PI / 2, roll: 0, head: [-0.1, 0], aL: { z: -1.25, k: 0.4 }, aR: { z: 1.0, k: 0.8 }, lL: { x: -0.9, z: -0.55, k: 1.2 }, lR: { x: -0.7, z: 0.5, k: 1.1 } },
];
/** Chọn tư thế khác tư thế người ngã gần nhất (để mỗi xác một kiểu). */
let lastPose = -1;
export const pickPose = () => { let k: number; do { k = (Math.random() * POSES.length) | 0; } while (k === lastPose); lastPose = k; return k; };

function setLimb(l: THREE.Object3D, p: Limb, arm: boolean) {
  l.rotation.set(p.x ?? 0, 0, p.z ?? 0);
  const j = arm ? (l.userData.elbow as THREE.Object3D) : (l.userData.knee as THREE.Object3D);
  if (j) j.rotation.set(arm ? -(p.k ?? 0.1) : (p.k ?? 0.05), 0, 0);
  if (arm) curlArm(l, 0.35, 0.5);
}
/** Đặt nhân vật `g` nằm xuống ở (x, z), thân hướng `rot`, theo tư thế `idx`, lệch hướng `yawOff` so với hướng ngã. pack = ba lô to (cần nâng cao hơn khi nằm ngửa). */
export function layDown(g: THREE.Group, x: number, z: number, rot: number, idx: number, yawOff: number, pack: boolean) {
  const P = POSES[idx % POSES.length], u = g.userData, yaw = rot + yawOff;
  g.rotation.order = "YXZ"; g.rotation.set(P.lean, yaw, P.roll); g.scale.set(1, 1, 1);
  setLimb(u.armL, P.aL, true); setLimb(u.armR, P.aR, true); setLimb(u.legL, P.lL, false); setLimb(u.legR, P.lR, false);
  if (u.hip) u.hip.rotation.set(0, P.twist ?? 0, 0);
  if (u.head) u.head.rotation.set(P.head[0], P.head[1], 0);
  const gr = u.gunRig; if (gr) { gr.pivot.visible = false; if (gr.extra) gr.extra.visible = false; }   // người ngã thì súng không còn dính trong tay
  let hx: number, hz: number, off: number;
  if (P.lean > 0) { hx = Math.sin(yaw); hz = Math.cos(yaw); off = 0.25; }
  else if (P.lean < 0) { hx = -Math.sin(yaw); hz = -Math.cos(yaw); off = pack ? 0.46 : 0.25; }
  else { const s = Math.sign(P.roll); hx = -s * Math.cos(yaw); hz = s * Math.sin(yaw); off = 0.42; }
  const px = x - 0.9 * hx, pz = z - 0.9 * hz;      // gốc nhân vật = chân → lùi 0,9 m để TÂM thân nằm đúng chỗ ngã
  const gy = Math.max(groundAt(px, pz), groundAt(x, z), groundAt(px + 1.8 * hx, pz + 1.8 * hz));
  g.position.set(px, gy + off, pz);
}
/** Dậy lại (hết ngất): trả mọi khớp về mặc định, animateCrew sẽ lo phần còn lại. */
export function standUp(g: THREE.Group, rot: number) {
  const u = g.userData; g.rotation.set(0, rot, 0);
  for (const l of [u.legL, u.legR]) if (l) l.rotation.set(0, 0, 0);
  if (u.hip) u.hip.rotation.set(0, 0, 0);
  if (u.head) u.head.rotation.set(0, 0, 0);
}
