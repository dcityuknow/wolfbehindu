import * as THREE from "three";
import { camera, scene, canvasEl } from "./scene";
import { wallMeshes } from "./map";
import { me } from "./characters";
import { G } from "../state";
import { SQUAD, GUNS, GRENADE } from "../config";
import { defOf } from "./soldier";
import { buildGun, buildGrenade, setSlide, type GunRig } from "./guns";
import { reloadPose, newRelOut, slideK, e3, cl } from "./gunpose";
import { W, MV, HURT, ROLL_T } from "../weaponState";
import { CINE } from "./cineState";
import { groundAt, terrainRay, CAMP_Y } from "./island";

/** Camera 2 chế độ: thứ ba (qua vai) · thứ nhất. Quy ước: hướng nhìn = (sin yaw, cos yaw). */
export type ViewMode = "third" | "first";
export const rig = { mode: "third" as ViewMode, yaw: Math.PI, pitch: 0.5, dist: 6, locked: false };
const ORDER: ViewMode[] = ["third", "first"], LABEL: Record<ViewMode, string> = { third: "3rd person", first: "1st person" };

export const facing = (_m?: { rot: number }) => rig.yaw;
export function setView(v: ViewMode) {
  rig.mode = v;
  rig.pitch = v === "first" ? 0 : 0.5;
  const b = document.getElementById("bView"); if (b) b.textContent = `📷 ${LABEL[v]} (V)`;
}
export const cycleView = () => setView(ORDER[(ORDER.indexOf(rig.mode) + 1) % ORDER.length]);

export function bindMouse() {
  const S = 0.0023; let drag = false;
  canvasEl.addEventListener("mousedown", () => { drag = true; });
  addEventListener("mouseup", () => { drag = false; });
  canvasEl.addEventListener("click", () => { if (G.phase === "play" && !G.mini && !rig.locked) canvasEl.requestPointerLock?.(); });
  document.addEventListener("pointerlockchange", () => { rig.locked = document.pointerLockElement === canvasEl; });
  addEventListener("mousemove", (e) => {
    if (!(rig.locked || drag) || G.phase !== "play" || G.mini) return;
    const k = W.scoped ? 0.28 : 1; rig.yaw -= e.movementX * S * k; rig.pitch += e.movementY * S * k;
    rig.pitch = Math.max(rig.mode === "first" ? -1.35 : -0.15, Math.min(rig.mode === "first" ? 1.35 : 1.15, rig.pitch));
  });
  canvasEl.addEventListener("wheel", (e) => { if (rig.mode === "third") rig.dist = Math.max(2.5, Math.min(9, rig.dist + Math.sign(e.deltaY) * 0.5)); }, { passive: true });
}

