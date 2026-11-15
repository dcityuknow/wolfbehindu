import * as THREE from "three";
import { buildSoldier, defOf, PX } from "../world/soldier";
import { attachGun, type GunRig } from "../world/guns";
import { curlArm, poseFull } from "../world/gunpose";
import type { Entity } from "../types";
import { COLORS, SQUAD, NAMES, type GunId } from "../config";

/**
 * Sân khấu 3D cho phần intro (thay cho trailer SVG 2D cũ).
 * Dùng CHÍNH người lính voxel của game (buildSoldier: quân phục rằn ri riêng từng nước, băng tay màu, cờ, bàn tay + ngón tay, súng đeo / cầm)
 * nên nhân vật trong intro giống hệt lúc chơi. 6 cảnh, mỗi cảnh một đoạn diễn xuất 3D; chữ và hiệu ứng DOM nằm đè lên (xem intro.ts).
 * Dùng WebGLRenderer riêng, chỉ vẽ khi màn hình intro đang hiện.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sm = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const BOT_GUNS: GunId[] = ["rifle", "pistol", "rifle", "rifle", "pistol", "rifle", "rifle"];

/* ───── nhân vật ───── */
interface Actor {
  i: number; root: THREE.Group; s: ReturnType<typeof buildSoldier>; mat: THREE.MeshStandardMaterial; gr: GunRig;
  ph: number; tag: THREE.Sprite; you: THREE.Sprite; q: THREE.Sprite; knife: THREE.Group;
}

function textSprite(draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, cw: number, ch: number, sw: number, sh: number) {
  const c = document.createElement("canvas"); c.width = cw; c.height = ch; draw(c.getContext("2d")!, cw, ch);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set(sw, sh, 1); sp.renderOrder = 5; return sp;
}

function makeActor(i: number): Actor {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const def = defOf(SQUAD[i]), s = buildSoldier(def, mat, COLORS[i]);
  const gr = attachGun(s.g, BOT_GUNS[i], true, def.pack ? -0.27 : -0.16)   // full = cùng bộ súng + tư thế cầm súng như người chơi trong game;
  const root = new THREE.Group(); root.rotation.order = "YXZ"; root.add(s.g);
  const tag = textSprite((x, w, h) => { x.font = "bold 22px system-ui"; x.textAlign = "center"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(4, 3, w - 8, h - 6); x.fillStyle = "#fff"; x.fillText(NAMES[i], w / 2, 24); }, 128, 32, 0.95, 0.24);
  tag.position.y = 2.25; root.add(tag);
  const you = textSprite((x, w, h) => { x.font = "900 54px system-ui"; x.textAlign = "center"; x.lineWidth = 10; x.strokeStyle = "#000"; x.strokeText("YOU", w / 2, 56); x.fillStyle = "#fff"; x.fillText("YOU", w / 2, 56); x.beginPath(); x.moveTo(w / 2 - 22, 72); x.lineTo(w / 2 + 22, 72); x.lineTo(w / 2, 108); x.closePath(); x.lineWidth = 8; x.stroke(); x.fill(); }, 192, 120, 1.2, 0.75);
  you.position.y = 2.95; you.visible = false; root.add(you);
  const q = textSprite((x, w, h) => { x.font = "900 100px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.lineWidth = 12; x.strokeStyle = "#000"; x.strokeText("?", w / 2, h / 2); x.fillStyle = "#ffd24d"; x.fillText("?", w / 2, h / 2); }, 128, 128, 0.9, 0.9);
  q.position.y = 2.6; q.visible = false; root.add(q);
  // dao găm (chỉ hiện ở cảnh ám sát): cán tối nằm trong nắm tay, lưỡi thép chìa ra theo hướng cẳng tay
  const knife = new THREE.Group();
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.27, 0.012), new THREE.MeshStandardMaterial({ color: 0xd2d9e3, metalness: 0.8, roughness: 0.3 })); kb.position.y = -0.235; kb.castShadow = true;
  const kh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.8 })); kh.position.y = -0.04;
  knife.add(kb, kh); knife.position.y = -2.0 * PX; knife.visible = false; (s.armR.userData.hand as THREE.Object3D).add(knife);
  return { i, root, s, mat, gr, ph: 0, tag, you, q, knife };
}

