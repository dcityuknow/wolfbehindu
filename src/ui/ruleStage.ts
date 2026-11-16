import * as THREE from "three";
import { t as tr } from "../i18n";
import { COLORS, type GunId } from "../config";
import { PX } from "../world/soldier";
import { buildGrenade, setFlash, setSlide } from "../world/guns";
import { curlArm, poseFull } from "../world/gunpose";
import type { Entity } from "../types";
import { buildWorld, makeActor, makeFire, makeStation, textSprite, resetActor, place, stand, stride, carry, free, sit, kneeBend, clamp01, sm, lerp, type Actor } from "./introStage";
import { OW, OH, ease, seg, hash, txt, emo, chip, bubble, flash, key, keyHint, bar, cursor, type G } from "./clipDraw";

/**
 * Video minh hoạ trong "Luật chơi": mỗi thẻ là một cảnh quay bằng CHÍNH nhân vật 3D của game (buildSoldier: quân phục từng nước, băng tay, súng,
 * dao găm, trạm radio, đống lửa…) — không vẽ phỏng. Cả trang dùng MỘT WebGLRenderer; mỗi khung hình render cảnh của thẻ đang hiện rồi chép sang canvas 2D
 * của thẻ, sau đó vẽ lớp chữ / HUD (phím, thanh tiến độ, bong bóng thoại…) lên trên. Chỉ cảnh đang nhìn thấy mới chạy.
 *
 * Thẻ n ↔ clip n:  1 cốt truyện · 2 biệt kích · 3 gián điệp · 4 điều khiển · 5 bắn nhầm · 6 một lượt chơi · 7 mã hoá (blockchain).
 */
const RW = 1280, RH = 720;   // clip hiển thị rộng cả trang (và toàn màn hình) nên dựng ở 720p

/* ───────────── môi trường dùng chung ───────────── */
interface Look { sky: [number, number, number]; hemi: number; hemiC: number; key: number; keyC: number; rim: number; sun: boolean; cloud: [number, number] | null; fog?: [number, number, number] }
const SUNSET: Look = { sky: [0x16294a, 0x6a5a82, 0xe59a62], hemi: 1.15, hemiC: 0xffe2c0, key: 2.4, keyC: 0xfff0dd, rim: 1.3, sun: true, cloud: [0xf3c7a6, 0xd9a89a] };
const STORM: Look = { sky: [0x0d1426, 0x2a3552, 0x4a5878], hemi: 1.1, hemiC: 0x9ab0e0, key: 1.0, keyC: 0x9ab0ff, rim: 0, sun: false, cloud: [0x1a2038, 0x232b48], fog: [0x141c30, 30, 150] };
const NIGHT: Look = { sky: [0x040810, 0x0a1a2c, 0x16344a], hemi: 1.0, hemiC: 0x7a9ac8, key: 1.7, keyC: 0xa8c0ff, rim: 0, sun: false, cloud: null, fog: [0x06101a, 16, 70] };
const MATRIX: Look = { sky: [0x01040a, 0x03120c, 0x07271a], hemi: 0.7, hemiC: 0x7affb0, key: 1.3, keyC: 0xaaffd0, rim: 0, sun: false, cloud: null, fog: [0x03100a, 18, 70] };

interface Env {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; w: ReturnType<typeof buildWorld>;
  cam(px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov?: number): void; proj(x: number, y: number, z: number): [number, number]; head(a: Actor, dy?: number): [number, number];
}
interface Clip {
  d: number; look: Look; group: THREE.Group; t: number; reset(): void; tick(t: number, dt: number): void; ov(g: G, t: number): void;
}
let ENV: Env | null | undefined;
function env(): Env | null {
  if (ENV !== undefined) return ENV;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { return (ENV = null); }
  renderer.setPixelRatio(1); renderer.setSize(RW, RH, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, RW / RH, 0.1, 700), w = buildWorld(scene), _v = new THREE.Vector3();
  const cam: Env["cam"] = (px, py, pz, lx, ly, lz, fov = 38) => { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } camera.updateMatrixWorld(); };
  const proj: Env["proj"] = (x, y, z) => { _v.set(x, y, z).project(camera); return [(_v.x * 0.5 + 0.5) * OW, (-_v.y * 0.5 + 0.5) * OH]; };
  const head: Env["head"] = (a, dy = 0.0) => { const p = a.root.getWorldPosition(_v.clone()); return proj(p.x, p.y + 2.05 + dy, p.z); };
  return (ENV = { renderer, scene, camera, w, cam, proj, head });
}
function applyLook(E: Env, L: Look) {
  const u = (E.w.sky.material as THREE.ShaderMaterial).uniforms;
  u.top.value.setHex(L.sky[0]); u.mid.value.setHex(L.sky[1]); u.hor.value.setHex(L.sky[2]); E.w.sun.visible = L.sun;
  E.w.hemi.intensity = L.hemi; E.w.hemi.color.setHex(L.hemiC); E.w.key.intensity = L.key; E.w.key.color.setHex(L.keyC); E.w.rim.intensity = L.rim;
  E.scene.fog = L.fog ? new THREE.Fog(L.fog[0], L.fog[1], L.fog[2]) : null;
  E.w.clouds.forEach((c, k) => { c.visible = !!L.cloud; if (L.cloud) (c.material as THREE.MeshBasicMaterial).color.setHex(L.cloud[k & 1]); });
}

