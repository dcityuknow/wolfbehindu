import * as THREE from "three";
import { groundAt } from "./island";
import { curlArm } from "./gunpose";
import { layDown, POSES } from "./corpse";
import { PX } from "./soldier";
import { G } from "../state";
import type { Entity } from "../types";

/**
 * PHẢN ỨNG TRÚNG ĐẠN + GỤC NGÃ (chỉ là hoạt ảnh — không đụng tới luật chơi / hợp đồng).
 *
 *  1) classifyHit()  : từ điểm trúng + hướng đạn → VÙNG cơ thể (đầu / vai / tay / ngực / bụng / chân) + bên trái/phải + trúng từ trước hay sau.
 *  2) reactHit()     : còn sống → phản ứng theo vùng (headshot giật đầu ra sau · vai bật ra sau, thân xoay · tay hất ngửa, bàn tay xoè ra · ngực ưỡn ·
 *                      bụng gập người ôm bụng · chân khuỵu một gối), rồi tự hồi lại. Chân bị bắn thì bot đứng khựng (e.freeze) cho đúng lúc quỳ.
 *  3) beginDying()   : bị hạ → KHÔNG đổ rụp: giật theo vùng trúng → khuỵu xuống quỳ (2 gối / 1 gối) → gục hẳn (ngửa / sấp / nghiêng tuỳ hướng đạn) →
 *                      khớp đúng tư thế xác trong corpse.ts. Thân nghiêng quanh HÔNG (chân giữ thẳng), người chạm đất bằng bộ giải va chạm.
 */
export type Zone = "head" | "shoulder" | "arm" | "chest" | "belly" | "leg" | "blast";
export interface HitInfo {
  zone: Zone;
  /** bên bị trúng theo hệ của nhân vật: +1 = bên phải (tay phải ở +x), −1 = bên trái */
  side: number;
  /** +1 = trúng từ phía trước (người bị đẩy ra sau) · −1 = trúng từ sau lưng */
  front: number;
  /** hướng đạn bay (ngang, đã chuẩn hoá) · độ mạnh 0.6..1.4 */
  dx: number; dz: number; str: number;
}
interface HitState { info: HitInfo; t: number; dur: number; str: number }

const HIP = 12 * PX;   // độ cao khớp hông (m) — tâm xoay khi gập người
const sstep = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => lerp(v, b[i], t));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ───────────────────────── 1) Phân loại vùng trúng ───────────────────────── */
/** P = điểm trúng (thế giới) · D = hướng đạn bay · head = đã tính headshot ở combat.ts. */
export function classifyHit(e: { x: number; y: number; z: number; rot: number }, P: { x: number; y: number; z: number }, D: { x: number; z: number }, head: boolean, dmg: number): HitInfo {
  const fx = Math.sin(e.rot), fz = Math.cos(e.rot), rx = Math.cos(e.rot), rz = -Math.sin(e.rot);
  const lat = (P.x - e.x) * rx + (P.z - e.z) * rz, h = P.y - e.y;
  const hd = Math.hypot(D.x, D.z) || 1, dx = D.x / hd, dz = D.z / hd;
  const front = dx * fx + dz * fz < 0 ? 1 : -1;
  let zone: Zone;
  if (head) zone = "head";
  else if (h < 0.68) zone = "leg";
  else if (Math.abs(lat) > 0.2) zone = h > 1.18 ? "shoulder" : "arm";
  else zone = h > 1.0 ? "chest" : "belly";
  return { zone, side: lat >= 0 ? 1 : -1, front, dx, dz, str: clamp(0.65 + dmg / 55, 0.7, 1.4) };
}
/** Vụ nổ: bị hất đi xa tâm nổ. */
export function classifyBlast(e: { x: number; z: number; rot: number }, from: { x: number; z: number }, dmg: number): HitInfo {
  const dx0 = e.x - from.x, dz0 = e.z - from.z, l = Math.hypot(dx0, dz0) || 1, dx = dx0 / l, dz = dz0 / l;
  return { zone: "blast", side: 1, front: dx * Math.sin(e.rot) + dz * Math.cos(e.rot) < 0 ? 1 : -1, dx, dz, str: clamp(0.8 + dmg / 90, 0.9, 1.5) };
}
/** Hạ bằng dao / không có thông tin đạn (gián điệp ám sát): coi như đòn vào ngực từ phía kẻ ra tay. */
export function defaultHit(e: { x: number; z: number; rot: number }, from: { x: number; z: number }): HitInfo {
  const i = classifyBlast(e, from, 40); i.zone = "chest"; i.str = 1; return i;
}