const kneeBend = (a: Actor) => { for (const l of [a.s.legL, a.s.legR]) { const x = l.rotation.x, k = l.userData.knee as THREE.Object3D | undefined; if (k) k.rotation.x = Math.max(0, x) * 1.1 + (x < -0.9 ? -(x + 0.9) * 1.3 : 0) + 0.04; } };
const place = (a: Actor, x: number, y: number, z: number, ry: number) => { a.root.position.set(x, y, z); a.root.rotation.y = ry; a.root.visible = true; };
const stand = (a: Actor) => { a.s.legL.rotation.x = 0; a.s.legR.rotation.x = 0; kneeBend(a); };
/** đi bộ: vung chân theo tốc độ; trả về biên độ vung (dùng để vung tay) */
function stride(a: Actor, dt: number, spd: number) {
  a.ph += Math.min(spd, 8) * dt * 2.3; const sw = Math.sin(a.ph) * 0.8 * Math.min(1, spd / 3);
  a.s.legL.rotation.x = sw; a.s.legR.rotation.x = -sw; kneeBend(a); return sw;
}
/** hai tay cầm súng — dùng chính poseFull của người chơi (tay phải ôm báng, tay trái đỡ ốp tay, súng ngang ngực) */
const _ps = { aim: 0, pitch: 0 } as Entity;
function carry(a: Actor, _t: number) {
  a.gr.pivot.visible = true;
  poseFull(_ps, a.gr, a.s.armL, a.s.armR, 1 / 60, 0, BOT_GUNS[a.i]);
}
/** hai tay buông tự do (cất súng cầm trên tay, cả 3 súng đeo trên người vẫn thấy) */
function free(a: Actor, sw = 0) {
  a.gr.pivot.visible = true;
  for (const t of Object.keys(a.gr.slung) as GunId[]) { a.gr.slung[t]!.visible = true; a.gr.models[t]!.visible = false; }
  a.gr.hooks.forEach((h) => (h.visible = true)); if (a.gr.nade) a.gr.nade.visible = false; a.gr.st.handPrev = null; a.gr.st.swPrev = null;
  a.s.armL.rotation.set(-sw * 0.9, 0, 0); a.s.armR.rotation.set(sw * 0.9, 0, 0);
  a.s.armL.userData.elbow.rotation.x = -0.2 - 0.6 * Math.max(0, sw); a.s.armR.userData.elbow.rotation.x = -0.2 - 0.6 * Math.max(0, -sw);
  curlArm(a.s.armL, 0.9, 0.5); curlArm(a.s.armR, 0.9, 0.5);
}
function sit(a: Actor, on: boolean) {
  const k = on ? 1 : 0;
  a.s.legL.rotation.x = a.s.legR.rotation.x = -Math.PI / 2 * k; kneeBend(a); a.s.g.position.y = -0.34 * k;
}
function resetActor(a: Actor) {
  a.root.visible = false; a.root.position.set(0, 0, 0); a.root.rotation.set(0, 0, 0); a.root.scale.setScalar(1);
  a.s.g.position.set(0, 0, 0); a.s.g.rotation.set(0, 0, 0); a.mat.color.setHex(0xffffff); a.mat.transparent = false; a.mat.opacity = 1;
  a.tag.visible = true; a.you.visible = false; a.q.visible = false; a.knife.visible = false; a.ph = 0;
  stand(a); a.gr.pivot.visible = true; a.gr.st.swPrev = null; a.gr.st.handPrev = null;
}