/* ───────────── đạo cụ / tư thế dùng chung ───────────── */
const stdM = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const bxm = (g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, cast = true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; g.add(o); return o; };
const _ps = { aim: 0, pitch: 0 } as Entity;
/** Cầm súng `gid` ở tư thế của người chơi: aim 0 = hạ nòng, 1 = áp vai ngắm bắn. */
function aimGun(a: Actor, gid: GunId, aim: number) { a.gr.pivot.visible = true; _ps.aim = aim; _ps.pitch = 0; poseFull(_ps, a.gr, a.s.armL, a.s.armR, 1 / 60, 0, gid); }
const flare = (a: Actor, gid: GunId, on: boolean) => { const m = a.gr.models[gid]; if (m) { setFlash(m, on); setSlide(m, on ? 1 : 0); } };
/** Đi từ p0 → p1 (k = 0..1), quay mặt theo hướng đi; trả về biên độ vung chân. */
function go(a: Actor, p0: [number, number], p1: [number, number], k: number, dt: number, spd = 3, hold: GunId | null = null) {
  const x = lerp(p0[0], p1[0], k), z = lerp(p0[1], p1[1], k); a.root.visible = true; a.root.position.set(x, 0, z);
  if (k < 1) { a.root.rotation.y = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]); const sw = stride(a, dt, spd); if (hold) carry(a, 0); else free(a, sw); a.s.g.position.y = Math.abs(sw) * 0.03; return sw; }
  stand(a); return 0;
}
/** Ngã: sấp (f > 0) hoặc ngửa (f < 0) rồi xám đi như xác. */
function fall(a: Actor, f: number, back = false) { a.root.rotation.x = (back ? -1 : 1) * f * Math.PI / 2; a.root.position.y = 0.23 * f; if (f > 0.6) { a.mat.color.setHex(0x8a8a8a); a.tag.visible = false; a.gr.pivot.visible = false; a.s.armL.rotation.set(-0.3, 0, 0.5); a.s.armR.rotation.set(-0.3, 0, -0.5); } }
const tint = (a: Actor, hot: boolean) => a.mat.color.setHex(hot ? 0xff6a4a : 0xffffff);
function newActors(ids: number[], g: THREE.Group): Actor[] {
  const out: Actor[] = []; for (const i of ids) { const a = makeActor(i); a.root.visible = false; g.add(a.root); out[i] = a; } return out;
}
function tracer(g: THREE.Group, color = 0xfff2a0) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 0.025), new THREE.MeshBasicMaterial({ color })); m.visible = false; g.add(m); return m; }
function setTracer(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, k: number) { // k: 0..1 vị trí đầu đạn dọc đường bay
  const L = a.distanceTo(b), seg0 = Math.min(1.6, L), c = a.clone().lerp(b, k); m.visible = true; m.scale.x = seg0; m.position.copy(c); m.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), Math.asin((b.y - a.y) / L));
}
function fireball(g: THREE.Group) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0 })); m.visible = false; g.add(m); return m; }
function poseFire(m: THREE.Mesh, k: number) { m.visible = k > 0 && k < 1; if (!m.visible) return; m.scale.setScalar(0.4 + k * 3.4); (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k); (m.material as THREE.MeshBasicMaterial).color.setHex(k < 0.3 ? 0xffe27a : 0xff7a1a); }
function tree(g: THREE.Group, x: number, z: number, s: number) {
  const trunk = stdM(0x3a281a), leaf = [stdM(0x1c5a2e), stdM(0x226a36), stdM(0x184c28)];
  bxm(g, 0.5 * s, 3.4 * s, 0.5 * s, trunk, x, 1.7 * s, z); [[3.0, 2.6, 0], [2.3, 4.0, 1], [1.5, 5.1, 2]].forEach(([w, y, k]) => bxm(g, w * s, 1.3 * s, w * s, leaf[k], x, y * s, z));
}
function chute(): THREE.Group {
  const g = new THREE.Group(), c1 = new THREE.MeshStandardMaterial({ color: 0xa3b08a, roughness: 0.9, side: THREE.DoubleSide }), c2 = new THREE.MeshStandardMaterial({ color: 0x8b9a70, roughness: 0.9 }), pts: number[] = [];
  for (let k = 0; k < 9; k++) {
    const u = (k + 0.5) / 9 * 2 - 1, th = u * 0.82, x = 2.9 * Math.sin(th), y = 4.5 + 2.9 * (Math.cos(th) - 1) * 0.7;
    const c = bxm(g, 0.62, 0.18, 1.9, k & 1 ? c2 : c1, x, y, 0, false); c.rotation.z = -th * 0.9;
    pts.push(x, y - 0.1, 0.5, x > 0 ? 0.34 : -0.34, 1.42, 0); pts.push(x, y - 0.1, -0.5, x > 0 ? 0.34 : -0.34, 1.42, 0);
  }
  const ge = new THREE.BufferGeometry(); ge.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); g.add(new THREE.LineSegments(ge, new THREE.LineBasicMaterial({ color: 0xdcd8c8 })));
  return g;
}
const ELM = (a: Actor, k: number) => { a.s.armL.userData.elbow.rotation.x = k; a.s.armR.userData.elbow.rotation.x = k; };
/** ngồi quanh lửa: 2 tay chống đùi */
function seated(a: Actor, x: number, z: number, ry: number, t: number, i: number) {
  free(a, 0); a.s.armL.rotation.set(-0.8, 0, 0.12); a.s.armR.rotation.set(-0.8, 0, -0.12); ELM(a, -0.6); a.root.position.set(x, 0.12, z); a.root.rotation.y = ry; sit(a, true); a.s.g.position.y = -0.34 + Math.sin(t * 2 + i) * 0.006;
}
const seatAt = (F: [number, number], ang: number, r = 2.55): [number, number, number] => { const dx = Math.cos(ang) * r, dz = Math.sin(ang) * r; return [F[0] + dx, F[1] + dz, Math.atan2(-dx, -dz)]; };
const envelope = (g: THREE.Group) => { const s = textSprite((x, w, h) => { x.font = "54px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("✉", w / 2, h / 2 + 2); }, 64, 64, 0.6, 0.6); s.visible = false; g.add(s); return s; };
function votesFly(votes: THREE.Sprite[], from: Actor[], to: [number, number], t0: number, t: number) {
  votes.forEach((s, k) => {
    const u = clamp01((t - (t0 + k * 0.4)) / 1.0), who = from[k]; s.visible = u > 0 && u < 1 && !!who; if (!s.visible) return;
    const sx = who.root.position.x, sz = who.root.position.z; s.position.set(lerp(sx, to[0], sm(u)), lerp(2.0, 1.0, u) + Math.sin(u * Math.PI) * 1.0, lerp(sz, to[1], sm(u))); (s.material as THREE.SpriteMaterial).opacity = 1 - sm((u - 0.7) / 0.3);
  });
}

/* ═════════════════════════════ 1 · CỐT TRUYỆN — bão, máy bay nổ, 7 người nhảy dù xuống đảo, 1 kẻ phản bội (10 s) ═════════════════════════════ */
function clip1(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([0, 1, 2, 3, 4, 5, 6], group);
  const X = [0, -4.6, 4.4, -8.4, 8.6, -2.5, 2.8], Z = [1.4, -0.2, -0.5, -1.2, -1.0, -2.2, -2.5], Y0 = [9, 11, 10, 12.5, 9.5, 13.5, 11.5], TL = [8.8, 8.0, 8.4, 7.4, 8.2, 7.2, 7.7];
  const chutes = A.map(() => { const c = chute(); group.add(c); return c; });
  // máy bay bị trúng đạn (thân + cánh bằng khối), kèm cầu lửa
  const plane = new THREE.Group(); bxm(plane, 6, 0.9, 0.9, stdM(0x8a929c), 0, 0, 0); bxm(plane, 1, 0.2, 7, stdM(0x7a828c), -0.5, 0, 0); bxm(plane, 0.8, 1.3, 0.2, stdM(0x7a828c), 2.6, 0.9, 0); group.add(plane);
  const ball = fireball(group), smoke: THREE.Mesh[] = []; for (let i = 0; i < 10; i++) { const m = bxm(group, 0.8, 0.8, 0.8, new THREE.MeshBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 }), 0, 0, 0, false); m.visible = false; smoke.push(m); }
  const N = 240, rp = new Float32Array(N * 6), rg = new THREE.BufferGeometry(); for (let i = 0; i < N; i++) { rp[i * 6] = (hash(i) - 0.5) * 32; rp[i * 6 + 1] = hash(i + 7) * 20; rp[i * 6 + 2] = (hash(i + 3) - 0.5) * 14 + 4; }
  rg.setAttribute("position", new THREE.BufferAttribute(rp, 3)); const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaec6ff, transparent: true, opacity: 0.5 })); rain.frustumCulled = false; group.add(rain);
  const FL = [1.0, 2.6, 6.4]; let lg = 0;
  const reset = () => { A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); A[0].you.visible = true; };
  const tick = (t: number, dt: number) => {
    for (let i = 0; i < 7; i++) {
      const a = A[i], u = clamp01(t / TL[i]), y = Y0[i] * Math.pow(1 - u, 1.15), land = t - TL[i], c = chutes[i];
      const sx = X[i] + Math.sin(t * 1.1 + i * 1.7) * 0.5 * (1 - u), sz = Z[i];
      a.root.visible = true; a.root.position.set(sx, y, sz); a.root.rotation.y = Math.sin(t * 0.9 + i) * 0.35 * (1 - u);
      if (u < 1) {
        free(a, 0); a.s.armL.rotation.set(-2.9, 0, 0.22); a.s.armR.rotation.set(-2.9, 0, -0.22); ELM(a, -0.1); a.s.legL.rotation.x = Math.sin(t * 2 + i) * 0.18; a.s.legR.rotation.x = -Math.sin(t * 2 + i) * 0.18; kneeBend(a);
        c.visible = true; c.position.set(sx, y, sz); c.rotation.set(0, a.root.rotation.y, Math.sin(t * 1.1 + i) * 0.07); c.scale.setScalar(1);
      } else { free(a, 0); stand(a); a.root.rotation.y = lerp(a.root.rotation.y, 0, 0.1); c.visible = land < 1.0; c.position.set(sx, 0 - land * 0.8, sz); c.scale.set(1, Math.max(0.01, 1 - land * 1.1), 1); }
    }
    A[0].you.position.y = 2.95 + Math.sin(t * 5) * 0.06;
    // máy bay: bay ngang, trúng đạn t=1.6 → nổ t=2.4
    plane.visible = t > 0.4 && t < 2.5; const pk = seg(t, 0.4, 2.4); plane.position.set(lerp(-34, -16, pk), lerp(26, 20, pk * pk), -30); plane.rotation.set(0.0, 0.0, 0.1 + pk * pk * 0.9);
    smoke.forEach((m, k) => { const s0 = t - 1.6 - k * 0.07; m.visible = s0 > 0 && s0 < 1.3; if (m.visible) { m.position.set(plane.position.x - 3 - s0 * 3 - k * 0.8, plane.position.y + s0 * 1.2, -30); m.scale.setScalar(0.5 + s0 * 1.6); } });
    poseFire(ball, seg(t, 2.4, 3.8)); ball.position.set(-16, 19, -30); ball.scale.multiplyScalar(2.2);
    // bão: mưa rơi + sét
    const p = rg.getAttribute("position") as THREE.BufferAttribute; for (let i = 0; i < N; i++) { const o = i * 6; let y = rp[o + 1] - 24 * dt; if (y < 0) y += 20; rp[o + 1] = y; rp[o] -= 3 * dt; rp[o + 3] = rp[o] - 0.12; rp[o + 4] = y + 0.7; rp[o + 5] = rp[o + 2]; if (i === 0) void 0; rp[o + 3] = rp[o] - 0.12; }
    for (let i = 0; i < N; i++) { const o = i * 6; rp[o + 3] = rp[o] - 0.12; rp[o + 4] = rp[o + 1] + 0.7; rp[o + 5] = rp[o + 2]; } p.needsUpdate = true;
    lg = Math.max(0, ...FL.map((f) => 1 - (t - f) * 4 * (t >= f ? 1 : -99)));
    E.w.hemi.intensity = STORM.hemi + lg * 3.2; E.w.key.intensity = STORM.key + lg * 3;
    const k = ease(seg(t, 0, 8.6)); E.cam(0, lerp(4.5, 1.8, k), lerp(15, 13, k), 0, lerp(8, 2.2, k), 0);
  };
  const ov = (g: G, t: number) => {
    flash(g, lg * 0.35, "200,220,255"); flash(g, t > 2.4 && t < 2.8 ? 0.4 * (1 - (t - 2.4) / 0.4) : 0, "255,190,110");
    if (t < 4.4) return;
    const k = seg(t, 4.4, 4.9), bx = OW / 2 - 7 * 18; g.save(); g.globalAlpha = k; g.fillStyle = "#000b"; g.fillRect(bx - 8, 10, 7 * 36 + 16, 42);
    const spyI = 4, run = t < 8.4 ? Math.floor(t * 8) : -1, act = run >= 0 ? Math.floor(hash(run) * 7) : spyI;
    for (let i = 0; i < 7; i++) {
      const on = i === act, x = bx + i * 36 + 3, pl = 0.55 + 0.45 * Math.sin(t * 22), col = "#" + COLORS[i].toString(16).padStart(6, "0");
      g.fillStyle = on ? `rgba(255,40,40,${run < 0 ? 0.6 + 0.4 * Math.sin(t * 10) : pl})` : "#17301f"; g.fillRect(x, 15, 30, 32); g.fillStyle = col; g.fillRect(x, 44, 30, 3);
      g.fillStyle = on ? "#fdd" : "#e8b98a"; g.fillRect(x + 9, 22, 12, 12); g.fillStyle = on ? "#a22" : "#4b5a35"; g.fillRect(x + 7, 18, 16, 6); if (on && run < 0) emo(g, "🕵", x + 15, 38, 12);
    }
    g.restore(); chip(g, t < 8.4 ? "ALPHA · 7" : tr("clip.1.spy"), OW / 2, 70, t < 8.4 ? "#000a" : "#a11d", "#fff");
  };
  return { d: 10, look: STORM, group, t: 0, reset, tick, ov };
}