/* ───────────────────────── 2) Phản ứng khi còn sống ───────────────────────── */
const durOf = (z: Zone) => (z === "leg" ? 1.8 : z === "belly" || z === "blast" ? 1.1 : 0.85);
/** Bắt đầu phản ứng trúng đạn (gọi mỗi lần trúng; trúng liên tiếp thì phản ứng mới đè lên). */
export function reactHit(e: Entity, info: HitInfo) {
  const u = e.g.userData; if (u.dying) return;
  const dur = durOf(info.zone);
  u.hit = { info, t: 0, dur, str: info.str } as HitState;
  if (info.zone === "leg") e.freeze = Math.max(e.freeze ?? 0, 1.5);                  // khuỵu gối: đứng khựng, không lướt đi
  else if (info.zone === "blast") e.freeze = Math.max(e.freeze ?? 0, 0.5);
  else e.freeze = Math.max(e.freeze ?? 0, 0.16);                                      // giật mình một nhịp
}

/** Đường cong: bật mạnh trong ~0,1 s rồi hồi từ từ (có dư chấn nhẹ). */
const env = (u: number) => u >= 1 ? 0 : (u < 0.12 ? sstep(u / 0.12) : 1 - sstep((u - 0.12) / 0.88)) * (1 + 0.1 * Math.sin(u * 17) * (1 - u));
/** Khuỵu gối: sụp nhanh, giữ, đứng dậy chậm. */
const kenv = (t: number) => t < 0.18 ? sstep(t / 0.18) : t < 1.05 ? 1 : 1 - sstep((t - 1.05) / 0.7);