/* ───── cảnh nền: bãi biển lúc hoàng hôn ───── */
const SUNSET = { top: 0x16294a, mid: 0x6a5a82, hor: 0xe59a62 };
function buildWorld(scene: THREE.Scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(SUNSET.top) }, mid: { value: new THREE.Color(SUNSET.mid) }, hor: { value: new THREE.Color(SUNSET.hor) } },
    vertexShader: "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform vec3 top,mid,hor;varying vec3 p;void main(){float h=clamp(normalize(p).y,0.,1.);vec3 c=mix(hor,mid,smoothstep(0.,.18,h));c=mix(c,top,smoothstep(.15,.7,h));gl_FragColor=vec4(c,1.);}",
  }));
  sky.renderOrder = -10; scene.add(sky);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false })); sun.position.set(26, 3, -110); scene.add(sun);
  const sand = new THREE.Mesh(new THREE.BoxGeometry(120, 0.4, 40), new THREE.MeshStandardMaterial({ color: 0xcfb87c, roughness: 1 })); sand.position.set(0, -0.2, 17); sand.receiveShadow = true; scene.add(sand);
  const wet = new THREE.Mesh(new THREE.BoxGeometry(120, 0.02, 2.2), new THREE.MeshStandardMaterial({ color: 0xb59b62, roughness: 1 })); wet.position.set(0, 0.005, -1.9); wet.receiveShadow = true; scene.add(wet);
  const foam = new THREE.Mesh(new THREE.BoxGeometry(120, 0.03, 0.35), new THREE.MeshStandardMaterial({ color: 0xefe0aa, roughness: 1 })); foam.position.set(0, 0.01, -3.15); scene.add(foam);
  const sea = new THREE.Mesh(new THREE.BoxGeometry(600, 0.3, 300), new THREE.MeshStandardMaterial({ color: 0x2aa6c8, roughness: 0.35, metalness: 0.1 })); sea.position.set(0, -0.25, -153); scene.add(sea);
  // cây dừa voxel + đá
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
  const palm = (x: number, z: number, h: number, lean: number) => {
    for (let k = 0; k < 6; k++) box(0.42 - k * 0.025, h / 6, 0.42 - k * 0.025, k & 1 ? 0x8a5a2e : 0x7a4d26, x + lean * (k / 6) * (k / 6), h / 12 + (k * h) / 6, z);
    const tx = x + lean, ty = h + 0.1;
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; for (let j = 0; j < 3; j++) box(0.5, 0.12, 0.5, j === 2 ? 0x1f7a30 : 0x2f9a3e, tx + Math.cos(a) * (0.45 + j * 0.5), ty - j * 0.16, z + Math.sin(a) * (0.45 + j * 0.5), -a); }
    box(0.34, 0.34, 0.34, 0x5a3a1a, tx, ty - 0.1, z);
  };
  palm(-9.5, -0.5, 5.2, 0.8); palm(10, -1, 4.6, -0.7); palm(-16, -2, 5.8, 0.5); palm(15, 1.5, 5, -0.4);
  box(1.4, 0.8, 1.1, 0x7d7a72, -6.2, 0.4, -0.6, 0.4); box(0.9, 0.5, 0.8, 0x8a867d, -5.4, 0.25, 0.1, -0.3); box(1.2, 0.7, 1.0, 0x7d7a72, 7.2, 0.35, -0.4, 0.2);
  // mây hoàng hôn
  const clouds: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(18 + (k % 3) * 8, 2.4, 6), new THREE.MeshBasicMaterial({ color: k & 1 ? 0xf3c7a6 : 0xd9a89a, fog: false })); c.position.set(-80 + k * 32, 26 + (k % 3) * 5, -150 - (k % 2) * 30); scene.add(c); clouds.push(c); }
  // ánh sáng
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x7a6a50, 1.15));
  const key = new THREE.DirectionalLight(0xfff0dd, 2.4); key.position.set(-5, 7, 9); key.target.position.set(0, 1, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 }); key.shadow.bias = -0.0008; key.shadow.normalBias = 0.04;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xff9a5a, 1.3); rim.position.set(12, 4, -9); scene.add(rim);
  return { clouds };
}