/* ═════════════════════════════ 2 · BIỆT KÍCH — nhiệm vụ (E) → thấy xác → chạy về đống lửa → họp & bỏ phiếu (14 s) ═════════════════════════════ */
function clip2(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([0, 1, 2, 3, 4, 5, 6], group), st = makeStation(), fire = makeFire(); st.lbl.scale.multiplyScalar(0.55);
  const S = { x: -3.4, z: 0.2, ry: -0.9 }, F: [number, number] = [6.2, 0], BODY: [number, number] = [1.4, 1.5];
  st.g.position.set(S.x, 0, S.z); st.g.rotation.y = S.ry; fire.g.position.set(F[0], 0, F[1]); group.add(st.g, fire.g);
  const alarm = new THREE.PointLight(0xff2020, 0, 16, 2); alarm.position.set(F[0], 3, 3); group.add(alarm);
  const votes = [0, 1, 2, 3, 4].map(() => envelope(group));
  const fx = Math.sin(S.ry) * 1.35, fz = Math.cos(S.ry) * 1.35, sx = S.x + fx, sz = S.z + fz;                      // chỗ đứng trước trạm
  const seats = [Math.PI, Math.PI + 1.05, Math.PI - 1.05, Math.PI + 2.1, Math.PI - 2.1, 0];                       // [0] bạn + 5 bot
  const seat = (i: number) => seatAt(F, seats[i]);
  const reset = () => { A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); A[0].you.visible = true; };
  let px = -9;
  const tick = (t: number, dt: number) => {
    const me = A[0], S0 = seat(0), fireStop: [number, number] = [S0[0] - 0.9, S0[1]];
    // bạn
    if (t < 2.0) { const k = 1 - Math.pow(1 - t / 2.0, 2); go(me, [-5, 1], [sx, sz], k, dt, 3.4); px = me.root.position.x; }
    else if (t < 4.6) {
      stand(me); const tn = sm((t - 2.0) / 0.4); me.root.position.set(sx, 0, sz); me.root.rotation.y = lerp(Math.atan2(sx + 5, sz - 1), Math.atan2(-fx, -fz), tn); free(me, 0);
      const press = t > 2.5 ? Math.max(0, Math.sin((t - 2.5) * 7)) * 0.12 : 0; me.s.armL.rotation.set(-1.15 * tn - press, 0, 0); ELM(me, -0.35); curlArm(me.s.armL, 0.25, 0.1); px = sx;
    } else if (t < 6.0) { go(me, [sx, sz], [BODY[0] - 1.3, BODY[1] - 0.2], ease(seg(t, 4.6, 6.0)), dt, 3.8); px = me.root.position.x; }
    else if (t < 6.4) { stand(me); free(me, 0); px = me.root.position.x; }
    else if (t < 8.0) { go(me, [BODY[0] - 1.3, BODY[1] - 0.2], fireStop, ease(seg(t, 6.4, 8.0)), dt, 6.0); px = me.root.position.x; }
    else { px = fireStop[0]; const u = ease(seg(t, 8.0, 8.5)); me.root.position.set(lerp(fireStop[0], S0[0], u), 0.12 * u, lerp(fireStop[1], S0[1], u)); me.root.rotation.y = S0[2]; free(me, 0); if (u > 0.5) { seated(me, me.root.position.x, me.root.position.z, S0[2], t, 0); } else stand(me); }
    // xác chết nằm trên cát
    const co = A[6]; co.root.visible = t > 0.0; place(co, BODY[0], 0, BODY[1], 0.4); fall(co, 1); co.mat.color.setHex(0xd0d0d0); co.tag.visible = false;
    // 5 bot ùa tới ngồi quanh lửa
    for (let k = 1; k <= 5; k++) {
      const a = A[k], t0 = 8.2 + (k - 1) * 0.35, u = seg(t, t0, t0 + 2.2), S1 = seat(k), from: [number, number] = [k % 2 ? F[0] + 14 : -8, S1[1] + (k % 3) * 0.8];
      if (t < t0) { a.root.visible = false; continue; }
      if (u < 1) go(a, from, [S1[0], S1[1]], ease(u), dt, 5.2); else { a.root.visible = true; seated(a, S1[0], S1[1], S1[2], t, k); }
    }
    votesFly(votes, [A[1], A[2], A[3], A[4], A[5]], [F[0], F[1]], 11.2, t);
    fire.flames.forEach((f, k) => { f.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(t * 9 + k * 1.7)); f.position.y = 0.2 + 0.35 * f.scale.y; }); fire.light.intensity = 5.5 + Math.sin(t * 17) * 1.2;
    (st.scr.material as THREE.MeshBasicMaterial).color.setHex(t > 4.5 ? 0x55ff88 : Math.sin(t * 7) > 0 ? 0xffd37a : 0xffa31a); st.lbl.visible = t < 4.5;
    alarm.intensity = t > 7.6 && t < 10.5 ? 12 * (0.5 + 0.5 * Math.sin(t * 14)) : 0;
    const follow = ease(seg(t, 7.0, 9.0)), ca = t * 0.1;
    const cx = lerp(px * 0.55 + 1.5, F[0] + Math.sin(ca) * 3.5, follow), cy = lerp(1.7, 3.6, follow), cz = lerp(7.4, 8.8 + Math.cos(ca) * 3.5, follow);
    E.cam(cx, cy, cz, lerp(px * 0.6 + 2.2, F[0], follow), lerp(1.1, 0.9, follow), 0);
  };
  const ov = (g: G, t: number) => {
    const me = A[0];
    if (t > 0.8 && t < 4.6) { const [hx, hy] = E.head(me, 0.2); if (t < 2.0 || t > 4.5) keyHint(g, hx, hy - 8, "E", t); else { keyHint(g, hx + 26, hy + 8, "E", t); bar(g, hx - 30, hy - 22, 60, seg(t, 2.5, 4.4)); chip(g, tr("clip.2.task"), hx, hy - 44); } }
    if (t > 4.5 && t < 5.2) { const [hx, hy] = E.head(me); txt(g, "✔", hx, hy - 16 - (t - 4.5) * 24, 22, "#5f9"); }
    if (t > 5.7 && t < 6.9) { const [bx, by] = E.proj(BODY[0], 1.1, BODY[1]); chip(g, "💀 " + tr("clip.2.body"), bx, by - 14, "#a11d"); const [hx, hy] = E.head(me); bubble(g, hx, hy - 4, "!?"); }
    if (t > 7.0 && t < 8.2) { const [hx, hy] = E.head(me); keyHint(g, hx, hy - 8, "E", t); }
    if (t > 7.6 && t < 10.5) { const f = Math.sin(t * 12) > 0; flash(g, 0.1, f ? "255,40,40" : "40,80,255"); chip(g, "🚨 " + tr("clip.2.meet"), OW / 2, 28, "#c11e", "#fff"); }
    if (t > 10.4) {
      chip(g, "💬 " + tr("clip.2.vote"), OW / 2, 28, "#124a8cee"); const L = ["…?!", "🔍", "😠", "👉", "🗳"];
      for (let k = 1; k <= 5; k++) if (Math.sin(t * 3 + k * 2) > -0.1) { const [hx, hy] = E.head(A[k], -0.3); bubble(g, hx, hy, L[(Math.floor(t * 1.4) + k) % 5], seg(t, 10.4, 11)); }
      if (t > 12.7) { const [hx, hy] = E.head(A[4], 0.2); chip(g, "⏏ 4/7", hx, hy - 30, "#a11d"); }
    }
  };
  return { d: 14, look: SUNSET, group, t: 0, reset, tick: (t, dt) => { tick(t, dt); }, ov };
}

