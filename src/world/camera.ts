import * as THREE from "three";
import { camera, scene, canvasEl } from "./scene";
import { wallMeshes } from "./map";
import { me } from "./characters";
import { G } from "../state";
import { SQUAD, GUNS } from "../config";
import { defOf } from "./soldier";
import { buildGun, type GunRig } from "./guns";
import { W } from "../weaponState";
import { CINE } from "./cineState";

/** Camera 3 chế độ: thứ ba (qua vai) · thứ nhất · từ trên xuống. Quy ước: hướng nhìn = (sin yaw, cos yaw). */
export type ViewMode = "third" | "first" | "top";
export const rig = { mode: "third" as ViewMode, yaw: Math.PI, pitch: 0.5, dist: 6, locked: false };
const ORDER: ViewMode[] = ["third", "first", "top"], LABEL: Record<ViewMode, string> = { third: "Góc thứ 3", first: "Góc thứ 1", top: "Từ trên xuống" };

export const facing = (m: { rot: number }) => (rig.mode === "top" ? m.rot : rig.yaw);
export function setView(v: ViewMode) {
  rig.mode = v; if (v === "top") rig.yaw = Math.PI;
  rig.pitch = v === "first" ? 0 : 0.5;
  if (v === "top" && document.pointerLockElement) document.exitPointerLock();
  const b = document.getElementById("bView"); if (b) b.textContent = `📷 ${LABEL[v]} (V)`;
}
export const cycleView = () => setView(ORDER[(ORDER.indexOf(rig.mode) + 1) % 3]);

export function bindMouse() {
  const S = 0.0023; let drag = false;
  canvasEl.addEventListener("mousedown", () => { drag = true; });
  addEventListener("mouseup", () => { drag = false; });
  canvasEl.addEventListener("click", () => { if (rig.mode !== "top" && G.phase === "play" && !G.mini && !rig.locked) canvasEl.requestPointerLock?.(); });
  document.addEventListener("pointerlockchange", () => { rig.locked = document.pointerLockElement === canvasEl; });
  addEventListener("mousemove", (e) => {
    if (rig.mode === "top" || !(rig.locked || drag) || G.phase !== "play" || G.mini) return;
    rig.yaw -= e.movementX * S; rig.pitch += e.movementY * S;
    rig.pitch = Math.max(rig.mode === "first" ? -1.35 : -0.15, Math.min(rig.mode === "first" ? 1.35 : 1.15, rig.pitch));
  });
  canvasEl.addEventListener("wheel", (e) => { if (rig.mode === "third") rig.dist = Math.max(2.5, Math.min(9, rig.dist + Math.sign(e.deltaY) * 0.5)); }, { passive: true });
}