/* ───── công trình / đạo cụ riêng từng cảnh ───── */
function makeStation() {
  const g = new THREE.Group(), m = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.9), m(0x5a3a1a)); base.position.y = 0.85; base.castShadow = true; g.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.14, 1.04), m(0x3d2810)); top.position.y = 1.77; g.add(top);
  const scr = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7, 0.06), new THREE.MeshBasicMaterial({ color: 0xffa31a })); scr.position.set(0, 1.15, 0.47); g.add(scr);
  for (let k = 0; k < 4; k++) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: k & 1 ? 0x55ff88 : 0xff5544 })); led.position.set(-0.45 + k * 0.3, 0.55, 0.47); g.add(led); }
  const lbl = textSprite((x, w, h) => { x.font = "800 40px system-ui"; x.textAlign = "center"; x.lineWidth = 8; x.strokeStyle = "#000"; x.strokeText("E · task", w / 2, 46); x.fillStyle = "#ffe08a"; x.fillText("E · task", w / 2, 46); }, 256, 64, 1.5, 0.375);
  lbl.position.set(0, 2.35, 0.2); g.add(lbl);
  return { g, scr, lbl };
}
function makeFire() {
  const g = new THREE.Group(), brown = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 1 });
  for (let k = 0; k < 5; k++) { const lg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.16), brown); lg.position.y = 0.1 + (k % 2) * 0.12; lg.rotation.y = (k / 5) * Math.PI; lg.castShadow = true; g.add(lg); }
  const flames: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, r = k === 5 ? 0 : 0.2; const f = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), new THREE.MeshBasicMaterial({ color: k & 1 ? 0xffd23f : 0xff7a1a })); f.position.set(Math.cos(a) * r, 0.45, Math.sin(a) * r); g.add(f); flames.push(f); }
  const light = new THREE.PointLight(0xff9a3a, 6, 14, 2); light.position.y = 1.0; g.add(light);
  // ghế gỗ quanh lửa
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3, lg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.26, 0.45), brown); lg.position.set(Math.cos(a) * 2.75, 0.13, Math.sin(a) * 2.75); lg.rotation.y = -a + Math.PI / 2; lg.receiveShadow = true; g.add(lg); }
  return { g, flames, light };
}
function makePedestals() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 2.4), new THREE.MeshStandardMaterial({ color: 0x2c7a3e, roughness: 0.8 })); a.position.set(-2.9, 0.08, 0); a.receiveShadow = true;
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 2.4), new THREE.MeshStandardMaterial({ color: 0x9a2a2a, roughness: 0.8 })); b.position.set(3.1, 0.08, 0); b.receiveShadow = true;
  g.add(a, b); return g;
}
const envelopeTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!; x.font = "54px system-ui"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("✉", 32, 34); return new THREE.CanvasTexture(c); })();

/* ───── sân khấu ───── */
export interface Stage { setScene(n: number): void; pause(p: boolean): void }