/* ═════════════════════════════ 3 · GIÁN ĐIỆP — rình sau lưng → Q ám sát → chui hang bí mật, trồi ở hang khác (12 s) ═════════════════════════════ */
function clip3(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([2, 3, 4, 5], group), SPY = A[2], VIC = A[3], B1 = A[4], B2 = A[5];
  for (let i = 0; i < 18; i++) tree(group, -14 + i * 1.7 + (hash(i) - 0.5) * 0.8, -1.6 - hash(i + 3) * 1.2, 1 + hash(i + 8) * 0.5);   // hàng cây phía sau (che biển)
  for (let i = 0; i < 9; i++) tree(group, -13 + i * 3.3, -5 - hash(i) * 2, 1.4);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 0.05, 30), stdM(0x16301c)); ground.position.set(0, 0.03, 12); ground.receiveShadow = true; group.add(ground);
  const PA: [number, number] = [4.4, 0.6], PB: [number, number] = [-4.8, 0.6];
  const pit = (p: [number, number]) => { const g = new THREE.Group(); bxm(g, 0, 0, 0, stdM(0), 0, 0, 0); const d = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 24), new THREE.MeshBasicMaterial({ color: 0x021824 })); d.position.y = 0.07; const r = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 28), new THREE.MeshBasicMaterial({ color: 0x6ad2ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.y = 0.09; const l = new THREE.PointLight(0x4cc8ff, 4, 9, 2); l.position.y = 0.8; g.add(d, r, l); g.position.set(p[0], 0, p[1]); group.add(g); return { r, l }; };
  const pa = pit(PA), pb = pit(PB);
  const torch = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.2, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); torch.rotation.z = Math.PI / 2; torch.position.set(2.7, 1.1, 0.2); VIC.root.add(torch);
  const tl = new THREE.PointLight(0xffe6a0, 5, 9, 2); tl.position.set(1.0, 1.2, 0.3); VIC.root.add(tl);
  const reset = () => { A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); SPY.knife.visible = true; SPY.tag.visible = false; };
  let blackK = 0, redK = 0;
  const tick = (t: number, dt: number) => {
    const vx = t < 4.2 ? lerp(-5.4, 0.9, t / 4.2) : 0.9, behind = lerp(3.0, 0.6, ease(seg(t, 0.4, 4.0)));
    // nạn nhân đi lẻ (đèn pin) → bị đâm → ngã
    VIC.root.visible = true; VIC.root.position.set(vx, 0, 0.2); VIC.root.rotation.set(0, Math.PI / 2, 0);
    if (t < 4.2) { const sw = stride(VIC, dt, 2.4); carry(VIC, 0); VIC.s.g.position.y = Math.abs(sw) * 0.03; } else { stand(VIC); carry(VIC, 0); }
    fall(VIC, sm((t - 4.45) / 0.5)); torch.visible = tl.visible = t < 4.5;
    // gián điệp
    const stabK = sm((t - 4.0) / 0.22) * (1 - sm((t - 4.55) / 0.35)), raise = sm((t - 3.2) / 0.6);
    let sxp = vx - behind, sz = 0.2, sy = 0, vis = true;
    if (t < 4.7) { sxp = vx - behind + 0.5 * stabK; }
    else if (t < 6.8) { const k = ease(seg(t, 4.7, 6.8)); sxp = lerp(0.5, PA[0] - 0.1, k); sz = lerp(0.2, PA[1], k); }
    else if (t < 7.6) { sxp = PA[0] - 0.1; sz = PA[1]; sy = -2.6 * sm((t - 7.1) / 0.45); }
    else if (t < 8.0) vis = false;
    else if (t < 8.9) { sxp = PB[0]; sz = PB[1]; sy = -2.6 * (1 - sm((t - 8.0) / 0.8)); }
    else { const k = ease(seg(t, 8.9, 10.6)); sxp = lerp(PB[0], -3.8, k); sz = lerp(PB[1], 0.2, k); }
    SPY.root.visible = vis; SPY.root.position.set(sxp, sy, sz);
    const moving = (t < 4.0) || (t > 4.7 && t < 6.8) || (t > 8.9 && t < 10.6);
    SPY.root.rotation.y = t < 4.7 ? Math.PI / 2 : t < 6.8 ? Math.atan2(PA[0] - 0.5, PA[1] - 0.2) : t < 8.9 ? Math.PI / 2 : lerp(Math.PI / 2, Math.PI / 2, 1);
    if (moving) { const sw = stride(SPY, dt, t > 4.7 && t < 6.8 ? 5.2 : 2.6); free(SPY, 0); SPY.s.armL.rotation.x = -sw * 0.9; } else { stand(SPY); free(SPY, 0); }
    if (t < 4.7) { SPY.s.g.position.y = -0.1 * (1 - raise) * 0; SPY.root.rotation.x = 0.1 * (1 - stabK); const rs = -0.6 - 0.55 * raise, th = -0.35 * stabK; SPY.s.armR.rotation.set(rs + th, 0, -0.1); SPY.s.armR.userData.elbow.rotation.x = -0.5 + 0.35 * stabK; curlArm(SPY.s.armR, 1.5, 0.9); } else SPY.root.rotation.x = 0;
    // hai bot đang nói chuyện (người sẽ làm chứng ngoại phạm)
    place(B1, -2.7, 0, 0.2, Math.PI / 2); place(B2, -1.6, 0, 0.2, -Math.PI / 2); for (const b of [B1, B2]) { stand(b); carry(b, 0); b.s.g.position.y = Math.sin(t * 2 + b.i) * 0.008; }
    pa.r.rotation.z = pb.r.rotation.z = t; pa.l.intensity = 3 + Math.sin(t * 5); pb.l.intensity = 3 + Math.cos(t * 5);
    blackK = t > 7.0 && t < 8.0 ? 1 - Math.abs((t - 7.5) / 0.5) : 0; redK = t > 4.0 && t < 4.4 ? 1 - (t - 4.0) / 0.4 : 0;
    E.cam(0, 1.9, 7.2, 0, 1.1, 0, 40);
  };
  const ov = (g: G, t: number) => {
    const [hx, hy] = E.head(SPY, 0.1);
    if (t > 2.6 && t < 4.0) { keyHint(g, hx, hy - 14, "Q", t); chip(g, "🕵 " + tr("clip.3.stab"), hx, hy - 44, "#a11d"); }
    flash(g, redK * 0.5, "255,60,60"); if (t > 4.4 && t < 5.4) { const [vx, vy] = E.head(VIC); txt(g, "☠", vx, vy - 4 - (t - 4.4) * 16, 22, "#f55"); }
    if (t > 6.0 && t < 7.1) { const [px, py] = E.proj(PA[0], 2.0, PA[1]); keyHint(g, px, py, "E", t); chip(g, "🕳 " + tr("clip.3.burrow"), px, py - 30, "#0a5a8cee"); }
    if (t > 5.9) { g.fillStyle = "#000c"; g.fillRect(372, 10, 98, 50); g.strokeStyle = "#35b"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(456, 26); g.lineTo(386, 40); g.stroke(); g.setLineDash([]); g.fillStyle = "#4cf"; g.fillRect(383, 37, 7, 7); g.fillRect(453, 23, 7, 7); const m = seg(t, 7.0, 8.0); g.fillStyle = "#f44"; g.fillRect(lerp(456, 386, m) - 3, lerp(26, 40, m) - 3, 7, 7); g.fillStyle = "#a33"; g.fillRect(418, 50, 5, 5); }
    if (blackK > 0) { g.fillStyle = `rgba(0,0,0,${blackK})`; g.fillRect(0, 0, OW, OH); }
    if (t > 10.5) { chip(g, "✔ " + tr("clip.3.alibi"), hx, hy - 28, "#1a7a3aee"); }
  };
  return { d: 12, look: NIGHT, group, t: 0, reset, tick, ov };
}

