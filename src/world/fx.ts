import * as THREE from "three";
import { scene } from "./scene";
import { groundAt, WATER_Y } from "./island";

/** Hiệu ứng chiến đấu: vệt đạn, tia lửa/bụi/máu, nổ lựu đạn. Mọi vật thể đều dùng lại (pool) — không sinh rác mỗi phát bắn. */
const bGeo = new THREE.BoxGeometry(1, 1, 1);

/* ── vệt đạn ── */
const tMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, fog: false });
const tr = Array.from({ length: 32 }, () => { const m = new THREE.Mesh(bGeo, tMat); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, t: 0 }; });
let ti = 0;
export function tracer(a: THREE.Vector3, b: THREE.Vector3) {
  const len = a.distanceTo(b); if (len < 0.5) return;
  const o = tr[ti++ % tr.length]; o.t = 0.07; o.m.visible = true;
  o.m.position.copy(a).add(b).multiplyScalar(0.5); o.m.scale.set(0.014, 0.014, len); o.m.lookAt(b);
}

/* ── hạt (tia lửa, bụi, máu, nước, lửa) ── */
export type Kind = "dust" | "spark" | "blood" | "water" | "fire";
const PM: Record<Kind, THREE.MeshBasicMaterial> = {
  dust: new THREE.MeshBasicMaterial({ color: 0xcdb98c }), spark: new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  blood: new THREE.MeshBasicMaterial({ color: 0xb81c1c }), water: new THREE.MeshBasicMaterial({ color: 0xaee0ff }), fire: new THREE.MeshBasicMaterial({ color: 0xff9a2a, fog: false }),
};
const parts = Array.from({ length: 140 }, () => { const m = new THREE.Mesh(bGeo, PM.dust); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, v: new THREE.Vector3(), t: 0, t0: 1, s: 0.06 }; });
let pi = 0;
export function burst(p: THREE.Vector3, kind: Kind, n: number, speed = 3, size = 0.07, life = 0.5, up = 1.5) {
  for (let k = 0; k < n; k++) {
    const o = parts[pi++ % parts.length]; o.m.material = PM[kind]; o.m.position.copy(p);
    o.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.7 + up, (Math.random() - 0.5) * speed);
    o.t = o.t0 = life * (0.6 + Math.random() * 0.6); o.s = size * (0.6 + Math.random() * 0.8); o.m.scale.setScalar(o.s); o.m.visible = true;
  }
}
export const impact = (p: THREE.Vector3, kind: Kind) => burst(p, kind, kind === "blood" ? 7 : 5, 2.6, 0.06, 0.45, 0.8);



