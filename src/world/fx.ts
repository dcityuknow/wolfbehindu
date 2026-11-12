import * as THREE from "three";
import { scene } from "./scene";

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

/* ── nổ lựu đạn: quả cầu lửa + vòng sóng xung kích + ánh sáng (1 PointLight cố định, không thêm/bớt đèn lúc chơi) ── */
const exLight = new THREE.PointLight(0xffa24a, 0, 24, 2); scene.add(exLight);
const sGeo = new THREE.SphereGeometry(1, 12, 8), rGeo = new THREE.RingGeometry(0.85, 1, 28);
interface Ex { core: THREE.Mesh; ring: THREE.Mesh; t: number; r: number }
const exs: Ex[] = [];
export function explosion(p: THREE.Vector3, radius: number) {
  const core = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  const ring = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; core.position.copy(p); ring.position.set(p.x, 0.08, p.z); scene.add(core, ring);
  exs.push({ core, ring, t: 0, r: radius });
  burst(p, "fire", 16, 7, 0.16, 0.7, 2.5); burst(p, "dust", 14, 6, 0.22, 0.9, 1.5); exLight.position.copy(p).setY(1.5);
}

export function updateFx(dt: number) {
  for (const o of tr) if (o.m.visible && (o.t -= dt) <= 0) o.m.visible = false;
  for (const o of parts) {
    if (!o.m.visible) continue;
    if ((o.t -= dt) <= 0) { o.m.visible = false; continue; }
    o.v.y -= 9 * dt; o.m.position.addScaledVector(o.v, dt);
    if (o.m.position.y < 0.03) { o.m.position.y = 0.03; o.v.set(o.v.x * 0.4, 0, o.v.z * 0.4); }
    o.m.scale.setScalar(o.s * (o.t / o.t0));
  }
  let light = 0;
  for (let i = exs.length - 1; i >= 0; i--) {
    const e = exs[i]; e.t += dt; const k = e.t / 0.55;
    if (k >= 1) { scene.remove(e.core, e.ring); (e.core.material as THREE.Material).dispose(); (e.ring.material as THREE.Material).dispose(); exs.splice(i, 1); continue; }
    e.core.scale.setScalar(0.4 + k * e.r * 0.45); (e.core.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    e.ring.scale.setScalar(0.5 + k * e.r); (e.ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    light = Math.max(light, (1 - k) * 70);
  }
  exLight.intensity = light;
}