function armOf(u: any, s: number): THREE.Object3D { return s > 0 ? u.armR : u.armL; }
/** Cộng thêm (additive) lên tư thế hiện tại của khung hình. `dying` = đã nằm trong chuỗi gục ngã (nền đã quỳ sẵn nên bỏ phần khuỵu gối). */
function layer(g: THREE.Group, rot: number, info: HitInfo, t: number, dur: number, str: number, dying: boolean) {
  const u = g.userData, zn = info.zone, F = info.front, sd = info.side;
  const a = env(t / dur) * str, kb = zn === "leg" && !dying ? kenv(t) : 0;
  let L = 0, tw = 0, drop = 0;
  const hb = u.head ? { x: u.head.rotation.x, y: u.head.rotation.y, z: u.head.rotation.z } : { x: 0, y: 0, z: 0 };
  const aS = armOf(u, sd), aO = armOf(u, -sd), both = [u.armL, u.armR] as THREE.Object3D[], head = u.head as THREE.Object3D;
  const addArm = (arm: THREE.Object3D, x: number, z: number, elbow = 0) => { arm.rotation.x += x; arm.rotation.z += (arm === u.armR ? 1 : -1) * z; const el = arm.userData.elbow as THREE.Object3D; if (el) el.rotation.x += elbow; };
  const openHand = (arm: THREE.Object3D, k: number) => curlArm(arm, lerp(1.4, 0.1, clamp(k, 0, 1)), lerp(0.9, 0.0, clamp(k, 0, 1)));
  switch (zn) {
    case "head":     // giật đầu ra sau, thân ngửa nhẹ, hai tay bật lên theo quán tính
      L += -0.07 * a * F; if (head) { head.rotation.x += -0.22 * Math.min(a, 1.1) * F; head.rotation.z += 0.04 * Math.min(a, 1.1) * sd; } tw += 0.04 * a * sd * F;   // trúng đầu: chỉ ngửa đầu ra sau một chút
      for (const b of both) addArm(b, 0.2 * a * F, 0.15 * a, 0.1 * a);
      break;
    case "shoulder": // vai bật ra sau, thân xoay theo cú đập, tay bên đó buông thõng
      L += -0.12 * a * F; tw += 0.45 * a * sd * F; addArm(aS, 0.95 * a * F, 0.4 * a, 0.45 * a); addArm(aO, 0.2 * a * F, 0.1 * a);
      if (head) { head.rotation.z += -0.22 * a * sd; head.rotation.y += 0.25 * a * sd * F; } openHand(aS, a);
      break;
    case "arm":      // tay bị bắn: hất ngửa ra ngoài + ra sau, bàn tay xoè
      addArm(aS, 1.2 * a * F, 0.95 * a, 0.55 * a); addArm(aO, 0.25 * a * F, 0.1 * a); tw += 0.16 * a * sd * F; L += -0.08 * a * F;
      if (head) head.rotation.z += -0.15 * a * sd; openHand(aS, a * 1.1);
      break;
    case "chest":    // ưỡn ngực, hai tay dang ra
      L += -0.27 * a * F; drop += 0.04 * a; if (head) head.rotation.x += -0.45 * a * F;
      for (const b of both) addArm(b, 0.55 * a * F, 0.55 * a, 0.35 * a);
      break;
    case "belly":    // gập người, hai tay ôm bụng
      L += 0.5 * a * F; drop += 0.1 * a; if (head) head.rotation.x += 0.45 * a;
      for (const b of both) { b.rotation.x += -0.75 * a; b.rotation.z += (b === u.armR ? -1 : 1) * 0.35 * a; (b.userData.elbow as THREE.Object3D).rotation.x += -0.5 * a; }
      for (const l of [u.legL, u.legR] as THREE.Object3D[]) { l.rotation.x += -0.3 * a; (l.userData.knee as THREE.Object3D).rotation.x += 0.55 * a; }
      break;
    case "blast":    // bị hất: ngả ra, hai tay quơ lên
      L += -0.4 * a * F; drop += 0.1 * a; if (head) head.rotation.x += -0.5 * a * F;
      for (const b of both) addArm(b, -1.0 * a, 0.75 * a, 0.2 * a);
      for (const l of [u.legL, u.legR] as THREE.Object3D[]) { l.rotation.x += -0.25 * a; (l.userData.knee as THREE.Object3D).rotation.x += 0.4 * a; }
      break;
    case "leg":      // trúng chân: một chân quỵ gối chạm đất, chân kia chống phía trước; thân chúi tới, tay ôm chân
      if (kb > 0) {
        const lh = (sd > 0 ? u.legR : u.legL) as THREE.Object3D, lo = (sd > 0 ? u.legL : u.legR) as THREE.Object3D, kh = lh.userData.knee as THREE.Object3D, ko = lo.userData.knee as THREE.Object3D;
        lh.rotation.x = lerp(lh.rotation.x, 0.12, kb); kh.rotation.x = lerp(kh.rotation.x, 1.7, kb);
        lo.rotation.x = lerp(lo.rotation.x, -1.3, kb); ko.rotation.x = lerp(ko.rotation.x, 1.3, kb);
        lh.rotation.z = lerp(lh.rotation.z, sd * 0.06, kb); lo.rotation.z = lerp(lo.rotation.z, -sd * 0.1, kb);
        drop += 0.3 * kb; L += 0.28 * kb; if (head) head.rotation.x += 0.35 * kb; tw += 0.1 * kb * sd;
        addArm(aS, -0.5 * kb, -0.15 * kb, -0.3 * kb); addArm(aO, 0.3 * kb, 0.2 * kb);
      }
      L += 0.12 * a * F; if (head) head.rotation.x += 0.2 * a;
      break;
  }
  // áp thân: nghiêng quanh HÔNG (chân giữ thẳng đứng), xoay quanh trục dọc, hạ thấp người
  if (head && !dying) { const o = (u.headOff ||= { x: 0, y: 0, z: 0 }); o.x += head.rotation.x - hb.x; o.y += head.rotation.y - hb.y; o.z += head.rotation.z - hb.z; }   // nhớ phần đầu bị cộng thêm để khung sau trừ đi (characters.ts làm mượt đầu từ giá trị này → nếu không trừ sẽ cộng dồn, đầu xoay vòng)
  g.rotation.order = "YXZ";
  g.rotation.x += L; g.rotation.y += tw;
  if (u.hip) { u.hip.rotation.x -= L; u.hip.rotation.y -= tw; }
  g.position.y += -drop + HIP * (1 - Math.cos(L));
  const back = -HIP * Math.sin(L), push = 0.14 * a * (zn === "leg" ? 0.3 : 1);
  g.position.x += back * Math.sin(rot) + info.dx * push; g.position.z += back * Math.cos(rot) + info.dz * push;
  u.layered = true;
}
function clearLayer(g: THREE.Group) { const u = g.userData; if (!u.layered) return; g.rotation.x = 0; g.rotation.z = 0; if (u.hip) u.hip.rotation.x = 0; u.layered = false; }