/* ── lỗ đạn trên tường / đất / đá (decal, vòng đệm 80 lỗ) ── */
const hGeo = new THREE.PlaneGeometry(1, 1), hMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const hRimMat = new THREE.MeshBasicMaterial({ color: 0x3a3226, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const holes = Array.from({ length: 80 }, () => {
  const g = new THREE.Group(), rim = new THREE.Mesh(hGeo, hRimMat), core = new THREE.Mesh(hGeo, hMat); rim.scale.setScalar(2); core.position.z = 0.001; g.add(rim, core);   // vành cháy sém + lỗ đen
  g.visible = false; scene.add(g); return g;
});
let hoi = 0;
/** Lỗ đạn tại p, mặt phẳng vuông góc với pháp tuyến n. */
export function hole(p: THREE.Vector3, n: THREE.Vector3) {
  const g = holes[hoi++ % holes.length], s = 0.07 + Math.random() * 0.03;
  g.position.copy(p).addScaledVector(n, 0.015); g.lookAt(_hp.copy(p).add(n)); g.rotateZ(Math.random() * 6.28); g.scale.setScalar(s); g.visible = true;
}
const _hp = new THREE.Vector3();

/* ── nước tóe: cột nước + vòng sóng lan trên mặt nước ── */
const wRing = new THREE.RingGeometry(0.85, 1, 28);
const ringPool = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(wRing, new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; scene.add(m); return { m, t: 0, r: 1 }; });
let rpi = 0;
export function splash(p: THREE.Vector3, big = 1) {
  const q = new THREE.Vector3(p.x, WATER_Y + 0.05, p.z);
  burst(q, "water", Math.round(18 * big), 3.6 * big, 0.09, 0.75, 3.8 * big);
  const o = ringPool[rpi++ % ringPool.length]; o.t = 0.6; o.r = 1.3 * big; o.m.position.copy(q); o.m.visible = true;
}


/* ── nổ dưới nước: cột nước trắng phọt cao + bọt tung toé + 3 vòng sóng ── */
const colGeo = new THREE.CylinderGeometry(0.7, 1, 1, 14, 1, true);
interface Col { m: THREE.Mesh; t: number; h: number }
const cols: Col[] = [];
export function waterBlast(p: THREE.Vector3, radius: number) {
  const q = new THREE.Vector3(p.x, WATER_Y + 0.05, p.z), k = radius / 6.5;
  burst(q, "water", 46, 9 * k, 0.14, 1.1, 9 * k); burst(q, "water", 26, 4 * k, 0.2, 1.4, 12 * k);
  splash(q, 3.2 * k);
  setTimeout(() => splash(q, 4.6 * k), 90); setTimeout(() => splash(q, 6 * k), 190);
  const m = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  m.position.copy(q); scene.add(m); cols.push({ m, t: 0.9, h: 7 * k });
  exLight.position.copy(q).setY(WATER_Y + 1.5); exLight.color.setHex(0x9fd8ff); lightKick = 40;
}
let lightKick = 0;

/* ── bơi: bọt nước bắn lên theo nhịp tay, sóng lan, bọt phía sau; nhảy xuống nước thì tóe lớn ── */
let swT = 0, swR = 0, wasIn = false;
export function swimFx(dt: number, x: number, z: number, rot: number, inWater: boolean, swimming: boolean, speed: number) {
  if (inWater && !wasIn) splash(_hp.set(x, WATER_Y, z), 1.6);   // vừa xuống nước
  wasIn = inWater;
  if (!inWater) return;
  swT -= dt; swR -= dt;
  const fx = Math.sin(rot), fz = Math.cos(rot), rx = Math.cos(rot), rz = -Math.sin(rot);
  if (swimming && swT <= 0) {   // mỗi nhịp quạt tay: bọt bắn lên từ hai bên vai + bọt kéo theo sau
    swT = 0.13; const side = Math.random() < 0.5 ? -1 : 1, k = Math.min(1, speed / 4);
    _hq.set(x + fx * 0.5 + rx * 0.4 * side, WATER_Y + 0.05, z + fz * 0.5 + rz * 0.4 * side);
    burst(_hq, "water", 5, 2.2 + 1.2 * k, 0.07, 0.6, 2.4 + 1.4 * k);
    _hq.set(x - fx * 0.5, WATER_Y + 0.05, z - fz * 0.5); burst(_hq, "water", 3, 1.4, 0.06, 0.5, 1.2);
  }
  if ((swimming || speed > 0.3) && swR <= 0) { swR = swimming ? 0.32 : 0.7; splash(_hq.set(x - fx * 0.3, WATER_Y, z - fz * 0.3), 0.35); }
  else if (!swimming && swR <= 0) { swR = 1.4; splash(_hq.set(x, WATER_Y, z), 0.25); }   // đứng đạp nước: gợn nhẹ
}
const _hq = new THREE.Vector3();

/* ── mảnh vỡ bay / rơi có trọng lực: băng đạn cũ rơi xuống đất, chốt lựu đạn bị giật bay đi ── */
interface Deb { m: THREE.Object3D; v: THREE.Vector3; sp: THREE.Vector3; t: number }
const debs: Deb[] = [];
const magGeo = new THREE.BoxGeometry(0.04, 0.12, 0.06), magM = { blue: new THREE.MeshStandardMaterial({ color: 0x3a7fe0, roughness: 0.6 }), yel: new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.6 }) };
const pinMat = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.35, metalness: 0.8 }), pinRing = new THREE.TorusGeometry(0.02, 0.005, 5, 10), pinStem = new THREE.BoxGeometry(0.05, 0.01, 0.01);
function addDeb(m: THREE.Object3D, p: THREE.Vector3, v: THREE.Vector3, life: number) {
  m.position.copy(p); scene.add(m);
  debs.push({ m, v: v.clone(), sp: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), t: life });
  if (debs.length > 24) { const o = debs.shift()!; scene.remove(o.m); }
}
/** Băng đạn cũ rơi khỏi súng ở vị trí p. */
export function dropMag(p: THREE.Vector3, pistol: boolean) {
  const m = new THREE.Mesh(magGeo, pistol ? magM.blue : magM.yel); m.castShadow = true;
  addDeb(m, p, new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.5, (Math.random() - 0.5) * 0.8), 4);
}
/** Chốt lựu đạn bị giật ra, bay theo hướng v. */
export function flyPin(p: THREE.Vector3, v: THREE.Vector3) {
  const g = new THREE.Group(), r = new THREE.Mesh(pinRing, pinMat), s = new THREE.Mesh(pinStem, pinMat); s.position.x = 0.03; g.add(r, s);
  addDeb(g, p, v, 2.5);
}

