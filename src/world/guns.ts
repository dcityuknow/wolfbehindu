import * as THREE from "three";
import { PX, VB } from "./soldier";
import type { GunId } from "../config";

/**
 * Mô hình súng voxel (hộp) — 3 súng: súng ngắn · súng dài (AK) · súng ngắm, và lựu đạn MK2.
 * Quy ước: nòng hướng +z, gốc toạ độ = chỗ bàn tay phải nắm báng.
 * userData của mỗi súng: muzzle (đầu nòng) · fore (chỗ tay trái đỡ) · flash (chớp lửa)
 *   mag (băng đạn — nhóm riêng để rút ra / nhét vào được) · magHome (chỗ băng đạn khi gắn trong súng)
 *   slide (thanh trượt / khóa nòng — nhóm riêng, lùi về -z khi bắn / lên đạn) · travel (quãng lùi tối đa, m).
 */
const mat = (c: number, r = 0.55, m = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const MT = {
  metal: mat(0x30343b, 0.45, 0.7), dark: mat(0x17181b, 0.6, 0.4), wood: mat(0x7b5232, 0.85, 0), olive: mat(0x4c5b3a, 0.8, 0.1),
  steel: mat(0xb8bcc4, 0.35, 0.8), gold: mat(0xffc93a, 0.4, 0.6), orange: mat(0xff8a2a, 0.6, 0.1),
  magBlue: mat(0x3a7fe0, 0.6, 0.2), magYel: mat(0xe0a030, 0.6, 0.2), glass: new THREE.MeshBasicMaterial({ color: 0x0a0d12 }),
  nade: mat(0x4a6a35, 0.75, 0.1), nadeD: mat(0x34502a, 0.8, 0.1), holster: mat(0x1d1d22, 0.8, 0.1),
};
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.95, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
const flashGeo = new THREE.OctahedronGeometry(0.1);
const bx = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0, ry = 0) => {
  const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); k.rotation.set(rx, ry, 0); k.castShadow = true; g.add(k); return k;
};

/* ── súng voxel mịn (ô 2 cm) màu kiểu game tham khảo: thân tím-xám caro, vân xanh dương, chi tiết vàng / cam ── */
const VMAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }), CELL = 0.02;
const pal = (...c: number[]) => (i: number, j: number, k: number) => c[(i + j + k) % c.length];
const DKP = pal(0x3a3850, 0x55536e, 0x2b2a3a), BLP = pal(0x4d9dff, 0x7fbfff, 0x3a7fe0), YLP = pal(0xf2b84b, 0xffd76a, 0xe0a030), ORP = pal(0xff9a3c, 0xffb56b, 0xe0801f), SILP = pal(0xf4f7fb, 0xe9eef5, 0xdde3ec);
const DK2 = 0x2b2a3a, OR = 0xff9a3c, GOLD = 0xffd23f, STEEL = 0xc9c9d6, BLK = 0x05060a;
/** Một khối voxel đặt riêng (để xoay được): tâm (x,y,z), xoay rx quanh trục x. */
function part(parent: THREE.Object3D, w: number, h: number, d: number, col: number | ((i: number, j: number, k: number) => number), x: number, y: number, z: number, rx = 0) {
  const v = new VB(); v.box(0, 0, 0, w, h, d, col as any, CELL); const m = v.mesh(VMAT); m.position.set(x, y, z); m.rotation.x = rx; parent.add(m); return m;
}