/** Gọi mỗi khung hình SAU khi tư thế bình thường đã được đặt (animateCrew). */
export function tickHit(e: Entity, dt: number, keepBase = false) {
  if ((e.freeze ?? 0) > 0) e.freeze = Math.max(0, (e.freeze as number) - dt);
  const g = e.g, u = g.userData, h = u.hit as HitState | undefined;
  if (!h) { if (u.layered) { if (!keepBase) clearLayer(g); else { if (u.hip) u.hip.rotation.x = 0; u.layered = false; } } return; }
  h.t += dt;
  if (h.t >= h.dur) { u.hit = undefined; if (!keepBase) clearLayer(g); else { if (u.hip) u.hip.rotation.x = 0; u.layered = false; } return; }
  if (!keepBase) { g.rotation.x = 0; g.rotation.z = 0; } if (u.hip) u.hip.rotation.x = 0;   // (keepBase: người chơi — poseMe đã đặt nền lăn/bơi) nền của bot luôn thẳng đứng → đặt lại rồi cộng phản ứng (tránh cộng dồn qua các khung hình)
  layer(g, e.rot, h.info, h.t, h.dur, h.str, false);
}
export function cancelHit(g: THREE.Group) { g.userData.hit = undefined; clearLayer(g); }

/* ───────────────────────── 3) Gục ngã: đứng → quỳ → đổ ───────────────────────── */
interface Snap { p: number[]; r: number[]; aL: number[]; aR: number[]; lL: number[]; lR: number[]; hd: number[]; hip: number[] }
const rdArm = (a: THREE.Object3D) => [a.rotation.x, a.rotation.y, a.rotation.z, (a.userData.elbow as THREE.Object3D).rotation.x];
const rdLeg = (l: THREE.Object3D) => [l.rotation.x, l.rotation.z, (l.userData.knee as THREE.Object3D).rotation.x];
function read(g: THREE.Group): Snap {
  const u = g.userData;
  return { p: [g.position.x, g.position.y, g.position.z], r: [g.rotation.x, g.rotation.y, g.rotation.z], aL: rdArm(u.armL), aR: rdArm(u.armR), lL: rdLeg(u.legL), lR: rdLeg(u.legR), hd: [u.head.rotation.x, u.head.rotation.y, u.head.rotation.z], hip: [u.hip.rotation.x, u.hip.rotation.y] };
}
function wrArm(a: THREE.Object3D, v: number[], c: number) { a.rotation.set(v[0], v[1], v[2]); (a.userData.elbow as THREE.Object3D).rotation.set(v[3], 0, 0); curlArm(a, c, 0.5); }
function wrLeg(l: THREE.Object3D, v: number[]) { l.rotation.set(v[0], 0, v[1]); (l.userData.knee as THREE.Object3D).rotation.set(v[2], 0, 0); }
function write(g: THREE.Group, s: Snap, curl: number) {
  const u = g.userData; g.rotation.order = "YXZ"; g.rotation.set(s.r[0], s.r[1], s.r[2]); g.position.set(s.p[0], s.p[1], s.p[2]);
  wrArm(u.armL, s.aL, curl); wrArm(u.armR, s.aR, curl); wrLeg(u.legL, s.lL); wrLeg(u.legR, s.lR);
  u.head.rotation.set(s.hd[0], s.hd[1], s.hd[2]); u.hip.rotation.set(s.hip[0], s.hip[1], 0);
}
const mixSnap = (a: Snap, b: Snap, t: number): Snap => ({ p: mix(a.p, b.p, t), r: mix(a.r, b.r, t), aL: mix(a.aL, b.aL, t), aR: mix(a.aR, b.aR, t), lL: mix(a.lL, b.lL, t), lR: mix(a.lR, b.lR, t), hd: mix(a.hd, b.hd, t), hip: mix(a.hip, b.hip, t) });

type Fall = "back" | "front" | "side";
interface Dying {
  info: HitInfo; t: number; T: { a: number; h: number; f: number }; fall: Fall; S0: Snap; K: Snap; pose: number; yaw: number; roll: number;
  x: number; z: number; rot: number; gy: number; pack: boolean; land: () => void; done: () => void; landed: boolean; face: (m: number) => void; force: boolean;
}
const BACK_POSES = [0, 2, 5, 8], FRONT_POSES = [1, 3, 6], SIDE_POSES = [4, 7];
const rnd = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