/* ═════════════════════════════ 4 · ĐIỀU KHIỂN — phím sáng lên, nhân vật làm theo: đi · nhảy · lăn · góc nhìn · bơi · bấm Kiểm tra nhiệm vụ (12 s) ═════════════════════════════ */
function clip4(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([0], group), me = A[0], st = makeStation(); st.g.position.set(4.6, 0, 0.1); st.g.rotation.y = -Math.PI / 2; st.lbl.visible = false; group.add(st.g);
  const reset = () => { resetActor(me); me.root.visible = true; me.you.visible = false; };
  let fpp = false, tx = 0, tz = 0, swim = 0;
  const tick = (t: number, dt: number) => {
    let x = -6, z = 0.1, y = 0, ry = Math.PI / 2, rx = 0, gy = 0; swim = 0; fpp = t > 4.8 && t < 7.0;
    if (t < 1.9) { x = lerp(-6, -2.4, ease(t / 1.9)); stride(me, dt, 3.4); }
    else if (t < 2.4) x = -2.4;
    else if (t < 3.3) { const k = (t - 2.4) / 0.9; x = lerp(-2.4, -1.2, k); y = Math.sin(k * Math.PI) * 1.1; me.s.legL.rotation.x = me.s.legR.rotation.x = -0.9 * Math.sin(k * Math.PI); kneeBend(me); }
    else if (t < 3.6) x = -1.2;
    else if (t < 4.5) { const k = ease((t - 3.6) / 0.9); x = lerp(-1.2, 0.8, k); rx = k * Math.PI * 2; y = 0.9; gy = -0.9; me.s.legL.rotation.x = me.s.legR.rotation.x = -1.2; kneeBend(me); }
    else if (t < 7.0) { x = lerp(0.8, 3.0, seg(t, 4.5, 7.0)); if (t > 5.0) stride(me, dt, 2.4); }
    else if (t < 7.6) { x = 3.0; ry = lerp(Math.PI / 2, Math.PI, ease((t - 7.0) / 0.6)); }
    else { const k = seg(t, 7.6, 9.4); x = 3.0; ry = Math.PI; z = lerp(0.1, -5.4, ease(k)); if (z > -3.1) stride(me, dt, 5.5); else { swim = clamp01((-3.1 - z) / 0.8); } }
    me.root.visible = !fpp; me.root.position.set(x, y - swim * 0.85, z); me.root.rotation.set(rx + swim * 1.2, ry, 0); me.s.g.position.y = gy;
    if (swim > 0) { const s = Math.sin(t * 7); free(me, 0); me.s.armL.rotation.x = -2.6 + s * 0.8; me.s.armR.rotation.x = -2.6 - s * 0.8; me.s.legL.rotation.x = s * 0.5; me.s.legR.rotation.x = -s * 0.5; kneeBend(me); }
    else if (t < 7.6 || t > 4.5) free(me, t > 4.5 && t < 7.0 ? 0 : 0);
    if (t < 4.5) { free(me, t < 1.9 ? Math.sin(me.ph) * 0.5 : 0); }
    tx = x; tz = z;
    if (fpp) { E.cam(x + 0.1, 1.62 + Math.sin(t * 9) * 0.02, z, x + 4, 1.5, 0, 58); }
    else if (t < 7.6) E.cam(lerp(-2, 1.4, seg(t, 0, 7)), 1.9, 7.3, x * 0.6 + 1.2, 1.1, 0);
    else E.cam(x - 2.6, 2.4, z + 4.8, x, 0.8, z);
    (st.scr.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 7) > 0 ? 0xffd37a : 0xffa31a);
  };
  const ov = (g: G, t: number) => {
    // bàn phím nổi (dưới trái) — phím sáng đúng lúc nhân vật làm động tác
    const d = (a: number, b: number) => (t >= a && t < b ? 1 : 0), kx = 8, ky = 178; g.fillStyle = "#0009"; g.beginPath(); g.roundRect(kx - 4, ky - 6, 188, 98, 8); g.fill();
    key(g, kx + 32, ky, 26, "W", d(0.1, 1.9) || d(7.6, 9.2)); key(g, kx, ky + 24, 26, "A", 0); key(g, kx + 32, ky + 24, 26, "S", 0); key(g, kx + 64, ky + 24, 26, "D", d(0.1, 1.9));
    key(g, kx + 98, ky, 28, "E", d(5.6, 6.2)); key(g, kx + 98, ky + 24, 28, "V", d(4.7, 5.1)); key(g, kx, ky + 54, 92, "SPACE", d(2.4, 3.0)); key(g, kx + 98, ky + 54, 62, "SHIFT", d(3.6, 4.1));
    emo(g, "🚶", kx + 168, ky + 12, 14); emo(g, "🦘", kx + 168, ky + 66, 14);
    if (fpp) { g.strokeStyle = "#fff9"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(OW / 2 - 9, OH / 2); g.lineTo(OW / 2 + 9, OH / 2); g.moveTo(OW / 2, OH / 2 - 9); g.lineTo(OW / 2, OH / 2 + 9); g.stroke(); chip(g, "👁 1st person · V", OW / 2, 24); }
    if (t > 4.7 && t < 5.1) flash(g, 0.5 * (1 - (t - 4.7) / 0.4));
    if (t > 5.6 && t < 6.9) { const [px, py] = E.proj(4.6, 2.3, 0.1); keyHint(g, px, py, "E", t); }
    const pul = t > 9 ? 0.5 + 0.5 * Math.sin(t * 8) : 0; g.fillStyle = `rgba(255,210,77,${0.25 + 0.4 * pul})`; g.beginPath(); g.roundRect(OW - 168, OH - 40, 158, 30, 9); g.fill(); g.fillStyle = "#1d2350"; g.beginPath(); g.roundRect(OW - 166, OH - 38, 154, 26, 8); g.fill(); txt(g, tr("clip.4.check"), OW - 89, OH - 25, 10, "#fff", 140);
    if (t > 9.0) { const k = ease(seg(t, 9.0, 9.9)); cursor(g, lerp(OW - 60, OW - 96, k), lerp(OH - 110, OH - 28, k)); }
    if (t > 10.2) { const k = seg(t, 10.2, 10.7); g.fillStyle = `rgba(0,0,0,${0.5 * k})`; g.fillRect(0, 0, OW, OH); for (let i = 0; i < 20; i++) { const a = i * 0.7 + t, r = 30 + k * 110; g.fillStyle = ["#ffd24d", "#5f9", "#6af", "#f66"][i % 4]; g.fillRect(OW / 2 + Math.cos(a) * r, OH / 2 + Math.sin(a) * r * 0.55, 6, 6); } txt(g, "🏆 " + tr("clip.4.win"), OW / 2, OH / 2, 22 * k, "#ffd24d"); }
    void tx; void tz;
  };
  return { d: 12, look: SUNSET, group, t: 0, reset, tick, ov };
}