export function buildGun(id: GunId): THREE.Group {
  const g = new THREE.Group(), mag = new THREE.Group(), slide = new THREE.Group(), st = new VB(), sv = new VB(), mv = new VB();
  const S = (cx: number, cy: number, cz: number, w: number, h: number, d: number, c: any) => st.box(cx, cy, cz, w, h, d, c, CELL);
  const L = (cx: number, cy: number, cz: number, w: number, h: number, d: number, c: any) => sv.box(cx, cy, cz, w, h, d, c, CELL);
  const Mg = (cx: number, cy: number, cz: number, w: number, h: number, d: number, c: any) => mv.box(cx, cy, cz, w, h, d, c, CELL);
  let mz = 0.3, my = 0.04, fz = 0.15, fy = -0.02, travel = 0.05; const home = new THREE.Vector3();
  switch (id) {
    case "pistol":   // kiểu Desert Eagle: thanh trượt trắng bạc, viền cam, khung xanh xám, băng đạn xanh dương
      L(0, 0.05, 0.12, 0.05, 0.07, 0.3, SILP); L(0, 0.088, 0.14, 0.03, 0.012, 0.22, ORP); L(0, 0.05, 0.285, 0.054, 0.04, 0.02, OR); L(0, 0.092, 0.27, 0.012, 0.02, 0.016, DK2);
      S(0, 0.0, 0.1, 0.06, 0.04, 0.28, pal(0x5a6b85, 0x4b5b75)); S(0, -0.03, 0.08, 0.016, 0.012, 0.09, DK2); S(0, 0.0, 0.245, 0.062, 0.04, 0.03, OR);
      part(g, 0.052, 0.13, 0.07, pal(OR, 0x3a4358), 0, -0.065, -0.01, 0.18);       // báng cầm nghiêng, chia ô cam / đen
      Mg(0, 0, 0, 0.044, 0.1, 0.052, BLP); Mg(0, -0.055, 0, 0.056, 0.014, 0.062, OR);
      home.set(0, -0.115, -0.022); mz = 0.3; my = 0.05; fz = 0.06; fy = -0.03; travel = 0.05; break;
    case "rifle":    // súng dài: thân vàng, ốp lót tay tím, vân xanh, vòng cam
      S(0, 0.03, 0.15, 0.075, 0.09, 0.42, YLP); S(0.041, 0.03, 0.15, 0.008, 0.04, 0.3, BLP); S(-0.041, 0.03, 0.15, 0.008, 0.04, 0.3, BLP);
      S(0, 0.01, -0.17, 0.06, 0.1, 0.26, DK2); S(0, 0.025, 0.5, 0.082, 0.085, 0.26, DKP); S(0, 0.025, 0.37, 0.092, 0.095, 0.03, ORP); S(0, 0.025, 0.63, 0.092, 0.095, 0.03, ORP);
      S(0, 0.035, 0.8, 0.03, 0.03, 0.3, DK2); S(0, 0.035, 0.96, 0.046, 0.046, 0.05, GOLD);
      S(0, 0.095, 0.06, 0.04, 0.03, 0.04, DK2); S(0, 0.085, 0.74, 0.016, 0.03, 0.016, DK2);
      part(g, 0.05, 0.12, 0.06, DK2, 0, -0.075, -0.01, 0.2);
      L(0.052, 0.055, 0.12, 0.026, 0.03, 0.07, ORP);
      part(mag, 0.05, 0.17, 0.07, YLP, 0, 0, 0); mag.rotation.x = 0.25; Mg(0, -0.1, 0.0, 0.052, 0.014, 0.072, OR);
      home.set(0, -0.12, 0.2); mz = 0.99; my = 0.035; fz = 0.5; fy = -0.03; travel = 0.07; break;
    case "sniper":   // súng ngắm: thân tím caro, vân xanh, ống ngắm lớn có kính đen, kẹp vàng, nòng dài có hãm vàng
      S(0, 0.03, 0.25, 0.09, 0.11, 0.62, DKP); S(0.049, 0.03, 0.27, 0.008, 0.06, 0.42, BLP); S(-0.049, 0.03, 0.27, 0.008, 0.06, 0.42, BLP);
      S(0, 0.0, -0.25, 0.075, 0.13, 0.36, pal(0x2b2a3a, 0x3a3850)); S(0, 0.082, -0.2, 0.062, 0.03, 0.2, BLP);
      S(0, 0.04, 0.9, 0.035, 0.035, 0.7, DK2); S(0, 0.04, 0.72, 0.052, 0.052, 0.03, GOLD); S(0, 0.04, 1.08, 0.052, 0.052, 0.03, GOLD); S(0, 0.04, 1.3, 0.056, 0.056, 0.12, pal(GOLD, 0xf2b84b));
      S(0, -0.015, 0.78, 0.04, 0.05, 0.4, BLP);                                       // ốp lót tay dưới (vân xanh)
      S(0, 0.15, 0.3, 0.06, 0.06, 0.44, DK2); S(0, 0.15, 0.55, 0.09, 0.09, 0.09, DK2); S(0, 0.15, 0.065, 0.078, 0.078, 0.07, DK2);   // ống ngắm: thân + ống kính trước + ống kính sau
      S(0, 0.15, 0.6, 0.074, 0.074, 0.012, BLK); S(0, 0.15, 0.026, 0.06, 0.06, 0.012, BLK);                                          // mặt kính đen
      S(0, 0.095, 0.2, 0.05, 0.04, 0.05, DK2); S(0, 0.095, 0.42, 0.05, 0.04, 0.05, DK2); S(0, 0.115, 0.2, 0.07, 0.016, 0.03, GOLD); S(0, 0.115, 0.42, 0.07, 0.016, 0.03, GOLD);   // chân đế + kẹp vàng
      S(0, 0.0, 0.06, 0.1, 0.02, 0.1, ORP);
      part(g, 0.06, 0.15, 0.08, DK2, 0, -0.085, -0.03, 0.15);
      L(0.07, 0.06, 0.1, 0.06, 0.02, 0.02, STEEL); L(0.105, 0.06, 0.1, 0.03, 0.03, 0.03, GOLD);                                       // tay khóa nòng bẻ ngang + núm vàng
      Mg(0, 0, 0, 0.07, 0.1, 0.1, YLP);
      home.set(0, -0.105, 0.22); mz = 1.38; my = 0.04; fz = 0.62; fy = -0.03; travel = 0.09; break;
  }
  g.add(st.mesh(VMAT)); slide.add(sv.mesh(VMAT)); mag.add(mv.mesh(VMAT)); g.add(mag, slide);
  mag.position.copy(home);
  Object.assign(g.userData, { muzzle: new THREE.Vector3(0, my, mz), fore: new THREE.Vector3(0, fy, fz), mag, magHome: home.clone(), slide, travel });
  const fl = new THREE.Mesh(flashGeo, flashMat);
  fl.scale.set(1, 1, 2.4); fl.position.set(0, my, mz + 0.05); fl.visible = false; g.add(fl); g.userData.flash = fl;
  return g;
}
export const setFlash = (gun: THREE.Object3D | undefined, on: boolean) => { if (gun) (gun.userData.flash as THREE.Object3D).visible = on; };
/** Thanh trượt / khóa nòng lùi về sau `k` (0..1) của quãng lùi tối đa. */
export const setSlide = (gun: THREE.Object3D, k: number) => { (gun.userData.slide as THREE.Object3D).position.z = -(gun.userData.travel as number) * k; };