/** Hướng đổ: bị bắn từ phía trước → ngửa ra sau · từ sau lưng / bị đau bụng / trúng chân → chúi tới · trúng tay / vai → hay nghiêng sang bên. */
function chooseFall(i: HitInfo): Fall {
  const r = Math.random();
  switch (i.zone) {
    case "head": case "chest": case "blast": return i.front > 0 ? "back" : "front";
    case "belly": return i.front > 0 ? (r < 0.75 ? "front" : "side") : "front";
    case "leg": return r < 0.7 ? "front" : "side";
    default: return r < 0.55 ? "side" : i.front > 0 ? "back" : "front";   // vai / tay
  }
}
function kneelPose(S0: Snap, d: { info: HitInfo; fall: Fall; rot: number; x: number; z: number; gy: number }): Snap {
  const { info, fall } = d, sd = info.side, lean = fall === "front" ? 0.3 : fall === "side" ? 0.12 : -0.2, drop = 0.31;
  const half = info.zone === "leg";   // trúng chân: quỳ 1 gối, chân kia chống phía trước
  const kneelHit = [0.1, sd * 0.06, 1.7], kneelBoth = [0.05, 0, 1.6], front = [-1.3, -sd * 0.1, 1.3];
  const lg = (s: number) => (half ? (s === sd ? kneelHit : front) : [kneelBoth[0], s * 0.14, kneelBoth[2]]);
  let aL = [0.12, 0, -0.22, -0.18], aR = [0.12, 0, 0.22, -0.18], hx = fall === "front" ? 0.5 : fall === "back" ? -0.45 : 0.15;
  if (info.zone === "belly") { aL = [-0.9, 0, 0.3, -1.25]; aR = [-0.9, 0, -0.3, -1.25]; hx = 0.65; }
  else if (info.zone === "head") { aL = [0.3, 0, -0.8, -0.1]; aR = [0.3, 0, 0.8, -0.1]; }
  else if (info.zone === "leg") { aL = [-0.7, 0, 0.15, -0.5]; aR = [-0.7, 0, -0.15, -0.5]; }
  else if (info.zone === "arm" || info.zone === "shoulder") { (sd > 0 ? aR : aL).splice(0, 4, 0.3, 0, sd * 0.35, -0.12); (sd > 0 ? aL : aR).splice(0, 4, -0.6, 0, -sd * 0.45, -0.9); }   // tay lành ôm tay bị thương
  const p = [d.x + info.dx * 0.12 - HIP * Math.sin(lean) * Math.sin(d.rot), d.gy - drop + HIP * (1 - Math.cos(lean)), d.z + info.dz * 0.12 - HIP * Math.sin(lean) * Math.cos(d.rot)];
  return { p, r: [lean, d.rot, fall === "side" ? sd * 0.2 : 0], aL, aR, lL: lg(-1), lR: lg(1), hd: [hx, 0, fall === "side" ? sd * 0.25 : 0], hip: [-lean, 0] };
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
/** Độ cao thấp nhất của thân (đầu / vai / lưng / ngực / hông) sau khi xoay — để đặt người chạm đất đúng lúc đổ. */
function lowest(rx: number, ry: number, rz: number, pack: boolean): number {
  _q.setFromEuler(_e.set(rx, ry, rz, "YXZ"));
  const back = pack ? -0.36 : -0.2; let mn = 1e9;
  for (const [x, y, z] of [[0, 1.8, 0], [0, 1.6, 0.22], [0.32, 1.3, 0], [-0.32, 1.3, 0], [0, 1.2, back], [0, 1.2, 0.2], [0, 0.7, back + 0.04], [0, 0.7, 0.2]]) {
    const y2 = _v.set(x, y, z).applyQuaternion(_q).y; if (y2 < mn) mn = y2;
  }
  return mn;
}

export interface DieOpts { x: number; y: number; z: number; rot: number; pack: boolean; info: HitInfo; land: () => void; done: () => void; force?: boolean }
/** Bắt đầu chuỗi gục ngã trên nhân vật `g`. Chốt sẵn tư thế cuối (userData.downPose / downYaw) để layEntity() khớp mượt với hoạt ảnh. */
export function beginDying(g: THREE.Group, o: DieOpts) {   // trả về kiểu đổ + tư thế cuối (người chơi dùng để dựng camera)
  const u = g.userData; cancelHit(g); u.finalSnap = undefined; u.headOff = undefined;
  const info = o.info, fall = chooseFall(info);
  const pose = rnd(fall === "back" ? BACK_POSES : fall === "front" ? FRONT_POSES : SIDE_POSES);
  const yaw = clamp(-info.side * 0.3 + (Math.random() - 0.5) * 0.6, -0.7, 0.7);
  u.downPose = pose; u.downYaw = yaw;
  const S0 = read(g), gy = Math.max(groundAt(o.x, o.z), groundAt(o.x - Math.sin(o.rot + yaw) * 0.9, o.z - Math.cos(o.rot + yaw) * 0.9));
  // mốc thời gian (giây): a = sụp xong xuống quỳ · h = hết giữ tư thế quỳ · f = nằm yên hẳn
  const T = info.zone === "head" ? { a: 0.32, h: 0.42, f: 1.12 } : info.zone === "blast" ? { a: 0.4, h: 0.45, f: 1.15 } : info.zone === "leg" ? { a: 0.55, h: 0.95, f: 1.7 } : { a: 0.8, h: 1.15, f: 1.85 };
  const K = kneelPose(S0, { info, fall, rot: o.rot, x: o.x, z: o.z, gy });
  u.dying = { info, t: 0, T, fall, S0, K, pose, yaw, roll: POSES[pose].roll, x: o.x, z: o.z, rot: o.rot, gy, pack: o.pack, land: o.land, done: o.done, landed: false, face: (m: number) => u.face?.(m), force: !!o.force } as Dying;
  u.face?.(1);
  return { fall, pose, T, lat: fall === "side" ? Math.sign(POSES[pose].roll) : 0 };
}
export const isDying = (g: THREE.Group) => !!g.userData.dying;

/** Chạy hoạt ảnh gục ngã mỗi khung hình. Trả về true ở khung hình kết thúc. */
export function tickDying(g: THREE.Group, dt: number): boolean {
  const u = g.userData, d = u.dying as Dying | undefined; if (!d) return false;
  if (G.phase !== "play" && !d.force) d.t = d.T.f + 1;            // họp khẩn / hết ván: gục ngay, không để hoạt ảnh chồng lên cảnh khác
  d.t += dt; const t = d.t, { a, h, f } = d.T;
  const gr = u.gunRig; if (gr && t > 0.16) { gr.pivot.visible = false; if (gr.extra) gr.extra.visible = false; }   // tay buông → súng rời tay
  const mat = u.m as THREE.MeshStandardMaterial | undefined, gk = lerp(1, 0.54, sstep(t / f)); if (mat) mat.color.setRGB(gk, gk, gk);   // xám dần khi mất sức sống
  if (t >= f) {   // xong: khớp đúng tư thế xác của corpse.ts
    u.dying = undefined; u.finalSnap = undefined; u.layered = false;
    if (!d.landed) { d.landed = true; d.land(); }
    layDown(g, d.x, d.z, d.rot, d.pose, d.yaw, d.pack); u.face?.(2 + (d.pose % 3)); d.done(); return true;
  }
  if (t < h) {   // (1) giật theo vùng trúng + sụp xuống quỳ → (2) quỳ gục đầu, lắc nhẹ
    const k = sstep(t / a), sway = Math.sin(t * 7.5) * 0.045 * (1 - sstep(t / h)), S = mixSnap(d.S0, d.K, k);
    S.r[2] += sway; S.hd[0] += Math.sin(t * 3.1) * 0.05 * sstep((t - a) / 0.3);
    write(g, S, lerp(0.9, 0.35, k));
    const tl = Math.min(0.9, a + 0.2, h); if (t < tl) layer(g, d.rot, d.info, t, 0.9, d.info.str * 1.15 * (1 - sstep((t - (tl - 0.25)) / 0.25)), true);   // giật theo vùng trúng rồi nhạt dần khi đã sụp xuống
    d.face(t > a * 0.85 ? 4 : 1);
    return false;
  }
  // (3) gục: nghiêng dần về tư thế nằm, tăng tốc như bị trọng lực kéo; thân chạm đất nhờ bộ giải va chạm
  const w = (t - h) / (f - h), e2 = clamp(w * w * (1.6 - 0.6 * w), 0, 1), c = sstep(w), P = POSES[d.pose], fin = finalSnap(g, d);
  const S = mixSnap(d.K, fin, c);
  S.r = [lerp(d.K.r[0], P.lean, e2), lerp(d.K.r[1], d.rot + d.yaw, c), lerp(d.K.r[2], P.roll, e2)];
  S.hip = [lerp(d.K.hip[0], 0, c), lerp(d.K.hip[1], fin.hip[1], c)];
  S.p[0] = lerp(d.K.p[0], fin.p[0], c); S.p[2] = lerp(d.K.p[2], fin.p[2], c);
  const solve = d.gy + 0.03 - lowest(S.r[0], S.r[1], S.r[2], d.pack), lin = lerp(d.K.p[1], fin.p[1], c);   // không xuyên đất, nhưng liên tục với tư thế quỳ lúc bắt đầu và tư thế nằm lúc kết thúc
  S.p[1] = Math.max(lin, Math.min(solve, fin.p[1] + 0.05));
  write(g, S, 0.35);
  if (!d.landed && w > 0.55) { d.landed = true; d.land(); d.face(2 + (d.pose % 3)); }
  return false;
}
/** Tư thế nằm cuối cùng (vị trí + tay chân) lấy đúng từ layDown rồi khôi phục lại tư thế đang chạy — chỉ tính 1 lần cho mỗi lần gục. */
function finalSnap(g: THREE.Group, d: Dying): Snap {
  const u = g.userData; if (u.finalSnap) return u.finalSnap as Snap;
  const keep = read(g), gr = u.gunRig, pv = gr ? [gr.pivot.visible, gr.extra?.visible] : null;
  layDown(g, d.x, d.z, d.rot, d.pose, d.yaw, d.pack); const fin = read(g);
  write(g, keep, 0.35); if (gr && pv) { gr.pivot.visible = pv[0]; if (gr.extra) gr.extra.visible = pv[1]; }
  u.finalSnap = fin; return fin;
}


/* ───────────────────────── 4) NGƯỜI CHƠI bị bắn / bị hạ ─────────────────────────
 * Góc thứ ba: avatar dùng đúng hiệu ứng như bot (reactHit / beginDying).
 * Góc thứ nhất: camera + súng/tay trên màn hình phản ứng theo vùng trúng (PV, camera.ts đọc mỗi khung hình).
 */
/** Độ lệch cộng thêm cho camera / viewmodel ở góc thứ nhất (đã tính xong mỗi khung hình) */
export const PV = { pitch: 0, yaw: 0, roll: 0, dy: 0, back: 0, slow: 1, vx: 0, vy: 0, vz: 0, vrx: 0, vrz: 0, hx: 0, hy: 0 };
const PL = { last: null as null | { info: HitInfo; at: number }, st: null as null | HitState, legCool: 0 };
/** Vùng trúng của người chơi: Bot bắn không nhắm vùng cụ thể nên chọn ngẫu nhiên theo tỉ lệ thực tế (đầu hiếm, thân nhiều, chân ít). */
const pickZone = (): Zone => { const r = Math.random(); return r < 0.06 ? "head" : r < 0.27 ? "chest" : r < 0.41 ? "belly" : r < 0.56 ? "shoulder" : r < 0.73 ? "arm" : "leg"; };
function playerInfo(e: { x: number; z: number; rot: number }, from: { x: number; z: number } | null, dmg: number, blast: boolean): HitInfo {
  if (blast && from) return classifyBlast(e, from, dmg);
  const base = from ? classifyBlast(e, from, dmg) : { front: Math.random() < 0.5 ? 1 : -1, dx: 0, dz: 0 };
  const dx = from ? base.dx : -Math.sin(e.rot) * base.front, dz = from ? base.dz : -Math.cos(e.rot) * base.front;
  return { zone: pickZone(), side: Math.random() < 0.5 ? 1 : -1, front: base.front, dx, dz, str: clamp(0.65 + dmg / 55, 0.7, 1.25) };
}
/** Người chơi trúng đạn / nổ (hostile.ts, combat.ts gọi). from = vị trí kẻ bắn / tâm nổ. Luôn ghi nhớ để cảnh chết biết hướng đạn. */
export function hitPlayer(e: Entity, from: { x: number; z: number } | null, dmg: number, blast = false) {
  const info = playerInfo(e, from, dmg, blast); PL.last = { info, at: performance.now() };
  if (G.ghost || G.phase !== "play") return;
  if (PL.st && PL.st.info.zone === "leg" && PL.st.t < 1.4) return;          // đang quỳ thì không bị ngắt
  if (PL.st && PL.st.t < 0.25 && !blast) return;                              // xả liên thanh: không giật lại mỗi viên
  if (info.zone === "leg") { if (PL.legCool > 0) info.zone = "chest"; else PL.legCool = 6; }   // quỳ gối tối đa 1 lần / 6 s (không bị khoá chân liên tục)
  PL.st = { info, t: 0, dur: durOf(info.zone), str: info.str };
  reactHit(e, info);
}
/** Tính PV cho khung hình này (gọi trong updateCamera). */
export function tickPlayerView(dt: number) {
  PL.legCool = Math.max(0, PL.legCool - dt);
  for (const k of Object.keys(PV) as (keyof typeof PV)[]) PV[k] = 0; PV.slow = 1;
  const s = PL.st; if (!s) return;
  if (G.ghost || G.phase !== "play") { PL.st = null; return; }
  s.t += dt; if (s.t >= s.dur) { PL.st = null; return; }
  const { zone, side: sd, front: F } = s.info, a = env(s.t / s.dur) * s.str, kb = zone === "leg" ? kenv(s.t) : 0;
  PV.slow = 1 - 0.2 * Math.min(1, a) - 0.65 * kb;
  switch (zone) {
    case "head":     PV.pitch = 0.2 * a * F; PV.roll = 0.1 * a * sd; PV.dy = -0.03 * a; PV.vy = -0.05 * a; PV.vrx = 0.2 * a; break;                       // đầu giật ra sau, súng khựng
    case "shoulder": PV.yaw = 0.1 * a * sd * F; PV.roll = 0.06 * a * sd; PV.vz = 0.1 * a * F; PV.vy = -0.07 * a; PV.vx = sd * 0.05 * a; PV.hx = -sd * 0.1 * a; break;   // vai bật ra sau, cả thân xoay
    case "arm":      PV.roll = 0.05 * a * sd; if (sd > 0) { PV.vy = -0.16 * a; PV.vx = 0.1 * a; PV.vrx = 0.55 * a; PV.vrz = -0.3 * a; } else { PV.hx = -0.18 * a; PV.hy = -0.2 * a; PV.vy = -0.04 * a; } break;   // tay phải: súng tuột xuống / tay trái: bật khỏi ốp
    case "chest":    PV.pitch = 0.13 * a * F; PV.back = 0.07 * a * F; PV.vz = 0.08 * a; PV.vy = -0.05 * a; PV.dy = -0.02 * a; break;
    case "belly":    PV.pitch = -0.28 * a * F; PV.dy = -0.12 * a; PV.vy = -0.12 * a; PV.hy = -0.1 * a; break;                                          // gập người, cúi đầu
    case "blast":    PV.pitch = 0.25 * a * F; PV.roll = 0.15 * a * sd; PV.dy = -0.1 * a; PV.vy = -0.1 * a; PV.vrx = 0.3 * a; break;
    case "leg":      PV.dy = -0.34 * kb; PV.pitch = -0.14 * kb; PV.roll = 0.05 * kb * sd; PV.vy = -0.06 * kb; PV.back = -0.04 * kb; break;               // quỵ gối: mắt tụt xuống, đầu cúi
  }
}

/** Cảnh người chơi bị hạ. DV lưu kiểu đổ để camera góc thứ nhất đi theo cùng nhịp với avatar. */
export const DV = { fall: "back" as Fall, lat: 0, T: { a: 0.8, h: 1.15, f: 1.85 } };
export function beginPlayerDying(e: Entity, pack: boolean) {
  const rec = PL.last && performance.now() - PL.last.at < 2500 ? PL.last.info : playerInfo(e, null, 30, false);
  rec.str = Math.max(rec.str, 1);
  const r = beginDying(e.g, { x: e.x, y: e.y, z: e.z, rot: e.rot, pack, info: rec, land: () => {}, done: () => {}, force: true });
  DV.fall = r.fall; DV.lat = r.lat; DV.T = r.T; PL.st = null;
  return r;
}
/** Camera góc thứ nhất lúc chết: t = giây kể từ lúc chết. pitch dương = ngước lên · lat dương = sang trái · fwd = tiến / lùi theo hướng nhìn. */
export function deathView(t: number) {
  const { a, h, f } = DV.T, k = sstep(t / a), w = clamp((t - h) / (f - h), 0, 1), e2 = w * w * (1.6 - 0.6 * w), c = sstep(w);
  const sway = Math.sin(t * 7.5) * 0.04 * (1 - sstep(t / h)) , droop = 0.25 * k;
  let dy = -0.72 * k - 0.6 * c, pitch = -droop, roll = sway, lat = 0, fwd = 0;
  if (DV.fall === "back") { pitch = -droop + (droop + 1.25) * e2; fwd = -0.5 * c; }              // ngả ra sau: nhìn lên trời
  else if (DV.fall === "front") { pitch = -droop - 1.0 * e2; fwd = 0.45 * c; dy -= 0.05 * c; }   // chúi tới: úp mặt xuống đất
  else { roll = sway + DV.lat * 1.5 * e2; lat = DV.lat * 0.5 * c; pitch = -droop - 0.25 * e2; }   // nghiêng sang bên
  return { dy, pitch, roll, lat, fwd, k: sstep(t / (a * 0.9)) };
}