/* ═════════════════════════════ 5 · BẮN NHẦM — súng ngắn · ống ngắm · lựu đạn, rồi bắn nhầm đồng đội → bị bắn trả → ván kết thúc (14 s) ═════════════════════════════ */
function clip5(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([0, 2, 3], group), me = A[0], mate = A[2], far = A[3];
  const barrel = new THREE.Group(); bxm(barrel, 0.6, 1.0, 0.6, stdM(0xb03030), 0, 0.5, 0); bxm(barrel, 0.64, 0.08, 0.64, stdM(0xeeeeee), 0, 0.9, 0); barrel.position.set(5.2, 0, 0); group.add(barrel);
  const tr1 = tracer(group), tr2 = tracer(group), tr3 = tracer(group), nade = buildGrenade(); nade.visible = false; group.add(nade), nade.scale.setScalar(1.6);
  const ball = fireball(group); const sparks = new THREE.PointLight(0xffa040, 0, 12, 2); group.add(sparks);
  const reset = () => { A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); me.you.visible = true; barrel.rotation.set(0, 0, 0); nade.visible = false; };
  let shake = 0, scopeOn = false, scopeFlash = 0, bannerK = 0;
  const handNade = (on: boolean) => { const h = me.s.armR.userData.hand as THREE.Object3D; if (on) { if (nade.parent !== h) { h.add(nade); nade.position.set(0, -2.0 * PX, 0.02); nade.rotation.set(0, 0, 0); } nade.visible = true; } else if (nade.parent === h) group.add(nade); };
  const tick = (t: number, dt: number) => {
    shake = 0; scopeOn = false; scopeFlash = 0; bannerK = 0; for (const m of [tr1, tr2, tr3]) m.visible = false; sparks.intensity = 0; poseFire(ball, 0); handNade(false);
    me.root.visible = mate.root.visible = far.root.visible = false;
    if (t < 6.6) {
      const cut = Math.floor(t / 2.2), u = t - cut * 2.2;
      if (cut === 0) {                                                                    // súng ngắn: bắn vào thùng
        place(me, -3.2, 0, 0.1, Math.PI / 2); stand(me); aimGun(me, "pistol", sm(u / 0.5)); me.tag.visible = false; me.you.visible = false;
        const sh = [0.7, 1.4].map((s) => u > s && u < s + 0.09); flare(me, "pistol", sh[0] || sh[1]);
        const hit = u > 0.7 ? (u < 1.4 ? u - 0.7 : u - 1.4) : -1; if (u > 0.7 && u < 0.95) setTracer(tr1, new THREE.Vector3(-1.9, 1.3, 0.1), new THREE.Vector3(4.9, 1.0, 0), clamp01((u - 0.7) / 0.1)); if (u > 1.4 && u < 1.65) setTracer(tr1, new THREE.Vector3(-1.9, 1.3, 0.1), new THREE.Vector3(4.9, 0.9, 0), clamp01((u - 1.4) / 0.1));
        if (hit >= 0.1 && hit < 0.3) { sparks.position.set(4.8, 1.0, 0.2); sparks.intensity = 6; } barrel.rotation.z = u > 1.45 ? -0.12 * Math.min(1, (u - 1.45) * 4) : 0;
        E.cam(-8.2, 1.9, 3.4, 2.0, 1.1, -0.2, 38);
      } else if (cut === 1) {                                                             // ống ngắm: ngắm mục tiêu ở xa, bắn
        scopeOn = true; const tx = 30 - u * 0.9; place(far, tx, 0, 0, -Math.PI / 2); stand(far); far.tag.visible = false; const sw = stride(far, dt, 1.8); carry(far, 0); far.s.g.position.y = Math.abs(sw) * 0.02;
        if (u > 1.5) { scopeFlash = Math.max(0, 1 - (u - 1.5) * 5); tint(far, u < 1.9); far.root.rotation.x = -Math.min(1, (u - 1.5) * 2) * 0.5; }
        E.cam(-3.1, 1.62 + Math.sin(t * 2.2) * 0.012, 0.05 + Math.sin(t * 1.7) * 0.01, 28, 1.2, 0, 7);
      } else {                                                                            // lựu đạn: giữ chuột giật chốt → ném → nổ
        place(me, -3.2, 0, 0.1, Math.PI / 2); stand(me); free(me, 0); me.tag.visible = false; me.you.visible = false;
        const pin = sm(u / 0.5), wind = sm((u - 0.5) / 0.4), thr = sm((u - 0.9) / 0.2);
        me.s.armR.rotation.set(lerp(-0.9, 0.9, wind) + (-2.9) * thr, 0, 0); ELM(me, -0.4); me.s.armL.rotation.set(-1.0 * pin * (1 - wind) + 0.2 * wind, 0, 0.25 * wind); me.root.rotation.x = -0.18 * wind * (1 - thr) + 0.15 * thr; curlArm(me.s.armR, 1.2, 0.9);
        const nd = nade; if (u < 1.1) handNade(true); else {
          handNade(false); nd.visible = u < 1.8; const k = clamp01((u - 1.1) / 0.7); nd.position.set(lerp(-2.4, 4.2, k), 1.5 + Math.sin(k * Math.PI) * 2.6 - k * 1.0, 0.1); nd.rotation.z = k * 12;
        }
        if (u > 1.8) { const k = seg(u, 1.8, 2.2); ball.position.set(4.2, 0.8, 0.1); poseFire(ball, k); ball.scale.multiplyScalar(1.3); sparks.position.set(4.2, 1.5, 0.5); sparks.intensity = 14 * (1 - k); shake = 0.25 * (1 - k); }
        E.cam(0.6, 1.7, 6.8, 1.0, 1.35, 0, 46);
      }
    } else {                                                                              // cảnh nổ súng nhầm
      const v = t - 6.6; mate.you.visible = false; me.you.visible = true;
      place(me, -3.4, 0, 0.1, Math.PI / 2); place(mate, 1.4, 0, 0.1, v < 1.2 ? Math.PI / 2 : lerp(Math.PI / 2, -Math.PI / 2, ease((v - 1.2) / 0.6)));
      stand(me); stand(mate); me.tag.visible = true;
      const meHit = v > 2.9; aimGun(me, "pistol", sm(v / 0.5)); flare(me, "pistol", v > 0.8 && v < 0.9);
      if (v > 0.8 && v < 1.05) setTracer(tr1, new THREE.Vector3(-1.9, 1.3, 0.1), new THREE.Vector3(1.3, 1.2, 0.1), clamp01((v - 0.8) / 0.12));
      tint(mate, v > 0.9 && v < 1.35); mate.root.rotation.z = v > 0.9 && v < 1.2 ? 0.08 : 0; if (v < 1.2) { carry(mate, 0); }
      if (v >= 1.2) aimGun(mate, "rifle", sm((v - 1.9) / 0.35)); const f1 = (v > 2.45 && v < 2.55) || (v > 2.7 && v < 2.8); flare(mate, "rifle", f1);
      if (v > 2.45 && v < 2.7) setTracer(tr2, new THREE.Vector3(0.0, 1.35, 0.1), new THREE.Vector3(-3.4, 1.3, 0.1), clamp01((v - 2.45) / 0.12)); if (v > 2.7 && v < 2.95) setTracer(tr2, new THREE.Vector3(0.0, 1.35, 0.1), new THREE.Vector3(-3.4, 1.2, 0.1), clamp01((v - 2.7) / 0.12));
      if (meHit) { fall(me, sm((v - 2.9) / 0.55), true); tint(me, v < 3.2); } if (v > 2.45 && v < 3.5) shake = 0.15;
      bannerK = v > 3.7 ? Math.min(1, (v - 3.7) * 3) : 0;
      E.cam(-1.0, 1.5, 7.4, 0, 1.1, 0, 36);
    }
    if (shake) { E.camera.position.x += (Math.random() - 0.5) * shake; E.camera.position.y += (Math.random() - 0.5) * shake; }
    void dt;
  };
  const ov = (g: G, t: number) => {
    if (t < 6.6) {
      const cut = Math.floor(t / 2.2), u = t - cut * 2.2;
      if (scopeOn) {
        g.fillStyle = "#000"; g.beginPath(); g.rect(0, 0, OW, OH); g.moveTo(OW / 2 + 118, OH / 2); g.arc(OW / 2, OH / 2, 118, 0, 7); g.fill("evenodd"); g.strokeStyle = "#000"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(OW / 2 - 118, OH / 2); g.lineTo(OW / 2 + 118, OH / 2); g.moveTo(OW / 2, OH / 2 - 118); g.lineTo(OW / 2, OH / 2 + 118); g.stroke();
        g.strokeStyle = "#f33"; g.beginPath(); g.arc(OW / 2, OH / 2, 10, 0, 7); g.stroke(); flash(g, scopeFlash * 0.6); chip(g, "🎯 " + tr("clip.5.scope"), OW / 2, 26);
      } else if (cut === 0) chip(g, "🔫 " + tr("clip.5.pistol"), OW / 2, 26);
      else { if (u < 0.9) { bar(g, OW / 2 - 60, 54, 120, u / 0.9, "#ffd24d"); } chip(g, "💣 " + tr("clip.5.nade"), OW / 2, 26); }
      if (u < 0.1) flash(g, 0.6 - u * 6); g.fillStyle = "#000"; g.fillRect(0, 0, OW, 14); g.fillRect(0, OH - 14, OW, 14);
      if (cut === 2 && u > 1.8 && u < 2.0) flash(g, 0.5 * (1 - (u - 1.8) / 0.2), "255,190,100");
    } else {
      const v = t - 6.6;
      if (v > 1.5 && v < 3.0) { const [hx, hy] = E.head(mate); bubble(g, hx, hy - 2, tr("clip.5.ouch")); }
      if (v > 2.9 && v < 3.3) flash(g, 0.4 * (1 - (v - 2.9) / 0.4), "255,40,40");
      if (bannerK > 0) { const bl = Math.sin(v * 14) > -0.3 ? 1 : 0.6; g.fillStyle = `rgba(150,0,0,${0.28 * bannerK})`; g.fillRect(0, 0, OW, OH); g.fillStyle = `rgba(0,0,0,${0.62 * bannerK})`; g.fillRect(0, 92, OW, 84); txt(g, "⚠ " + tr("clip.5.banner"), OW / 2, 120, 15, `rgba(255,${90 * bl},${80 * bl},${bannerK})`, 450); txt(g, tr("clip.5.over"), OW / 2, 150, 12, "#fff", 440); }
    }
  };
  return { d: 14, look: SUNSET, group, t: 0, reset, tick, ov };
}

