import * as THREE from "three";
import { camera, scene, canvasEl } from "./scene";
import { wallMeshes } from "./map";
import { me } from "./characters";
import { G } from "../state";
import { COLORS } from "../config";

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

// Tay + dao hiện trước mặt ở góc nhìn thứ nhất
const hand = new THREE.Group();
{
  const skin = new THREE.MeshStandardMaterial({ color: COLORS[0] }), glove = new THREE.MeshStandardMaterial({ color: 0xeef1ff }), blade = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 0.6, roughness: 0.3 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.55), skin), g = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.19, 0.18), glove), k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.42), blade), h = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.14), new THREE.MeshStandardMaterial({ color: 0x3a2a20 }));
  g.position.z = -0.3; k.position.set(0, 0.04, -0.62); h.position.z = -0.44; k.name = "knife"; h.name = "knife";
  hand.add(a, g, k, h); hand.position.set(0.3, -0.27, -0.55); hand.scale.setScalar(0.6); hand.rotation.set(0.12, 0.22, 0); hand.visible = false;
  scene.add(camera); camera.add(hand);
}

const ray = new THREE.Raycaster(), V = new THREE.Vector3(), tgt = new THREE.Vector3();
let bob = 0, lastX = 0, lastZ = 0;
const cross = document.getElementById("cross")!, hint = document.getElementById("lockhint")!;
const setDisp = (el: HTMLElement, on: boolean) => { const v = on ? "block" : "none"; if (el.style.display !== v) el.style.display = v; };
/** overview = họp/eject (camera cố định nhìn bàn), menu = quay quanh trạm làm nền cho màn giới thiệu. */
export function updateCamera(dt: number, t: number, shake: number) {
  const m = me(), sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  if (document.pointerLockElement && (G.mini || G.phase !== "play")) document.exitPointerLock();
  hand.visible = false;
  const playing = G.phase === "play" && !G.mini;
  setDisp(cross, playing && rig.mode === "first" && !G.ghost); setDisp(hint, playing && rig.mode !== "top" && !rig.locked);
  const fov = rig.mode === "first" ? 78 : rig.mode === "top" ? 55 : 66;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }

  if (G.phase === "menu") { // quay quanh trạm
    const a = t * 0.07; camera.position.set(Math.sin(a) * 40, 19, Math.cos(a) * 40); camera.lookAt(0, 3, 0); return;
  }
  if (G.phase === "meet" || (G.phase === "end")) { // họp: nhìn bàn tròn từ trên cao, hơi lắc nhẹ
    const a = t * 0.12; camera.position.set(Math.sin(a) * 3, 10.5, 9 + Math.cos(a) * 1.2); camera.lookAt(0, 0.5, 0); return;
  }
  if (rig.mode === "first") {
    const moving = Math.hypot(m.x - lastX, m.z - lastZ) > 0.001; bob += moving ? dt * 9 : 0;
    camera.position.set(m.x + sx, m.y + 1.62 + (moving ? Math.sin(bob) * 0.035 : 0), m.z + sz);
    camera.rotation.set(-rig.pitch, rig.yaw + Math.PI, 0);
    hand.visible = !G.ghost; hand.position.y = -0.27 + (moving ? Math.sin(bob) * 0.012 : 0);
    hand.children.forEach((c) => { if (c.name === "knife") c.visible = G.role === 1; });
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
    camera.rotation.set(-rig.pitch, rig.yaw + Math.PI, 0);
  } else {
    me().g.visible = true;
    tgt.set(m.x + sx, 12, m.z + 9 + sz); camera.position.lerp(tgt, 0.12); camera.lookAt(m.x, 0, m.z);
  }
  lastX = m.x; lastZ = m.z;
}