/** Lựu đạn MK2 "quả dứa": thân xanh ô-liu chia ô, nắp vàng, cần gạt, chốt vòng (userData.pin — giật ra được). Gốc = tâm quả lựu đạn. */
export function buildGrenade(): THREE.Group {
  const g = new THREE.Group();
  bx(g, 0.085, 0.11, 0.085, 0, 0, 0, MT.nade); bx(g, 0.085, 0.11, 0.085, 0, 0, 0, MT.nade, 0, Math.PI / 4);   // hai khối xoay 45° = thân bát giác
  bx(g, 0.1, 0.014, 0.1, 0, 0.026, 0, MT.nadeD, 0, Math.PI / 8); bx(g, 0.1, 0.014, 0.1, 0, -0.026, 0, MT.nadeD, 0, Math.PI / 8);   // gờ chia ô
  bx(g, 0.04, 0.03, 0.04, 0, 0.07, 0, MT.gold); bx(g, 0.026, 0.03, 0.026, 0, 0.096, 0, MT.steel);                                // nắp + cổ
  bx(g, 0.012, 0.13, 0.03, 0.052, 0.02, 0, MT.steel); bx(g, 0.06, 0.012, 0.03, 0.03, 0.109, 0, MT.steel);                         // cần gạt
  const pin = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0045, 5, 10), MT.steel); ring.position.set(-0.04, 0.118, 0); pin.add(ring);   // vòng kéo
  bx(pin, 0.04, 0.008, 0.008, -0.012, 0.118, 0, MT.steel);                                                                                  // thân chốt
  g.add(pin); g.userData.pin = pin;
  return g;
}

/* ───── đeo súng trên người (toạ độ theo thân nhân vật, m; chân ở y=0, lưng ở -z) — giống game tham khảo ───── */
/** p = tâm khẩu súng đang đeo · dir = hướng nòng · s = tỉ lệ · mid = dời dọc theo súng để tâm súng trùng p */
const SLING: Record<GunId, { p: [number, number, number]; dir: [number, number, number]; s: number; mid: number }> = {
  rifle: { p: [0, 1.0, -0.06], dir: [0.55, 0.85, 0], s: 0.85, mid: -0.27 },      // vắt chéo sau lưng: vai trái → hông phải (z là phần dời thêm ra sau lưng — cộng với backZ)
  sniper: { p: [0, 1.0, -0.1], dir: [-0.55, 0.85, 0], s: 0.85, mid: -0.45 },     // chéo ngược lại → hai súng thành chữ X
  pistol: { p: [0.275, 0.74, 0.02], dir: [0, -1, 0.05], s: 1, mid: -0.1 },       // bao súng hông phải, báng chúc lên
};
export const POUCH = new THREE.Vector3(-0.3, 0.86, 0.14);          // túi băng đạn hông trái (toạ độ thân)
const NADE_HOOK: [number, number, number][] = [[-0.285, 0.76, 0.1], [-0.285, 0.76, 0.01], [-0.285, 0.76, -0.08]];   // 3 quả lựu đạn móc ở hông trái