/* ═════════════════════════════ 6 · MỘT LƯỢT CHƠI — làm nhiệm vụ → thấy xác → họp & bỏ phiếu → trục xuất (12 s, 4 nhịp × 3 s) ═════════════════════════════ */
function clip6(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([0, 1, 2, 3, 4, 5, 6], group), st = makeStation(), fire = makeFire(), F: [number, number] = [0, 0];
  st.g.position.set(-1.6, 0, -0.2); st.g.rotation.y = -0.9; st.lbl.visible = false; fire.g.position.set(0, 0, 0); group.add(st.g, fire.g);
  const alarm = new THREE.PointLight(0xff2020, 0, 16, 2); alarm.position.set(0, 3, 3); group.add(alarm); const votes = [0, 1, 2, 3].map(() => envelope(group));
  const fx = Math.sin(-0.9) * 1.35, fz = Math.cos(-0.9) * 1.35, sx = -1.6 + fx, sz = -0.2 + fz, BODY: [number, number] = [1.2, 1.0];
  const seats = [Math.PI, Math.PI + 1.05, Math.PI - 1.05, Math.PI + 2.1, Math.PI - 2.1, 0]; const seat = (i: number) => seatAt(F, seats[i], 2.4);
  const reset = () => { A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); A[0].you.visible = true; };
  let last = -1;
  const tick = (t: number, dt: number) => {
    const b = Math.min(3, Math.floor(t / 3)), u = t - b * 3;
    if (b !== last) { last = b; A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); A[0].you.visible = true; }
    st.g.visible = b === 0; fire.g.visible = b >= 2; A[6].root.visible = false; alarm.intensity = 0;
    fire.flames.forEach((f, k) => { f.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(t * 9 + k * 1.7)); f.position.y = 0.2 + 0.35 * f.scale.y; }); fire.light.intensity = 5.5 + Math.sin(t * 17) * 1.2;
    const me = A[0];
    if (b === 0) {                                                                       // nhiệm vụ: bạn bấm trạm, 2 đồng đội đi tuần phía sau
      stand(me); free(me, 0); me.root.position.set(sx, 0, sz); me.root.rotation.y = Math.atan2(-fx, -fz); const press = Math.max(0, Math.sin(u * 7)) * 0.12; me.s.armL.rotation.set(-1.15 - press, 0, 0); ELM(me, -0.35); curlArm(me.s.armL, 0.25, 0.1);
      go(A[1], [-6, -2.4], [6, -2.6], u / 3, dt, 2.6, "rifle" as GunId); go(A[2], [6, -1.6], [-6, -1.4], u / 3, dt, 2.6, "rifle" as GunId);
      (st.scr.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 7) > 0 ? 0xffd37a : 0xffa31a); E.cam(0.4, 1.6, 6.8, -0.4, 1.1, 0);
    } else if (b === 1) {                                                                // thấy xác → báo động
      const co = A[6]; place(co, BODY[0], 0, BODY[1], 0.4); fall(co, 1); co.tag.visible = false; co.mat.color.setHex(0xd0d0d0);
      go(me, [-5, 2.6], [BODY[0] - 1.3, BODY[1] + 0.3], ease(clamp01(u / 2.0)), dt, 4.2); if (u > 2.0) { stand(me); free(me, 0); me.root.rotation.y = Math.atan2(1.3, -0.3); }
      for (const k of [1, 2]) { const a = A[k]; place(a, 3.6 + k * 1.1, 0, -0.6 - k * 0.2, -Math.PI / 2 + 0.3); stand(a); carry(a, 0); }
      alarm.intensity = u > 2.0 ? 12 * (0.5 + 0.5 * Math.sin(t * 14)) : 0; E.cam(lerp(-0.6, 0.8, u / 3), 1.7, 6.6, 1.2, 0.9, 0.6);
    } else {                                                                             // họp quanh lửa → bỏ phiếu → trục xuất
      for (let k = 0; k < 6; k++) { const s = seat(k), a = A[k]; seated(a, s[0], s[1], s[2], t, k); a.root.visible = true; }
      if (b === 2) votesFly(votes, [A[1], A[2], A[3], A[5]], [0, 0], 0.2, u);
      else {                                                                             // người bị loại bật dậy, giơ tay rồi bay đi
        const x0 = A[4], s = seat(4), dwell = clamp01((u - 0.2) / 0.35), fly = clamp01((u - 0.7) / 1.6);
        sit(x0, false); stand(x0); free(x0, 0); x0.s.armL.rotation.x = x0.s.armR.rotation.x = -2.6 * sm(dwell); x0.tag.visible = false;
        x0.root.position.set(s[0] + 5 * fly * fly, 0.12 * (1 - fly) + 5.5 * fly * fly, s[1] - 1.2 * fly); x0.root.rotation.y = s[2] + fly * 14; x0.root.scale.setScalar(Math.max(0.001, 1 - fly));
      }
      const ca = t * 0.12; E.cam(Math.sin(ca) * 3.2, 3.4, Math.cos(ca) * 3 + 8.0, 0, 0.8, 0);
    }
  };
  const ov = (g: G, t: number) => {
    const b = Math.min(3, Math.floor(t / 3)), u = t - b * 3, L = ["🚶 " + tr("clip.6.a"), "💀 " + tr("clip.6.b"), "🗳 " + tr("clip.6.c"), "⏏ " + tr("clip.6.d")];
    for (let i = 0; i < 4; i++) { if (i === b) chip(g, L[i], 120, 22, "#3a4bd6ee", "#fff"); else emo(g, L[i].split(" ")[0], 270 + (i < b ? i : i - 1) * 34, 22, 16); }
    if (u < 0.15) flash(g, 0.7 - u * 4.5);
    if (b === 0) { const [hx, hy] = E.head(A[0], 0.2); bar(g, hx - 30, hy - 22, 60, seg(u, 0.3, 2.6)); keyHint(g, hx + 28, hy + 8, "E", t); }
    if (b === 1 && u > 1.8) { const [hx, hy] = E.head(A[0]); bubble(g, hx, hy - 4, "!?"); const [bx, by] = E.proj(BODY[0], 1.2, BODY[1]); chip(g, "🚨 " + tr("clip.2.body"), bx, by - 14, "#a11d"); }
    if (b === 3 && u > 1.5) { const x = A[4]; void x; chip(g, "⏏ 4/7", OW / 2, 235, "#a11d"); }
  };
  return { d: 12, look: SUNSET, group, t: 0, reset, tick, ov };
}

