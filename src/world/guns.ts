import * as THREE from "three";
import { PX } from "./soldier";
import type { GunId } from "../config";

/** Mô hình súng voxel (hộp). Quy ước: nòng hướng +z, gốc toạ độ = chỗ tay cầm (báng). userData: muzzle (đầu nòng), fore (chỗ tay đỡ), flash (chớp lửa). */
const mat = (c: number, r = 0.55, m = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const MT = { metal: mat(0x30343b, 0.45, 0.7), dark: mat(0x17181b, 0.6, 0.4), wood: mat(0x7b5232, 0.85, 0), olive: mat(0x4c5b3a, 0.8, 0.1) };
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.95, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
const flashGeo = new THREE.OctahedronGeometry(0.1);
const bx = (g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) => {
  const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); k.rotation.x = rx; g.add(k); return k;
};

export function buildGun(id: GunId): THREE.Group {
  const g = new THREE.Group();
  let mz = 0.3, my = 0.04, fz = 0.15, fy = -0.02;
  switch (id) {
    case "pistol":
      bx(g, 0.045, 0.055, 0.26, 0, 0.05, 0.1, MT.metal);          // nòng + thanh trượt
      bx(g, 0.04, 0.025, 0.2, 0, 0.0, 0.08, MT.dark);             // khung
      bx(g, 0.042, 0.12, 0.055, 0, -0.06, -0.01, MT.dark, 0.18);  // báng
      bx(g, 0.01, 0.015, 0.02, 0, 0.082, 0.22, MT.dark);          // đầu ruồi
      mz = 0.235; my = 0.05; fz = 0.06; fy = -0.03; break;
    case "smg":
      bx(g, 0.055, 0.075, 0.3, 0, 0.03, 0.12, MT.metal);
      bx(g, 0.03, 0.2, 0.045, 0, -0.12, 0.1, MT.dark);            // băng đạn dài
      bx(g, 0.045, 0.1, 0.05, 0, -0.07, -0.02, MT.dark, 0.2);     // báng cầm
      bx(g, 0.025, 0.035, 0.2, 0, 0.03, -0.17, MT.metal);         // báng gập
      bx(g, 0.022, 0.022, 0.14, 0, 0.035, 0.31, MT.dark);         // nòng
      mz = 0.39; my = 0.035; fz = 0.2; fy = -0.04; break;
    case "rifle":
      bx(g, 0.055, 0.08, 0.4, 0, 0.03, 0.15, MT.metal);           // thân
      bx(g, 0.052, 0.095, 0.22, 0, 0.01, -0.15, MT.wood);         // báng gỗ
      bx(g, 0.06, 0.06, 0.24, 0, 0.0, 0.43, MT.wood);             // ốp lót tay
      bx(g, 0.02, 0.02, 0.22, 0, 0.04, 0.66, MT.dark);            // nòng
      bx(g, 0.038, 0.17, 0.055, 0, -0.12, 0.2, MT.dark, 0.25);    // băng đạn cong
      bx(g, 0.012, 0.03, 0.012, 0, 0.1, 0.62, MT.dark);           // đầu ruồi
      bx(g, 0.035, 0.03, 0.06, 0, 0.085, 0.04, MT.dark);          // thước ngắm
      mz = 0.78; my = 0.04; fz = 0.43; fy = -0.04; break;
    case "shotgun":
      bx(g, 0.06, 0.085, 0.36, 0, 0.03, 0.15, MT.olive);
      bx(g, 0.052, 0.09, 0.24, 0, 0.0, -0.18, MT.wood);           // báng
      bx(g, 0.032, 0.032, 0.5, 0, 0.055, 0.47, MT.metal);         // nòng
      bx(g, 0.03, 0.03, 0.4, 0, 0.012, 0.42, MT.dark);            // ống đạn dưới
      bx(g, 0.07, 0.06, 0.2, 0, 0.0, 0.4, MT.wood);               // tay trượt (pump)
      mz = 0.73; my = 0.055; fz = 0.4; fy = -0.04; break;
  }
  g.userData.muzzle = new THREE.Vector3(0, my, mz);
  g.userData.fore = new THREE.Vector3(0, fy, fz);
  const fl = new THREE.Mesh(flashGeo, flashMat);
  fl.scale.set(1, 1, 2.4); fl.position.set(0, my, mz + 0.05); fl.visible = false; g.add(fl); g.userData.flash = fl;
  return g;
}
export const setFlash = (gun: THREE.Object3D | undefined, on: boolean) => { if (gun) (gun.userData.flash as THREE.Object3D).visible = on; };

/** Giá cầm súng gắn vào người lính: pivot đặt ở vai (xoay theo góc ngẩng), holder đẩy súng ra trước ngực. */
export interface GunRig { pivot: THREE.Group; holder: THREE.Group; models: Partial<Record<GunId, THREE.Group>>; cur: GunId }
export function attachGun(soldier: THREE.Group, id: GunId): GunRig {
  const pivot = new THREE.Group(); pivot.position.set(0, 24 * PX, 0);
  const holder = new THREE.Group(); holder.position.set(0, -0.04, 0.55); pivot.add(holder); soldier.add(pivot);
  const rig: GunRig = { pivot, holder, models: {}, cur: id };
  equipGun(rig, id); soldier.userData.gunRig = rig;
  return rig;
}
export function equipGun(r: GunRig, id: GunId) {
  if (!r.models[id]) { const m = buildGun(id); r.models[id] = m; r.holder.add(m); }
  for (const k of Object.keys(r.models) as GunId[]) r.models[k]!.visible = k === id;
  r.cur = id;
}