export function initStage(cv: HTMLCanvasElement, isShown: () => boolean): Stage | null {
  const renderer = (() => { try { return new THREE.WebGLRenderer({ canvas: cv, antialias: true }); } catch { return null; } })();
  if (!renderer) return null;   // máy không có WebGL: để nền gradient + chữ
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 2.1, 0.1, 700);
  const { clouds } = buildWorld(scene);
  const actors = Array.from({ length: 7 }, (_, i) => makeActor(i)); for (const a of actors) { scene.add(a.root); a.root.visible = false; }
  const station = makeStation(), fire = makeFire(), pods = makePedestals(); scene.add(station.g, fire.g, pods);
  const alarm = new THREE.PointLight(0xff2020, 0, 14, 2); alarm.position.set(0.6, 3, 3); scene.add(alarm);
  const votes = [1, 2, 3, 4].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: envelopeTex, transparent: true, depthTest: false })); s.scale.set(0.55, 0.55, 1); s.renderOrder = 6; s.visible = false; scene.add(s); return s; });

  const resize = () => { const w = cv.clientWidth || 640, h = cv.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(cv); resize();
  const cam = (px: number, py: number, pz: number, lx: number, ly: number, lz: number) => { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); };
  const A = actors;

  /* Mỗi cảnh: show() đặt đạo cụ, tick(t, dt) diễn xuất theo thời gian t (giây kể từ lúc cảnh bắt đầu) */
  type Sc = { show: () => void; tick: (t: number, dt: number) => void };
  const SC: Sc[] = [
    { // 0 · lạc đảo: 4 người lính đi bộ từ trái vào bờ biển rồi đứng nhìn quanh
      show() { A[0].you.visible = true; for (let i = 0; i < 4; i++) place(A[i], -9, 0, 0.2, Math.PI / 2); },
      tick(t, dt) {
        for (let i = 0; i < 4; i++) {
          const a = A[i], p = clamp01((t - i * 0.25) / 1.8), e = 1 - Math.pow(1 - p, 3), ex = -3 + i * 2;
          const x = lerp(-9 - i * 1.2, ex, e);
          if (p < 1) { const sw = stride(a, dt, 3.2); carry(a, t); a.root.position.set(x, 0, 0.2); a.root.rotation.y = Math.PI / 2; a.s.g.position.y = Math.abs(sw) * 0.03; void sw; }
          else { stand(a); carry(a, t); a.s.g.position.y = Math.sin(t * 2 + i) * 0.008; a.root.position.set(ex, 0, 0.2); const tn = sm((t - (i * 0.25 + 1.8)) / 0.5); a.root.rotation.y = lerp(Math.PI / 2, 0, tn) + Math.sin(t * 0.9 + i * 1.7) * 0.28 * tn; }   // nhìn quanh biển
        }
        A[0].you.position.y = 2.95 + Math.sin(t * 5) * 0.06;
        cam(lerp(-0.6, 0.4, t / 6.5), 1.45, lerp(6.8, 6.0, t / 6.5), 0, 1.05, 0);
      },
    },
    { // 1 · nhiệm vụ: đi tới trạm, đưa tay bấm E
      show() { station.g.visible = true; station.g.position.set(2.7, 0, 0); station.g.rotation.y = -0.9; place(A[1], -4.5, 0, 0.9, Math.PI / 2); },
      tick(t, dt) {
        const a = A[1], F = new THREE.Vector3(Math.sin(-0.9), 0, Math.cos(-0.9)), tx = 2.7 + F.x * 1.35, tz = F.z * 1.35, p = clamp01(t / 2.1), e = 1 - Math.pow(1 - p, 2);
        if (p < 1) { const sw = stride(a, dt, 3); free(a, sw); a.root.position.set(lerp(-4.5, tx, e), 0, lerp(0.9, tz, e)); a.root.rotation.y = Math.atan2(tx + 4.5, tz - 0.9); }
        else {
          stand(a); const tn = sm((t - 2.1) / 0.4); a.root.position.set(tx, 0, tz); a.root.rotation.y = lerp(Math.atan2(tx + 4.5, tz - 0.9), Math.atan2(-F.x, -F.z), tn);
          free(a, 0); const press = t > 2.5 ? Math.max(0, Math.sin((t - 2.5) * 7)) * 0.12 : 0;   // đưa tay bấm vào màn hình
          a.s.armL.rotation.set(-1.15 * tn - press, 0, 0); a.s.armL.userData.elbow.rotation.x = -0.35; curlArm(a.s.armL, 0.25, 0.1);
        }
        (station.scr.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 7) > 0 ? 0xffd37a : 0xffa31a);
        station.lbl.position.y = 2.35 + Math.sin(t * 4) * 0.05;
        cam(lerp(0.4, 1.0, t / 6.5), 1.5, 6.3, 1.4, 1.1, 0);
      },
    },
    { // 2 · gián điệp ẩn: ai cũng có dấu "?"
      show() { for (let i = 0; i < 4; i++) { place(A[i], -3 + i * 2, 0, 0.2, 0); A[i].q.visible = true; } A[0].you.visible = true; },
      tick(t) {
        for (let i = 0; i < 4; i++) {
          const a = A[i]; carry(a, t); stand(a); a.s.g.position.y = Math.sin(t * 2 + i) * 0.008; a.root.rotation.y = Math.sin(t * 0.8 + i * 2.1) * 0.22;
          const k = sm((t - i * 0.15) / 0.5); a.q.scale.setScalar(0.9 * k); a.q.position.y = 2.6 + Math.sin(t * 3 + i) * 0.07;
        }
        A[0].you.position.y = 2.95 + Math.sin(t * 5) * 0.06;
        cam(Math.sin(t * 0.35) * 0.8, 1.5, 6.4, 0, 1.15, 0);
      },
    },
    { // 3 · ám sát: gián điệp áo đỏ đi sau lưng, đâm; nạn nhân ngã, đèn báo động đỏ
      show() { place(A[0], -4.5, 0, 0.1, Math.PI / 2); A[0].knife.visible = true; A[0].tag.visible = false; place(A[1], 1.6, 0, 0.1, Math.PI / 2); },
      tick(t, dt) {
        const sp = A[0], v = A[1], p = clamp01(t / 1.6), e = 1 - Math.pow(1 - p, 2);
        const lunge = sm((t - 1.4) / 0.25) * (1 - sm((t - 2.1) / 0.5));
        if (p < 1) { const sw = stride(sp, dt, 3); free(sp, 0); sp.s.armL.rotation.x = -sw * 0.9; } else { stand(sp); free(sp, 0); sp.s.armL.rotation.x = 0.2; }
        sp.root.position.set(lerp(-4.5, 0.35, e) + 0.5 * lunge, 0, 0.1);
        const raise = -0.6 - 0.55 * sm(t / 1.2), thrust = -0.35 * sm((t - 1.4) / 0.25) * (1 - sm((t - 2.1) / 0.5));   // giơ dao lên, rồi đâm tới
        sp.s.armR.rotation.set(raise + thrust, 0, -0.1); sp.s.armR.userData.elbow.rotation.x = -0.5 + 0.35 * sm((t - 1.4) / 0.25); curlArm(sp.s.armR, 1.5, 0.9);
        // nạn nhân đứng quay lưng, bị đâm ở t = 1.7 thì ngã sấp về phía trước
        carry(v, t); stand(v);
        const f = sm((t - 1.7) / 0.5);
        v.root.rotation.x = f * Math.PI / 2; v.root.position.set(1.6, 0.23 * f, 0.1);
        if (t > 1.9) { v.mat.color.setHex(0x8a8a8a); v.tag.visible = false; v.gr.pivot.visible = false; v.s.armL.rotation.set(-0.3, 0, 0.5); v.s.armR.rotation.set(-0.3, 0, -0.5); }
        alarm.intensity = t > 1.7 ? 10 * (0.5 + 0.5 * Math.sin(t * 14)) * clamp01(1 - (t - 1.7) / 4) : 0;
        cam(lerp(0.6, 1.1, sm(t / 6)), lerp(1.5, 1.9, sm((t - 1.7) / 2)), lerp(6.3, 5.3, sm((t - 1.7) / 2)), lerp(0.9, 1.2, sm(t / 6)), lerp(1.1, 0.8, sm((t - 1.7) / 2)), 0);
      },
    },
    { // 4 · họp quanh lửa trại: bỏ phiếu kín, người bị loại bay đi
      show() {
        fire.g.visible = true; fire.g.position.set(0, 0, 0);
        for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2 + 0.3; place(A[i], Math.cos(ang) * 2.55, 0, Math.sin(ang) * 2.55, Math.atan2(-Math.cos(ang), -Math.sin(ang))); sit(A[i], true); }
      },
      tick(t) {
        for (let i = 0; i < 6; i++) {
          const a = A[i], ang = (i / 6) * Math.PI * 2 + 0.3, ox = Math.cos(ang) * 2.55, oz = Math.sin(ang) * 2.55, sh = a.s.armL;
          if (i === 0 && t > 2.4) continue;   // người bị loại: xử lý riêng bên dưới
          free(a, 0); sh.rotation.set(-0.8, 0, 0.12); a.s.armR.rotation.set(-0.8, 0, -0.12); a.s.armL.userData.elbow.rotation.x = a.s.armR.userData.elbow.rotation.x = -0.6;
          a.root.position.set(ox, 0.12, oz); a.s.g.position.y = -0.34 + Math.sin(t * 2 + i) * 0.006;
        }
        const x0 = A[0], dwell = clamp01((t - 2.4) / 0.35), fly = clamp01((t - 2.8) / 1.6);
        if (t > 2.4) {
          const ang = 0.3, ox = Math.cos(ang) * 2.55, oz = Math.sin(ang) * 2.55;
          sit(x0, false); stand(x0); free(x0, 0); x0.s.armL.rotation.x = x0.s.armR.rotation.x = -2.6 * sm(dwell); x0.tag.visible = false;   // đứng bật dậy, giơ tay
          x0.root.position.set(ox + 5 * fly * fly, 0.12 * (1 - fly) + 5.5 * fly * fly, oz - 1.2 * fly); x0.root.rotation.y = Math.atan2(-Math.cos(ang), -Math.sin(ang)) + fly * 14; x0.root.scale.setScalar(Math.max(0.001, 1 - fly));
        }
        votes.forEach((s, k) => {
          const t0 = 0.5 + k * 0.45, u = clamp01((t - t0) / 1.0), who = A[k + 1];
          s.visible = u > 0 && u < 1; if (!s.visible) return;
          const sx = who.root.position.x, sz = who.root.position.z;
          s.position.set(lerp(sx, 0, sm(u)), lerp(2.0, 1.0, u) + Math.sin(u * Math.PI) * 1.0, lerp(sz, 0, sm(u))); (s.material as THREE.SpriteMaterial).opacity = 1 - sm((u - 0.7) / 0.3);
        });
        fire.flames.forEach((f, k) => { f.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(t * 9 + k * 1.7)); f.position.y = 0.2 + 0.35 * f.scale.y; });
        fire.light.intensity = 5.5 + Math.sin(t * 17) * 1.2 + Math.sin(t * 7.3) * 0.8;
        const ca = t * 0.12; cam(Math.sin(ca) * 3.2, 3.0, Math.cos(ca) * 3.0 + 6.3, 0, 0.9, 0);
      },
    },
    { // 5 · kết cục: biệt đội ăn mừng, gián điệp đứng riêng
      show() {
        pods.visible = true;
        for (let i = 1; i <= 3; i++) place(A[i], -4.3 + (i - 1) * 1.4, 0.16, 0, 0);
        place(A[0], 3.1, 0.16, 0, 0);
      },
      tick(t) {
        for (let i = 1; i <= 3; i++) {
          const a = A[i], w = Math.sin(t * 6 + i * 1.3); free(a, 0);
          a.s.armL.rotation.set(-2.7 + 0.3 * w, 0, 0.35); a.s.armR.rotation.set(-2.7 - 0.3 * w, 0, -0.35); a.s.armL.userData.elbow.rotation.x = a.s.armR.userData.elbow.rotation.x = -0.15; curlArm(a.s.armL, 1.2, 0.8); curlArm(a.s.armR, 1.2, 0.8);
          const jp = Math.max(0, Math.sin(t * 5 + i * 1.1)); a.root.position.y = 0.16 + jp * 0.22; stand(a);
          a.s.legL.rotation.x = -jp * 0.4; a.s.legR.rotation.x = jp * 0.4; kneeBend(a);
        }
        const sp = A[0]; carry(sp, t); stand(sp); sp.root.rotation.y = -0.35 + Math.sin(t * 0.8) * 0.12;   // gián điệp đứng nghiêng người, súng hạ thấp
        cam(0, 1.9, 7.6, 0, 2.1, 0);
      },
    },
  ];

  let cur = -1, tm = 0, paused = false, last = performance.now();
  const setScene = (n: number) => {
    cur = n; tm = 0;
    for (const a of A) resetActor(a);
    station.g.visible = fire.g.visible = pods.visible = false; votes.forEach((v) => (v.visible = false)); alarm.intensity = 0;
    SC[n].show(); SC[n].tick(0, 0);
  };
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (cur < 0 || document.hidden || !isShown()) return;
    if (!paused) { tm += dt; for (const c of clouds) { c.position.x += dt * 0.8; if (c.position.x > 110) c.position.x = -110; } SC[cur].tick(tm, dt); }
    renderer.render(scene, camera);
  };
  loop();
  return { setScene, pause: (p) => { paused = p; } };
}