/* ═════════════════════════════ 7 · MÃ HOÁ — vai trò là mật mã (FHE) trên chuỗi → hết ván mới công khai (9 s) ═════════════════════════════ */
function clip7(E: Env): Clip {
  const group = new THREE.Group(), A = newActors([0, 1, 2, 3, 4, 5, 6], group), SPY = 3;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(60, 0.05, 24), stdM(0x0c2a1a)); ground.position.set(0, 0.03, 8); ground.receiveShadow = true; group.add(ground);
  const red = new THREE.PointLight(0xff3030, 0, 7, 2); red.position.set(0, 2.4, 0.6); group.add(red);
  const X = (i: number) => -6 + i * 2.0;
  const reset = () => { A.forEach(resetActor); A.forEach((a) => (a.root.visible = false)); A[0].you.visible = true; };
  const tick = (t: number) => {
    const rev = ease(seg(t, 5.6, 6.6));
    for (let i = 0; i < 7; i++) { const a = A[i]; place(a, X(i), 0, 0, Math.sin(t * 0.7 + i) * 0.15); stand(a); carry(a, 0); a.s.g.position.y = Math.sin(t * 2 + i) * 0.008; tint(a, false); a.mat.color.setHex(i === SPY && rev > 0.5 ? 0xff8a8a : 0xffffff); }
    red.position.x = X(SPY); red.intensity = 6 * rev; E.cam(lerp(0, 0.4, t / 9), 1.7, lerp(14.2, 12.6, t / 9), 0, 1.6, 0);
  };
  const ov = (g: G, t: number) => {
    g.fillStyle = "rgba(80,255,160,.5)"; g.font = "10px ui-monospace,monospace"; g.textAlign = "center"; for (let c = 0; c < 28; c++) for (let r = 0; r < 6; r++) { const y = ((r * 52 + t * (40 + hash(c) * 60) + hash(c * 3) * 270) % 300) - 20; g.globalAlpha = 0.07 + 0.2 * hash(c + r); g.fillText("0123456789abcdef"[Math.floor(hash(c * 7 + r + Math.floor(t * 6)) * 16)], c * 17 + 8, y); } g.globalAlpha = 1;
    const rev = ease(seg(t, 5.6, 6.6)), scan = seg(t, 5.0, 6.4);
    for (let i = 0; i < 7; i++) {
      const [hx, hy] = E.head(A[i], 0.25), flip = clamp01(rev * 1.7 - i * 0.1), w = Math.abs(Math.cos(flip * Math.PI)) * 40, face = flip > 0.5, cy = hy - 30;
      g.save(); g.translate(hx, cy); g.fillStyle = face ? (i === SPY ? "#5a1414" : "#124a28") : "#07130dcc"; g.strokeStyle = face ? (i === SPY ? "#f55" : "#5f9") : "#2f9a5a"; g.lineWidth = 1.5; g.beginPath(); g.roundRect(-w / 2, -28, w, 56, 6); g.fill(); g.stroke();
      if (w > 18) { g.beginPath(); g.rect(-w / 2 + 2, -26, w - 4, 52); g.clip(); if (face) { emo(g, i === SPY ? "🕵" : "🎖", 0, -6, 20); txt(g, i === SPY ? tr("clip.7.spy") : tr("clip.7.crew"), 0, 16, 6.5, i === SPY ? "#f88" : "#8fb", 38); } else { for (let r = 0; r < 4; r++) { let s = ""; for (let k = 0; k < 4; k++) s += "0123456789abcdef"[Math.floor(hash(i * 31 + r * 7 + k + Math.floor(t * 9)) * 16)]; g.font = "9px ui-monospace,monospace"; g.fillStyle = "#5f9"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, 0, -19 + r * 10); } emo(g, "🔒", 0, 19, 12); } }
      g.restore();
    }
    if (scan > 0 && scan < 1) { g.fillStyle = "#9fffd0"; g.fillRect(20 + scan * 440, 60, 3, 150); g.fillStyle = "rgba(100,255,180,.1)"; g.fillRect(20, 60, scan * 440, 150); }
    chip(g, "🔐 FHE · " + (t < 5 ? tr("clip.7.enc") : tr("clip.7.rev")), OW / 2, 24, "#062a18ee", "#7fffb4"); chip(g, t < 5 ? "⛓ Sepolia · Zama" : "✔ KMS", OW / 2, 248, "#000a", "#9fe3b4");
  };
  return { d: 9, look: MATRIX, group, t: 0, reset, tick: (t) => tick(t), ov };
}

/* ───────────── chạy: một vòng rAF chung, chỉ dựng + render cảnh của thẻ đang nhìn thấy ───────────── */
const MAKE: Record<number, (E: Env) => Clip> = { 1: clip1, 2: clip2, 3: clip3, 4: clip4, 5: clip5, 6: clip6, 7: clip7 };
export const hasClip = (n: number) => !!MAKE[n];
export const clipHtml = (n: number) => (MAKE[n] ? `<div class="clipw"><canvas class="clip" data-c="${n}" width="${RW}" height="${RH}" aria-hidden="true"></canvas><button class="clipfs" type="button" title="Fullscreen" aria-label="Fullscreen">⛶</button></div>` : "");

const clips = new Map<number, Clip>(), seen = new Set<HTMLCanvasElement>(), shown = new Set<HTMLCanvasElement>();
let raf = 0, io: IntersectionObserver | null = null, last = 0, E0: Env | null = null;
function getClip(n: number): Clip | null {
  let c = clips.get(n); if (c) return c; const E = env(); if (!E || !MAKE[n]) return null;
  try { c = MAKE[n](E); E.scene.add(c.group); c.group.visible = false; c.reset(); clips.set(n, c); return c; } catch (e) { console.warn("clip", n, e); return null; }
}
function frame(now: number) {
  raf = 0; const E = E0; if (!E || !shown.size) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden) {
    const byClip = new Map<number, HTMLCanvasElement[]>(); shown.forEach((cv) => { const n = Number(cv.dataset.c); (byClip.get(n) ?? byClip.set(n, []).get(n)!).push(cv); });
    byClip.forEach((cvs, n) => {
      const c = getClip(n); if (!c) return;
      c.t += dt; if (c.t >= c.d) { c.t -= c.d; c.reset(); }
      clips.forEach((o) => (o.group.visible = false)); c.group.visible = true; applyLook(E, c.look);
      try { c.tick(c.t, dt); } catch (e) { console.warn("clip tick", n, e); return; }
      E.renderer.render(E.scene, E.camera);
      for (const cv of cvs) {
        const g = cv.getContext("2d"); if (!g) continue; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(E.renderer.domElement, 0, 0, cv.width, cv.height);
        g.save(); g.scale(cv.width / OW, cv.height / OH); c.ov(g, c.t);
        const v = g.createRadialGradient(OW / 2, OH / 2, OH * 0.5, OW / 2, OH / 2, OH * 1.0); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.4)"); g.fillStyle = v; g.fillRect(0, 0, OW, OH);
        g.fillStyle = "#0008"; g.fillRect(0, OH - 3, OW, 3); g.fillStyle = "#ffd24d"; g.fillRect(0, OH - 3, OW * c.t / c.d, 3); g.restore();
      }
    });
  }
  raf = requestAnimationFrame(frame);
}
const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Gắn video vào mọi <canvas class="clip"> trong root (gọi sau khi chèn HTML của thẻ). Không có WebGL → ẩn canvas, thẻ vẫn còn chữ. */
export function mountClips(root: ParentNode = document) {
  const cvs = Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas.clip")); if (!cvs.length) return;
  // bấm vào video (hoặc nút ⛶) = xem toàn màn hình thật; bấm lần nữa / Esc để thoát
  root.querySelectorAll<HTMLElement>(".clipw").forEach((w) => {
    const cv = w.querySelector("canvas")!, go = () => { try { if (document.fullscreenElement) void document.exitFullscreen(); else void (cv.requestFullscreen ?? (cv as any).webkitRequestFullscreen)?.call(cv); } catch { /* bỏ qua */ } };
    cv.addEventListener("click", go); w.querySelector(".clipfs")!.addEventListener("click", go);
  });
  E0 = env(); if (!E0) { cvs.forEach((c) => (c.style.display = "none")); return; }
  if (!io) io = new IntersectionObserver((es) => {
    for (const e of es) { const c = e.target as HTMLCanvasElement; if (e.isIntersecting) shown.add(c); else shown.delete(c); }
    if (shown.size && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }, { threshold: 0.12 });
  for (const c of cvs) { if (seen.has(c)) continue; seen.add(c); io.observe(c); }
  if (calm()) { /* giảm chuyển động: chỉ vẽ một khung tĩnh cho mỗi thẻ khi nó hiện ra */ }
}
/** Dùng cho kiểm thử / ảnh tĩnh: vẽ đúng 1 khung của clip n tại giây t vào canvas cv. */
export function drawClipAt(cv: HTMLCanvasElement, n: number, t: number) {
  const E = env(), c = E && getClip(n); if (!E || !c) return; E0 = E;
  c.reset(); let tt = 0; const step = 1 / 30; while (tt < t) { const d = Math.min(step, t - tt); tt += d; c.tick(tt, d); }
  clips.forEach((o) => (o.group.visible = false)); c.group.visible = true; applyLook(E, c.look); c.tick(t, 0); E.renderer.render(E.scene, E.camera);
  const g = cv.getContext("2d")!; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(E.renderer.domElement, 0, 0, cv.width, cv.height); g.save(); g.scale(cv.width / OW, cv.height / OH); c.ov(g, t); g.restore();
}
void OH;