// Súng + hai tay hiện trước mặt ở góc nhìn thứ nhất (viewmodel). Mỗi súng một bộ, chỉ hiện súng đang cầm. p = vị trí · s = tỉ lệ · ads = vị trí khi ngắm.
const VM: Record<string, { p: [number, number, number]; s: number; ads: [number, number, number] }> = {
  // Tỉ lệ thật (s = 1) và vị trí tay cầm như viewmodel.js của game tham khảo (tay phải ~ x .14–.22, y -.2, z -.45)
  pistol: { p: [0.22, -0.2, -0.45], s: 1, ads: [0, -0.13, -0.5] },
  rifle: { p: [0.15, -0.22, -0.45], s: 1, ads: [0, -0.17, -0.45] },
  sniper: { p: [0.15, -0.23, -0.45], s: 1, ads: [0, -0.15, -0.194] },   // ads: kính ngắm sau (gốc súng +0.15 cao, +0.026 dài) trùng tâm camera — thấy ống ngắm / thân súng quanh viền kính như game tham khảo
};
const FP_POUCH = new THREE.Vector3(0.3, -0.4, -0.35);   // túi băng đạn (toạ độ súng, súng đã xoay 180° nên +x = bên trái màn hình, -z = về phía người chơi)
export const viewGuns: THREE.Group[] = [];
export const swimArms: THREE.Group[] = [];   // hai tay quạt nước ở góc nhìn thứ nhất khi bơi
export let viewNade: THREE.Group;            // tay phải cầm lựu đạn (góc thứ nhất)
let fpHandL: THREE.Group;                    // tay trái: nắm băng đạn / kéo thanh trượt / giật chốt lựu đạn
{
  const d0 = defOf(SQUAD[0]), sleeve = d0.uni.pal[Math.min(1, d0.uni.pal.length - 1)] as number, glove = (d0.glove ?? d0.skin) as number;
  const mSleeve = new THREE.MeshStandardMaterial({ color: sleeve }), mGlove = new THREE.MeshStandardMaterial({ color: glove });
  const arm = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); g.add(k); return k; };
  for (const def of GUNS) {
    const vg = buildGun(def.id);
    arm(vg, 0.085, 0.085, 0.55, -0.03, -0.07, -0.32, mSleeve); arm(vg, 0.08, 0.1, 0.12, 0, -0.045, -0.02, mGlove);              // tay phải cầm báng
    vg.rotation.y = Math.PI; vg.visible = false; camera.add(vg); viewGuns.push(vg);
  }
  const mkArm = () => { const a = new THREE.Group(), sl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.62), mSleeve), gl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.13), mGlove); sl.position.z = 0.31; a.add(sl, gl); a.visible = false; camera.add(a); return a; };   // bàn tay ở gốc, ống tay kéo dài về +z (hướng vai)
  for (let i = 0; i < 2; i++) swimArms.push(mkArm());
  fpHandL = mkArm();
  viewNade = new THREE.Group(); const nm = buildGrenade(); nm.scale.setScalar(1.25); viewNade.add(nm); viewNade.userData.model = nm;
  arm(viewNade, 0.085, 0.085, 0.5, 0.03, -0.05, 0.3, mSleeve); arm(viewNade, 0.08, 0.1, 0.1, 0.0, -0.02, 0.04, mGlove);   // tay phải cầm lựu đạn (ống tay hướng về phía người chơi)
  viewNade.visible = false; camera.add(viewNade);
  for (const o of [...viewGuns, viewNade, fpHandL, ...swimArms]) o.traverse((c: THREE.Object3D) => c.layers.set(1));   // viewmodel ở layer 1: camera chính thấy, camera kính ngắm (layer 0) không thấy
  scene.add(camera);
}
/** Đang nhìn qua kính súng ngắm / góc thứ nhất? (kính ngắm tự chuyển sang góc thứ nhất) */
export const firstNow = () => rig.mode === "first" || W.scoped;
/** Vị trí đầu nòng trong thế giới (điểm xuất phát vệt đạn). */
export function muzzleWorld(out: THREE.Vector3) {
  const o: THREE.Object3D = firstNow() ? viewGuns[W.cur] : (me().g.userData.gunRig as GunRig).models[GUNS[W.cur].id]!;
  o.updateWorldMatrix(true, false);
  return out.copy(o.userData.muzzle as THREE.Vector3).applyMatrix4(o.matrixWorld);
}
/** Vị trí thế giới của băng đạn đang cầm (để thả băng cũ), quả lựu đạn / chốt đang trên tay (để phóng / bắn chốt bay). */
export function magWorld(out: THREE.Vector3) {
  const o: THREE.Object3D = firstNow() ? viewGuns[W.cur] : (me().g.userData.gunRig as GunRig).models[GUNS[W.cur].id]!;
  o.updateWorldMatrix(true, true); (o.userData.mag as THREE.Object3D).getWorldPosition(out); return out;
}
export function nadeWorld(out: THREE.Vector3, pin = false) {
  const o: THREE.Object3D = firstNow() ? (viewNade.userData.model as THREE.Object3D) : (me().g.userData.gunRig as GunRig).nade!;
  o.updateWorldMatrix(true, true);
  if (pin) { (o.userData.pin as THREE.Object3D).getWorldPosition(out); return out; }
  return o.getWorldPosition(out);
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
const ZAX = new THREE.Vector3(0, 0, 1), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/** Đặt bàn tay ở (x,y,z) (toạ độ camera); ống tay xoay + kéo dài về phía vai cho khớp. */
function placeArm(a: THREE.Group, x: number, y: number, z: number, sx: number, roll: number) {
  _h.set(x, y, z); _s.set(sx * 0.3, -0.5, 0.35).sub(_h); const d = _s.length() || 1e-3; _s.divideScalar(d);
  _q1.setFromUnitVectors(ZAX, _s); _q2.setFromAxisAngle(ZAX, roll); a.quaternion.copy(_q1).multiply(_q2);
  a.position.copy(_h); a.scale.set(1, 1, Math.max(0.85, Math.min(1.4, d / 0.62))); a.visible = true;
}
/** Bơi sải ở góc thứ nhất: súng hạ khuất xuống dưới, hai tay quạt luân phiên: vươn ra trước → kéo xuống nước → nhấc lên vòng về trước. */
function updateSwimArms() {
  const w = MV.swimK;
  if (w < 0.02) { swimArms.forEach((a) => (a.visible = false)); return; }
  const low = -0.8 * (1 - w);
  [[1, 0], [-1, Math.PI]].forEach(([sx, o], i) => { const f = MV.stk + o, sn = Math.sin(f); placeArm(swimArms[i], sx * (0.2 + 0.12 * sn), -0.3 - 0.2 * sn + low, -0.58 - 0.2 * Math.cos(f), sx, sx * 0.4 * sn); });
}

const ray = new THREE.Raycaster(), V = new THREE.Vector3(), tgt = new THREE.Vector3(), CL = new THREE.Vector3(), CB = new THREE.Vector3();
let lift = 0;
let bob = 0, lastX = 0, lastZ = 0;
const cross = document.getElementById("cross")!, hint = document.getElementById("lockhint")!, scopeEl = document.getElementById("scope")!;
const setDisp = (el: HTMLElement, on: boolean) => { const v = on ? "block" : "none"; if (el.style.display !== v) el.style.display = v; };

/* ───── Súng / tay ở góc nhìn thứ nhất: rút súng, bắn, nạp đạn (tay trái nắm băng → vứt → túi → nhét → kéo khóa nòng), giật chốt + ném lựu đạn ───── */
const _L = new THREE.Vector3(), _po = new THREE.Vector3(), _ro = newRelOut(), _pn = new THREE.Vector3();
const FP_NADE = new THREE.Vector3(0.2, -0.22, -0.5), FP_LREST = new THREE.Vector3(-0.3, -0.5, -0.35);
function fpWeapons(moving: boolean, rollK: number) {
  const hide = MV.swimK >= 0.9 || rollK >= 0.9;   // bơi / lăn: hai tay bận, súng khuất xuống dưới
  if (W.nade) { fpNade(hide, moving); return; }
  const id = GUNS[W.cur].id, vg = viewGuns[W.cur], c = VM[id], ads = W.adsT, rel = W.reload > 0 ? 1 - W.reload / W.reloadDur : -1;
  const tl = rel >= 0 ? e3(cl(rel, 0, 0.12)) * (1 - e3(cl(rel, 0.74, 0.86))) : 0;
  vg.scale.setScalar(c.s);
  vg.position.set(lerpN(c.p[0], c.ads[0], ads) - tl * 0.05, lerpN(c.p[1], c.ads[1], ads) - tl * 0.1 - W.swapT * 0.4 + (moving ? Math.sin(bob) * 0.012 : 0), lerpN(c.p[2], c.ads[2], ads) + W.kick * 0.07);
  vg.rotation.set(W.kick * 0.12 - tl * 0.35 - W.swapT * 0.5, Math.PI, tl * 0.45);
  vg.position.y -= 1.2 * MV.swimK + 0.8 * rollK;
  vg.updateMatrix();
  const mg = vg.userData.mag as THREE.Object3D, home = vg.userData.magHome as THREE.Vector3, fore = vg.userData.fore as THREE.Vector3;
  let magOn = true, rack = 0;
  if (rel >= 0) {
    reloadPose(vg, id, rel, _po.copy(home).add(FP_POUCH), _ro); mg.position.copy(_ro.mp); magOn = _ro.magOn; rack = _ro.rack; _L.copy(_ro.hv);
  } else { mg.position.copy(home); _L.copy(fore); }
  mg.visible = magOn; setSlide(vg, slideK(id, rack));
  _L.applyMatrix4(vg.matrix);
  vg.visible = !hide;
  if (vg.visible) placeArm(fpHandL, _L.x, _L.y, _L.z, -1, -0.25);
}
function fpNade(hide: boolean, moving: boolean) {
  const g = viewNade, D = GRENADE.draw, PT = GRENADE.pin, TH = GRENADE.throwT, throwing = W.gThrowT > 0, hold = W.gHold || W.gAuto;
  let ox = 0, oy = 0, oz = 0, rx = 0, left = false;
  if (throwing) {            // vung tay: từ sau ra trước, quả lựu đạn rời tay giữa chừng
    const u = 1 - W.gThrowT / TH, t = e3(Math.min(1, u / 0.8));
    ox = 0.04 * (1 - t); oy = 0.14 - 0.26 * t; oz = 0.3 - 0.7 * t; rx = 0.55 - 1.05 * t;
  } else if (hold) {         // rút tay ra sau + nghiêng, tay trái giật chốt
    const w = e3(Math.min(1, W.gHoldT / 0.25)); ox = 0.04 * w; oy = 0.14 * w; oz = 0.3 * w; rx = 0.55 * w; left = W.gHoldT / PT < 1;
  } else if (W.gDrawT < D) { // móc túi: quả lựu đạn từ hông trái nhấc lên
    const r = e3(cl(Math.max(0, W.gDrawT), 0, D)); ox = -0.3 * (1 - r); oy = -0.5 * (1 - r); oz = 0.1 * (1 - r);
  }
  g.position.set(FP_NADE.x + ox, FP_NADE.y + oy + (moving ? Math.sin(bob) * 0.012 : 0) - 1.2 * MV.swimK, FP_NADE.z + oz); g.rotation.set(rx, 0, 0); g.updateMatrix();
  (g.userData.model as THREE.Object3D).visible = !(throwing && W.gThrown);
  ((g.userData.model as THREE.Object3D).userData.pin as THREE.Object3D).visible = !W.gPin;
  g.visible = !hide && W.gDrawT > -0.05;
  if (!g.visible) return;
  if (left) {                // tay trái với tới chốt → giật ra → dang ra giữ thăng bằng
    const u = Math.min(1, W.gHoldT / PT);
    _pn.set(-0.04 * 1.25, 0.118 * 1.25, 0).applyMatrix4(g.matrix).add(_L.set(-0.02, -0.04, 0.02));
    if (u < 0.45) _L.lerpVectors(FP_LREST, _pn, e3(cl(u, 0.1, 0.45)));
    else if (u < 0.7) _L.lerpVectors(_pn, _po.copy(_pn).add(_ro.hv.set(-0.16, 0, 0)), e3(cl(u, 0.45, 0.7)));
    else _L.lerpVectors(_po.copy(_pn).add(_ro.hv.set(-0.16, 0, 0)), _ro.mp.set(-0.35, -0.35, -0.45), e3(cl(u, 0.7, 1)));
    placeArm(fpHandL, _L.x, _L.y, _L.z, -1, 0);
  }
}
/** overview = họp/eject (camera cố định nhìn bàn), menu = quay quanh trạm làm nền cho màn giới thiệu. */
export function updateCamera(dt: number, t: number, shake: number) {
  if (CINE.active) return;   // cảnh mở đầu 3D tự điều khiển camera (world/cine3d.ts)
  const m = me(), sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  HURT.target *= Math.exp(-dt / HURT.TAU); HURT.tilt += (HURT.target - HURT.tilt) * Math.min(1, dt * 18);   // nghiêng nhanh khi trúng, trả về từ từ
  const rollK = MV.roll > 0 ? Math.sin(Math.PI * (1 - MV.roll / ROLL_T)) : 0, tilt = G.phase === "play" ? -HURT.tilt : 0;   // rollK: 0→1→0 trong cú lăn
  if (document.pointerLockElement && (G.mini || G.phase !== "play")) document.exitPointerLock();
  viewGuns.forEach((v) => (v.visible = false)); viewNade.visible = false; fpHandL.visible = false;
  swimArms.forEach((v) => (v.visible = false));
  const playing = G.phase === "play" && !G.mini;
  setDisp(cross, playing && !G.ghost && !W.scoped); setDisp(scopeEl, playing && !G.ghost && W.scoped); setDisp(hint, playing && !rig.locked);
  const fov = (firstNow() ? 78 : 66) * (1 - (GUNS[W.cur].id === "sniper" ? 0.06 : 0.38) * W.adsT);   // ngắm (chuột phải) = zoom · súng ngắm: không zoom cảnh ngoài, zoom nằm trong mặt kính (scene.ts)
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }

  if (G.phase === "menu") { // quay quanh đảo
    const a = t * 0.06 + 0.6; camera.position.set(Math.sin(a) * 128, 58, Math.cos(a) * 128); camera.lookAt(0, 9, 0); return;
  }
  if (G.phase === "end") { // kết thúc: nhìn đống lửa từ trên cao (khi họp, camera của người chơi được giữ nguyên)
    const a = t * 0.12; camera.position.set(Math.sin(a) * 3, CAMP_Y + 10.5, 9 + Math.cos(a) * 1.2); camera.lookAt(0, CAMP_Y + 0.5, 0); return;
  }
  if (firstNow()) {
    const moving = Math.hypot(m.x - lastX, m.z - lastZ) > 0.001; bob += moving ? dt * 9 : 0;
    camera.position.set(m.x + sx, m.y + 1.62 - 0.35 * MV.swimK - 0.6 * rollK + (moving && !MV.swimming ? Math.sin(bob) * 0.035 : 0) + (MV.inWater ? Math.sin(t * 2.1) * 0.03 : 0), m.z + sz);
    camera.rotation.set(-(rig.pitch - W.recoil) - 0.5 * rollK, rig.yaw + Math.PI, tilt + Math.sin(MV.stk) * 0.03 * MV.swimK);
    if (!G.ghost && playing) fpWeapons(moving, rollK);
    updateSwimArms();
    me().g.visible = false;
  } else {
    me().g.visible = true;
    const px = m.x, py = m.y + 1.6 - 0.5 * MV.swimK - 0.55 * rollK, pz = m.z;
    const rx = -Math.cos(rig.yaw) * 0.55, rz = Math.sin(rig.yaw) * 0.55;               // lệch qua vai phải
    const ox = px + rx, oz = pz + rz;
    // Camera sau lưng bị vách/đồi chắn → thay vì dí sát vào nhân vật, nâng camera lên cao dần (nhìn từ trên xuống) cho tới khi thoáng.
    const probe = (extra: number) => {
      const p = Math.min(1.45, rig.pitch + extra), cp = Math.cos(p), l = CL.set(Math.sin(rig.yaw) * cp, -Math.sin(p), Math.cos(rig.yaw) * cp);
      let d = rig.dist;
      ray.set(tgt.set(ox, py, oz), CB.copy(l).negate()); ray.far = d + 0.4;           // camera không xuyên tường
      const hit = ray.intersectObjects(wallMeshes)[0]; if (hit) d = Math.max(1.6, hit.distance - 0.35);
      const th = terrainRay(ox, py, oz, -l.x, -l.y, -l.z, d + 0.4, 0.3); if (th >= 0) d = Math.max(1.2, Math.min(d, th - 0.35));   // camera không chui vào đồi
      return { d, p };
    };
    const want = Math.min(rig.dist, 3.4);
    let best = probe(0), bestExtra = 0;
    for (let ex = 0.2; ex <= 1.0 && best.d < want; ex += 0.2) { const r = probe(ex); if (r.d > best.d + 0.05) { best = r; bestExtra = ex; } }
    lift += (bestExtra - lift) * Math.min(1, dt * 7);                                  // làm mượt để camera không giật
    const fin = probe(lift), L = CL.set(Math.sin(rig.yaw) * Math.cos(fin.p), -Math.sin(fin.p), Math.cos(rig.yaw) * Math.cos(fin.p)), d = fin.d;
    const cx = ox - L.x * d + sx, cz = oz - L.z * d + sz;
    camera.position.set(cx, Math.max(groundAt(cx, cz) + 0.5, py - L.y * d), cz);
    camera.rotation.set(-(fin.p - W.recoil), rig.yaw + Math.PI, tilt);
  }
  lastX = m.x; lastZ = m.z;
  camera.updateMatrixWorld();
}