/** Trạng thái hoạt ảnh của giá súng đầy đủ (gunpose.ts đọc / ghi). */
export interface PoseState {
  swPrev: string | null; handPrev: GunId | null; swOld: GunId | null; swNew: GunId; swT: number; swOn: boolean; swS1: number; swLen: number; swPh: number; swU: number;
  rp: THREE.Vector3; lp: THREE.Vector3; leanS: number; lean: number; relPrev: number; busy: boolean; pinPrev: boolean;
}
/** Giá cầm súng gắn vào người lính.
 *  - Bot / cảnh mở đầu (full = false): pivot đặt ở vai (xoay theo góc ngẩng), holder đẩy súng ra trước ngực.
 *  - Người chơi (full = true): pivot = gốc thân; holder (súng đang cầm) do gunpose.ts đặt theo hai bàn tay; có 3 súng đeo sau lưng / hông, túi băng đạn và 3 lựu đạn móc hông. */
export interface GunRig {
  pivot: THREE.Group; holder: THREE.Group; models: Partial<Record<GunId, THREE.Group>>; cur: GunId; full: boolean;
  slung: Partial<Record<GunId, THREE.Group>>; sgr: Partial<Record<GunId, THREE.Vector3>>; sq: Partial<Record<GunId, THREE.Quaternion>>; sscale: Partial<Record<GunId, number>>;
  hooks: THREE.Group[]; nade: THREE.Group | null; st: PoseState;
  /** Nhóm chứa phần đeo trên người (súng đeo, bao, túi, lựu đạn) — ẩn / hiện cùng người (bot: tách riêng khỏi pivot vì pivot xoay theo vai). */
  extra: THREE.Group;
}
const Z = new THREE.Vector3(0, 0, 1);
/** backZ = mặt lưng của nhân vật (m, âm): -0.16 khi không ba lô, -0.27 khi có ba lô — súng đeo áp sát vào đó. */
export function attachGun(soldier: THREE.Group, id: GunId, full = false, backZ = -0.16): GunRig {
  const pivot = new THREE.Group(), holder = new THREE.Group(), extra = full ? pivot : new THREE.Group();
  const st: PoseState = { swPrev: null, handPrev: null, swOld: null, swNew: id, swT: 0, swOn: false, swS1: 0, swLen: 0, swPh: 0, swU: 0, rp: new THREE.Vector3(0.3, 0.85, 0.08), lp: new THREE.Vector3(-0.3, 0.9, 0.12), leanS: 0, lean: 0, relPrev: 0, busy: false, pinPrev: false };
  const rig: GunRig = { pivot, holder, models: {}, cur: id, full, slung: {}, sgr: {}, sq: {}, sscale: {}, hooks: [], nade: null, st, extra };
  if (!full) { pivot.position.set(0, 24 * PX, 0); holder.position.set(0, -0.04, 0.55); pivot.add(holder); soldier.add(pivot, extra); }
  else { pivot.add(holder); soldier.add(pivot); }
  for (const t of ["pistol", "rifle", "sniper"] as GunId[]) {   // 3 súng đeo trên người — cả người chơi lẫn đồng đội (bot cầm 1 khẩu thì khẩu đó không còn đeo)
    if (full) { const m = buildGun(t); m.visible = false; holder.add(m); rig.models[t] = m; }
    const c = SLING[t], sl = new THREE.Group(), s = buildGun(t); s.position.z = c.mid; sl.add(s);
    sl.position.set(c.p[0], c.p[1], t === "pistol" ? c.p[2] : backZ + c.p[2]); sl.scale.setScalar(c.s); sl.quaternion.setFromUnitVectors(Z, new THREE.Vector3(...c.dir).normalize());
    extra.add(sl); rig.slung[t] = sl; rig.sscale[t] = c.s; rig.sq[t] = sl.quaternion.clone();
    rig.sgr[t] = new THREE.Vector3(0, 0, c.mid * c.s).applyQuaternion(sl.quaternion).add(sl.position);   // chỗ nắm báng khi súng còn trên dây đeo / trong bao
    if (!full) sl.visible = t !== id;
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.17, 0.115), MT.holster); hl.position.set(0.275, 0.7, 0.02); extra.add(hl);            // bao súng ngắn
  const pc = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.11), MT.holster); pc.position.set(-0.265, 0.87, 0.15); extra.add(pc);            // túi băng đạn
  for (const h of NADE_HOOK) { const n = buildGrenade(); n.position.set(...h); n.scale.setScalar(0.9); extra.add(n); rig.hooks.push(n); }
  if (full) { const nd = buildGrenade(); nd.visible = false; extra.add(nd); rig.nade = nd; holder.userData.full = true; }
  equipGun(rig, id);
  soldier.userData.gunRig = rig;
  return rig;
}
export function equipGun(r: GunRig, id: GunId) {
  if (!r.models[id]) { const m = buildGun(id); r.models[id] = m; r.holder.add(m); }
  if (!r.full) for (const k of Object.keys(r.models) as GunId[]) r.models[k]!.visible = k === id;
  r.cur = id;
}