/* ── nổ lựu đạn: quả cầu lửa + vòng sóng xung kích + ánh sáng (1 PointLight cố định, không thêm/bớt đèn lúc chơi) ── */
const exLight = new THREE.PointLight(0xffa24a, 0, 24, 2); scene.add(exLight);
const sGeo = new THREE.SphereGeometry(1, 12, 8), rGeo = new THREE.RingGeometry(0.85, 1, 28);
interface Ex { core: THREE.Mesh; ring: THREE.Mesh; t: number; r: number }
const exs: Ex[] = [];
export function explosion(p: THREE.Vector3, radius: number) {
  const core = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  const ring = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; core.position.copy(p); ring.position.set(p.x, Math.max(groundAt(p.x, p.z), p.y - 1.4) + 0.08, p.z); scene.add(core, ring);
  exs.push({ core, ring, t: 0, r: radius });
  burst(p, "fire", 16, 7, 0.16, 0.7, 2.5); burst(p, "dust", 14, 6, 0.22, 0.9, 1.5); exLight.position.copy(p).setY(1.5);
}

export function updateFx(dt: number) {
  for (const o of tr) if (o.m.visible && (o.t -= dt) <= 0) o.m.visible = false;
  for (const o of parts) {
    if (!o.m.visible) continue;
    if ((o.t -= dt) <= 0) { o.m.visible = false; continue; }
    o.v.y -= 9 * dt; o.m.position.addScaledVector(o.v, dt);
    const gy = groundAt(o.m.position.x, o.m.position.z) + 0.03; if (o.m.position.y < gy) { o.m.position.y = gy; o.v.set(o.v.x * 0.4, 0, o.v.z * 0.4); }
    o.m.scale.setScalar(o.s * (o.t / o.t0));
  }
  for (let i = cols.length - 1; i >= 0; i--) {
    const c = cols[i]; c.t -= dt; if (c.t <= 0) { scene.remove(c.m); (c.m.material as THREE.Material).dispose(); cols.splice(i, 1); continue; }
    const k = 1 - c.t / 0.9, up = Math.sin(Math.min(1, k * 1.6) * Math.PI / 2); c.m.scale.set(0.8 + k * 1.2, Math.max(0.01, c.h * up), 0.8 + k * 1.2); c.m.position.y = WATER_Y + 0.05 + c.m.scale.y / 2;
    (c.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k * k);
  }
  for (const o of ringPool) {
    if (!o.m.visible) continue;
    o.t -= dt; if (o.t <= 0) { o.m.visible = false; continue; }
    const k = 1 - o.t / 0.6; o.m.scale.setScalar(0.2 + k * o.r); (o.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
  }
  for (let i = debs.length - 1; i >= 0; i--) {
    const o = debs[i]; o.t -= dt; if (o.t <= 0) { scene.remove(o.m); debs.splice(i, 1); continue; }
    o.v.y -= 12 * dt; o.m.position.addScaledVector(o.v, dt);
    const gy = groundAt(o.m.position.x, o.m.position.z) + 0.03;
    if (o.m.position.y < gy) { o.m.position.y = gy; o.v.set(o.v.x * 0.3, Math.abs(o.v.y) > 2 ? -o.v.y * 0.25 : 0, o.v.z * 0.3); o.sp.multiplyScalar(0.4); }
    o.m.rotation.x += o.sp.x * dt; o.m.rotation.y += o.sp.y * dt; o.m.rotation.z += o.sp.z * dt;
  }
  let light = 0;
  for (let i = exs.length - 1; i >= 0; i--) {
    const e = exs[i]; e.t += dt; const k = e.t / 0.55;
    if (k >= 1) { scene.remove(e.core, e.ring); (e.core.material as THREE.Material).dispose(); (e.ring.material as THREE.Material).dispose(); exs.splice(i, 1); continue; }
    e.core.scale.setScalar(0.4 + k * e.r * 0.45); (e.core.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    e.ring.scale.setScalar(0.5 + k * e.r); (e.ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    light = Math.max(light, (1 - k) * 70);
  }
  if (lightKick > 0) { light = Math.max(light, lightKick); lightKick = Math.max(0, lightKick - dt * 120); if (lightKick === 0) exLight.color.setHex(0xffa24a); }
  exLight.intensity = light;
}