// Súng + hai tay hiện trước mặt ở góc nhìn thứ nhất (viewmodel). Mỗi súng một bộ, chỉ hiện súng đang cầm.
const VM: Record<string, { p: [number, number, number]; s: number; ads: [number, number, number] }> = {
  pistol: { p: [0.2, -0.2, -0.5], s: 1, ads: [0, -0.14, -0.5] },
  smg: { p: [0.22, -0.2, -0.55], s: 0.9, ads: [0, -0.15, -0.5] },
  rifle: { p: [0.24, -0.22, -0.6], s: 0.75, ads: [0, -0.16, -0.5] },
  shotgun: { p: [0.24, -0.22, -0.6], s: 0.7, ads: [0, -0.16, -0.5] },
};
export const viewGuns: THREE.Group[] = [];
{
  const d0 = defOf(SQUAD[0]), sleeve = d0.uni.pal[Math.min(1, d0.uni.pal.length - 1)] as number, glove = (d0.glove ?? d0.skin) as number;
  const mSleeve = new THREE.MeshStandardMaterial({ color: sleeve }), mGlove = new THREE.MeshStandardMaterial({ color: glove });
  for (const def of GUNS) {
    const vg = buildGun(def.id), arm = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); vg.add(k); return k; };
    const f = vg.userData.fore as THREE.Vector3;
    arm(0.085, 0.085, 0.55, -0.03, -0.07, -0.32, mSleeve); arm(0.08, 0.1, 0.12, 0, -0.045, -0.02, mGlove);              // tay cầm báng
    arm(0.085, 0.085, 0.6, f.x + 0.08, f.y - 0.05, f.z - 0.3, mSleeve).rotation.y = -0.25; arm(0.085, 0.095, 0.12, f.x, f.y - 0.02, f.z, mGlove); // tay đỡ nòng
    vg.rotation.y = Math.PI; vg.visible = false; camera.add(vg); viewGuns.push(vg);
  }
  scene.add(camera);
}
/** Vị trí đầu nòng trong thế giới (điểm xuất phát vệt đạn). */
export function muzzleWorld(out: THREE.Vector3) {
  const o: THREE.Object3D = rig.mode === "first" ? viewGuns[W.cur] : (me().g.userData.gunRig as GunRig).models[GUNS[W.cur].id]!;
  o.updateWorldMatrix(true, false);
  return out.copy(o.userData.muzzle as THREE.Vector3).applyMatrix4(o.matrixWorld);
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

const ray = new THREE.Raycaster(), V = new THREE.Vector3(), tgt = new THREE.Vector3();
let bob = 0, lastX = 0, lastZ = 0;
const cross = document.getElementById("cross")!, hint = document.getElementById("lockhint")!;
const setDisp = (el: HTMLElement, on: boolean) => { const v = on ? "block" : "none"; if (el.style.display !== v) el.style.display = v; };
/** overview = họp/eject (camera cố định nhìn bàn), menu = quay quanh trạm làm nền cho màn giới thiệu. */
export function updateCamera(dt: number, t: number, shake: number) {
  if (CINE.active) return;   // cảnh mở đầu 3D tự điều khiển camera (world/cine3d.ts)
  const m = me(), sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  if (document.pointerLockElement && (G.mini || G.phase !== "play")) document.exitPointerLock();
  viewGuns.forEach((v) => (v.visible = false));
  const playing = G.phase === "play" && !G.mini;
  setDisp(cross, playing && rig.mode !== "top" && !G.ghost); setDisp(hint, playing && rig.mode !== "top" && !rig.locked);
  const fov = (rig.mode === "first" ? 78 : rig.mode === "top" ? 55 : 66) * (1 - 0.38 * W.adsT);   // ngắm (chuột phải) = zoom
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }

  if (G.phase === "menu") { // quay quanh đảo
    const a = t * 0.07; camera.position.set(Math.sin(a) * 68, 30, Math.cos(a) * 68); camera.lookAt(0, -2, 0); return;
  }
  if (G.phase === "meet" || (G.phase === "end")) { // họp: nhìn bàn tròn từ trên cao, hơi lắc nhẹ
    const a = t * 0.12; camera.position.set(Math.sin(a) * 3, 10.5, 9 + Math.cos(a) * 1.2); camera.lookAt(0, 0.5, 0); return;
  }
  if (rig.mode === "first") {
    const moving = Math.hypot(m.x - lastX, m.z - lastZ) > 0.001; bob += moving ? dt * 9 : 0;
    camera.position.set(m.x + sx, m.y + 1.62 + (moving ? Math.sin(bob) * 0.035 : 0), m.z + sz);
    camera.rotation.set(-(rig.pitch - W.recoil), rig.yaw + Math.PI, 0);
    if (!G.ghost) {
      const vg = viewGuns[W.cur], c = VM[GUNS[W.cur].id], ads = W.adsT, rel = W.reload > 0 ? Math.sin(Math.PI * (1 - W.reload / W.reloadDur)) : 0;
      vg.visible = true; vg.scale.setScalar(c.s);
      vg.position.set(lerpN(c.p[0], c.ads[0], ads), lerpN(c.p[1], c.ads[1], ads) - rel * 0.2 - W.swapT * 0.4 + (moving ? Math.sin(bob) * 0.012 : 0), lerpN(c.p[2], c.ads[2], ads) + W.kick * 0.07);
      vg.rotation.set(W.kick * 0.12 - rel * 0.7, Math.PI, rel * 0.35);
    }
    me().g.visible = false;
  } else if (rig.mode === "third") {
    me().g.visible = true;
    const px = m.x, py = m.y + 1.6, pz = m.z;
    const cp = Math.cos(rig.pitch), L = V.set(Math.sin(rig.yaw) * cp, -Math.sin(rig.pitch), Math.cos(rig.yaw) * cp);
    const rx = -Math.cos(rig.yaw) * 0.55, rz = Math.sin(rig.yaw) * 0.55;               // lệch qua vai phải
    const ox = px + rx, oz = pz + rz; let d = rig.dist;
    ray.set(tgt.set(ox, py, oz), V.clone().negate()); ray.far = d + 0.4;               // camera không xuyên tường
    const hit = ray.intersectObjects(wallMeshes)[0]; if (hit) d = Math.max(1.6, hit.distance - 0.35);
    camera.position.set(ox - L.x * d + sx, Math.max(0.5, py - L.y * d), oz - L.z * d + sz);
    camera.rotation.set(-(rig.pitch - W.recoil), rig.yaw + Math.PI, 0);
  } else {
    me().g.visible = true;
    tgt.set(m.x + sx, 12, m.z + 9 + sz); camera.position.lerp(tgt, 0.12); camera.lookAt(m.x, 0, m.z);
  }
  lastX = m.x; lastZ = m.z;
  camera.updateMatrixWorld();
  canvasEl.style.cursor = playing && rig.mode === "top" ? "crosshair" : "";
}
