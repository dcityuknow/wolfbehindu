import * as THREE from "three";
import { buildSoldier, defOf, PX, shade } from "../world/soldier";
import { ELBOW_REST, curlArm } from "../world/gunpose";
import { buildGun, setFlash } from "../world/guns";
import { COLORS, SQUAD, NAMES } from "../config";

/**
 * SÂN KHẤU CUỘC HỌP: mỗi lính 1 "camera" chân dung (từ ngực trở lên) trong lưới ô video.
 * Một renderer WebGL riêng vẽ cả 11 ô bằng scissor (mỗi ô = 1 cảnh nhỏ có lửa trại hắt lên mặt).
 * Khuôn mặt voxel được phủ bộ mặt tham số: mắt/mày/miệng/mồ hôi/gân giận + đầu, tay (chỉ tay, giơ tay, nắm đấm…) mượt theo cảm xúc.
 * Tiếng nói -> biên độ -> miệng. Ai nói thì ô của họ có khung thoại riêng.
 */
export type Emo = "neutral" | "accuse" | "suspect" | "defend" | "deflect" | "shout" | "agree" | "panic" | "mock" | "shock" | "gun" | "point" | "disagree";

interface P { eo: number; px: number; py: number; bl: number; br: number; ba: number; mw: number; mh: number; mc: number; sweat: number; vein: number; yaw: number; pitch: number; roll: number; lean: number }
const NEUTRAL: P = { eo: 1, px: 0, py: 0, bl: 0, br: 0, ba: 0, mw: 2.4, mh: 0, mc: 0.1, sweat: 0, vein: 0, yaw: 0, pitch: 0, roll: 0, lean: 0 };
type Arm = "rest" | "point" | "chin" | "palms" | "shrug" | "fist" | "nod" | "hands" | "recoil" | "gun";
const EMO: Record<Emo, { p: Partial<P>; arm: Arm; gain: number; icon: string }> = {
  neutral: { p: {}, arm: "rest", gain: 1, icon: "" },
  accuse: { p: { eo: 1.15, ba: 0.45, bl: -0.8, br: -0.8, mw: 3, mc: -0.7, vein: 1, lean: 1, pitch: 0.06 }, arm: "point", gain: 1.1, icon: "👉" },
  suspect: { p: { eo: 0.5, ba: 0.15, bl: 0.9, br: -0.5, mw: 2, mc: -0.3, roll: 0.14, py: -0.1 }, arm: "chin", gain: 0.8, icon: "🤨" },
  defend: { p: { eo: 1.25, ba: -0.4, bl: 0.9, br: 0.9, mw: 2.6, mc: -0.6, sweat: 1 }, arm: "palms", gain: 1, icon: "😰" },
  deflect: { p: { eo: 0.75, ba: 0.1, bl: 0.6, br: -0.1, mw: 2.6, mc: 0.6, roll: -0.12, px: 0.6 }, arm: "shrug", gain: 0.9, icon: "😏" },
  shout: { p: { eo: 1.1, ba: 0.55, bl: -1, br: -1, mw: 3.2, mc: -0.8, vein: 1, lean: 1.4 }, arm: "fist", gain: 1.5, icon: "🤬" },
  agree: { p: { eo: 1, ba: -0.05, bl: 0.2, br: 0.2, mc: 0.3 }, arm: "nod", gain: 0.9, icon: "👍" },
  panic: { p: { eo: 1.45, ba: -0.45, bl: 1, br: 1, mw: 2.8, mh: 0.35, mc: -0.8, sweat: 1 }, arm: "hands", gain: 1.2, icon: "😱" },
  mock: { p: { eo: 0.45, bl: 0.3, br: 0.3, mw: 3.2, mc: 1, mh: 0.35, roll: -0.1, pitch: -0.1 }, arm: "rest", gain: 1, icon: "😆" },
  shock: { p: { eo: 1.5, ba: -0.2, bl: 1, br: 1, mw: 1.8, mh: 0.45, mc: -0.2 }, arm: "recoil", gain: 1, icon: "😨" },
  // phiên tòa: hét "SHUT UP" + giơ súng bắn lên trời · chỉ thẳng mặt (bình tĩnh, dùng khi nói "tôi KHÔNG nghi cậu") · lắc đầu phản đối
  gun: { p: { eo: 1.2, ba: 0.6, bl: -1, br: -1, mw: 3.4, mc: -0.9, vein: 1, lean: 0.6, pitch: 0.05 }, arm: "gun", gain: 1.8, icon: "🔫" },
  point: { p: { eo: 1, ba: 0.12, bl: 0.25, br: 0.25, mw: 2.4, mc: 0, lean: 0.6 }, arm: "point", gain: 1, icon: "👉" },
  disagree: { p: { eo: 0.8, ba: 0.25, bl: 0.5, br: 0.5, mw: 2.4, mc: -0.5, roll: 0.05 }, arm: "shrug", gain: 0.95, icon: "🙅" },
};

/* ───── bộ mặt tham số phủ lên mặt voxel (mặt nhìn +z; đơn vị PX, y=0 là cằm, 8 là đỉnh đầu) ───── */
function buildFace(neck: THREE.Group, skin: number, hair: number) {
  const z0 = 4 * PX + 0.0015, mk = (c: number) => new THREE.MeshBasicMaterial({ color: c });
  const part = (c: number, w: number, h: number, dz: number, y = 0, x = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, 0.5 * PX), mk(c)); m.position.set(x * PX, y * PX, z0 + dz * PX); neck.add(m); return m; };
  const root = new THREE.Group(); neck.add(root);
  const add = (m: THREE.Mesh) => { neck.remove(m); root.add(m); return m; };
  const sk = shade(skin, 0.97), brow = shade(hair, 0.62), DK = 0x1a0f0c;
  add(part(sk, 6.8, 2.9, 0.1, 3.5)); add(part(sk, 4.0, 1.9, 0.1, 1.45));                    // phủ mắt + miệng sơn sẵn
  const eyes = [-1, 1].map((s) => ({
    s, white: add(part(0xf6f6f6, 2.2, 1.9, 0.25, 3.3, s * 2)), pup: add(part(0x1b130d, 1.0, 1.0, 0.4, 3.3, s * 2)),
    lid: add(part(DK, 2.5, 0.5, 0.55, 4.2, s * 2)), brow: add(part(brow, 2.9, 0.65, 0.7, 4.6, s * 2)),
  }));
  const mouth = add(part(0x4a0d0d, 2.4, 0.5, 0.3, 1.5)), line = add(part(0x2a1410, 2.4, 0.4, 0.35, 1.5)), teeth = add(part(0xf4f4f4, 2, 0.55, 0.4, 1.5)), tongue = add(part(0xb04458, 1.4, 0.7, 0.4, 0.5));
  const cl = add(part(0x2a1410, 0.7, 0.7, 0.45, 1.5)), cr = add(part(0x2a1410, 0.7, 0.7, 0.45, 1.5));
  const sweat = add(part(0x8fdcff, 0.9, 1.5, 0.8, 4, 3.3)), vein = new THREE.Group(); vein.position.set(-3.7 * PX, 4.95 * PX, z0 + 0.9 * PX); vein.scale.setScalar(0.8); root.add(vein);
  for (const r of [Math.PI / 4, -Math.PI / 4]) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4 * PX, 0.4 * PX, 0.4 * PX), mk(0xe02222)); m.rotation.z = r; vein.add(m); }
  return {
    root,
    set(p: P, mouthOpen: number, blink: boolean, t: number) {
      for (const e of eyes) {
        const open = blink ? 0.06 : Math.max(0.06, Math.min(1.5, p.eo)), h = 1.9 * open, ang = e.s < 0 ? -p.ba : p.ba, lift = e.s < 0 ? p.bl : p.br;
        e.white.visible = e.pup.visible = open > 0.18; e.white.scale.y = Math.min(1.4, open); e.white.position.y = (3.3 - (open < 1 ? (1 - open) * 0.5 : 0)) * PX;
        e.pup.position.set((e.s * 2 + p.px * 0.6) * PX, (3.3 + p.py * 0.4 - (open < 1 ? (1 - open) * 0.5 : 0)) * PX, e.pup.position.z); e.pup.scale.y = Math.min(1, open * 1.2);
        const top = 3.3 + (open < 1 ? -(1 - open) * 0.5 : 0) + Math.min(open, 1.3) * 0.95; e.lid.position.y = Math.min(4.35, top) * PX; e.lid.rotation.z = ang * 0.9; e.lid.scale.x = open < 0.18 ? 1.05 : 1;
        e.brow.position.y = Math.min(4.95, Math.max(Math.min(4.35, top) + 0.4, 4.55 + lift * 0.3)) * PX; e.brow.rotation.z = ang * 1.3;
      }
      const w = p.mw, op = Math.max(0, Math.min(1, mouthOpen)), h = 0.5 + op * 1.5, cy = 1.55 - (h - 0.5) * 0.3, open = op > 0.08;
      mouth.visible = open; mouth.scale.set(w / 2.4, h / 0.5, 1); mouth.position.y = cy * PX;
      line.visible = !open; line.scale.x = w / 2.4; line.position.y = (1.45 + p.mc * 0.25) * PX;
      teeth.visible = open && op > 0.3; teeth.scale.x = (w * 0.8) / 2; teeth.position.y = (cy + h / 2 - 0.3) * PX;
      tongue.visible = op > 0.65; tongue.position.y = (cy - h / 2 + 0.5) * PX;
      const cy2 = open ? cy + 0.2 : 1.45 + p.mc * 0.3; cl.position.set(-w / 2 * PX, (cy2 + p.mc * 0.6 * (open ? 1 : 1.6)) * PX, cl.position.z); cr.position.set(w / 2 * PX, cl.position.y, cr.position.z); cl.visible = cr.visible = Math.abs(p.mc) > 0.15;
      sweat.visible = p.sweat > 0.5; if (sweat.visible) { const f = (t * 0.55) % 1; sweat.position.y = (4.6 - f * 3.2) * PX; (sweat.material as THREE.MeshBasicMaterial).opacity = 1 - f * 0.6; (sweat.material as THREE.MeshBasicMaterial).transparent = true; }
      vein.visible = p.vein > 0.5; if (vein.visible) vein.scale.setScalar(0.8 + 0.2 * Math.sin(t * 14));
    },
  };
}

/* ───── ô camera ───── */
interface Tile {
  dt: number; i: number; el: HTMLElement; bub: HTMLElement; tag: HTMLElement; ico: HTMLElement;
  scene: THREE.Scene; cam: THREE.PerspectiveCamera; g: THREE.Group; neck: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; mat: THREE.MeshStandardMaterial;
  face: ReturnType<typeof buildFace>; deadFace?: (m: number) => void; fire: THREE.DirectionalLight; embers: THREE.Points; back: THREE.Mesh;
  cur: P; emo: Emo; emoUntil: number; gain: number; arm: Arm; tdx: number; tdy: number;
  aR: number[]; aL: number[]; curlR: string; curlL: string;
  gun?: THREE.Group; kick: number; zoom: number;
  dead: boolean; blinkAt: number; blinkEnd: number; glanceAt: number; look: number; lookX: number; lookY: number;
  say: null | { level: () => number; t0: number; dur: number; words: string[]; token: number }; mouth: number; rect: { x: number; y: number; w: number; h: number };
}

let renderer: THREE.WebGLRenderer | null = null, canvas: HTMLCanvasElement | null = null;
const tiles: Tile[] = [];
let on = false, raf = 0, last = 0, lastRender = 0, host: HTMLElement | null = null, grid: HTMLElement | null = null, ro: ResizeObserver | null = null, token = 0;
export const heat = { v: 0 };

function glow(col: number) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 64; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 70, 2, 32, 70, 62); g.addColorStop(0, "rgba(255,150,60,.85)"); g.addColorStop(0.45, "rgba(120,50,20,.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = "#" + new THREE.Color(col).multiplyScalar(0.22).getHexString(); x.fillRect(0, 0, 64, 64); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeTile(i: number): Tile {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const def = defOf(SQUAD[i]), s = buildSoldier(def, mat, COLORS[i]);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07090f);
  scene.add(new THREE.HemisphereLight(0x8fa4d8, 0x2a1a10, 0.85));
  const fire = new THREE.DirectionalLight(0xff9a4a, 2.4); fire.position.set(0.2, -0.5, 1); scene.add(fire, fire.target);
  const rim = new THREE.DirectionalLight(0x6f8cff, 1.1); rim.position.set(-1, 0.6, -1); scene.add(rim);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: glow(COLORS[i]), toneMapped: false })); back.position.set(0, 1.35, -0.9); scene.add(back);
  const N = 22, pos = new Float32Array(N * 3); for (let k = 0; k < N; k++) pos.set([(Math.random() - 0.5) * 1.6, Math.random() * 1.4 + 0.6, -0.3 + Math.random() * 0.4], k * 3);
  const gm = new THREE.BufferGeometry(); gm.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(gm, new THREE.PointsMaterial({ color: 0xffa24a, size: 0.02, transparent: true, opacity: 0.9, depthWrite: false })); scene.add(embers);
  scene.add(s.g);
  const neck = s.head;
  const face = buildFace(neck as THREE.Group, def.skin, def.hair);
  for (const a of [s.armL, s.armR]) { a.rotation.order = "YXZ"; }
  const cam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 20); cam.position.set(0, 23.6 * PX, 2.75); cam.lookAt(0, 23.6 * PX, 0);
  const el = document.createElement("div"); el.className = "mt"; el.dataset.i = String(i); el.style.setProperty("--c", "#" + COLORS[i].toString(16).padStart(6, "0"));
  el.innerHTML = `<div class="mi"></div><div class="mg"></div><div class="mb"></div><div class="mnm"><i></i><b>${NAMES[i]}</b></div><div class="mrec">● REC</div><div class="mko">☠</div>`;
  const t: Tile = {
    dt: 0.016, i, el, bub: el.querySelector(".mb")!, tag: el.querySelector(".mg")!, ico: el.querySelector(".mi")!, scene, cam, g: s.g, neck, armL: s.armL, armR: s.armR, mat, face, deadFace: s.face, fire, embers, back,
    cur: { ...NEUTRAL }, emo: "neutral", emoUntil: 0, gain: 1, arm: "rest", tdx: 0, tdy: 0, aR: [0.05, 0, 0.06, ELBOW_REST], aL: [0.05, 0, -0.06, ELBOW_REST], curlR: "", curlL: "",
    kick: 0, zoom: 0, dead: false, blinkAt: 1 + Math.random() * 3, blinkEnd: 0, glanceAt: 0, look: -1, lookX: 0, lookY: 0, say: null, mouth: 0, rect: { x: 0, y: 0, w: 1, h: 1 },
  };
  return t;
}

/** Dựng DOM + renderer + 11 ô. grid = #mrow (ô điều khiển #mctl được chèn thêm vào cuối lưới). */
export function mountStage(h: HTMLElement, g: HTMLElement, cv: HTMLCanvasElement, deadOf: (i: number) => boolean) {
  host = h; grid = g; canvas = cv; on = true; heat.v = 0; token++;
  if (!renderer) { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); renderer.setClearColor(0x05070d, 1); renderer.setScissorTest(true); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  if (!tiles.length) for (let i = 0; i < SQUAD.length; i++) tiles.push(makeTile(i));
  const ctl = document.getElementById("mctl"); g.innerHTML = "";
  for (const t of tiles) { t.kick = 0; t.zoom = 0; if (t.gun) t.gun.visible = false; t.el.classList.remove("so"); t.say = null; t.emo = "neutral"; t.emoUntil = 0; t.look = -1; t.cur = { ...NEUTRAL }; t.bub.classList.remove("on"); t.tag.textContent = ""; t.ico.textContent = ""; t.el.className = "mt"; setDead(t.i, deadOf(t.i)); g.appendChild(t.el); }
  if (ctl) g.appendChild(ctl);
  g.classList.remove("spot", "hushed");
  if (!h.querySelector("#mflash")) { const f = document.createElement("div"); f.id = "mflash"; h.appendChild(f); }
  layout(); ro?.disconnect(); ro = new ResizeObserver(layout); ro.observe(g); window.addEventListener("resize", layout);
  last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
export function unmountStage() {
  on = false; grid?.classList.remove("spot"); for (const t of tiles) t.el.classList.remove("so"); cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener("resize", layout);
  for (const t of tiles) { t.say = null; t.bub.classList.remove("on"); }
}

function layout() {
  if (!renderer || !canvas) return;
  const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false);
  for (const t of tiles) { const b = t.el.getBoundingClientRect(); t.rect = { x: b.left - r.left, y: r.height - (b.bottom - r.top), w: Math.max(1, b.width), h: Math.max(1, b.height) }; t.cam.aspect = t.rect.w / t.rect.h; t.cam.updateProjectionMatrix(); }
}

export const tileEl = (i: number) => tiles[i]?.el;
export function setDead(i: number, dead: boolean) {
  const t = tiles[i]; if (!t) return; t.dead = dead; t.el.classList.toggle("dd", dead); t.face.root.visible = !dead;
  t.mat.color.setHex(dead ? 0x8a8a8a : 0xffffff); t.deadFace?.(dead ? 3 : 0);
  (t.scene.background as THREE.Color).setHex(dead ? 0x15171d : 0x07090f); t.back.visible = !dead; t.embers.visible = !dead;
}
export const setSelected = (i: number | null) => tiles.forEach((t) => t.el.classList.toggle("sl", t.i === i));
export const setWarn = (i: number, on_: boolean) => tiles[i]?.el.classList.toggle("warn", on_);

/** cảm xúc tạm thời (nghe người khác nói: giật mình, gật đầu, nghi ngờ…) */
export function react(i: number, emo: Emo, dur: number, target?: number) {
  const t = tiles[i]; if (!t || t.dead) return; if (t.say && emo !== "shock") return;
  t.emo = emo; t.emoUntil = performance.now() / 1000 + dur; if (target !== undefined) aim(t, target); t.ico.textContent = EMO[emo].icon;
}
function aim(t: Tile, j: number) {
  const o = tiles[j]; if (!o) return; const dx = (o.rect.x + o.rect.w / 2 - (t.rect.x + t.rect.w / 2)) / t.rect.w, dy = -((o.rect.y + o.rect.h / 2) - (t.rect.y + t.rect.h / 2)) / t.rect.h;   // y WebGL đi lên → đổi dấu: dy>0 = ô đích nằm DƯỚI
  t.tdx = dx; t.tdy = dy;
}
/** nhìn về ô j (-1 = nhìn thẳng) */
export function look(i: number, j: number) { const t = tiles[i]; if (!t || t.dead) return; t.look = j; if (j >= 0) aim(t, j); }

/** Bắt đầu nói: miệng theo level(), khung thoại hiện chữ dần theo thời lượng. Trả về token để hủy đúng lượt. */
export function startSay(i: number, o: { emo: Emo; text: string; target?: number; level: () => number; dur: () => number }) {
  const t = tiles[i]; if (!t || t.dead) return -1; const tk = ++token;
  t.say = { level: o.level, t0: performance.now() / 1000, dur: Math.max(0.8, o.dur()), words: o.text.split(/\s+/), token: tk };
  t.emo = o.emo; t.emoUntil = 1e12; t.ico.textContent = EMO[o.emo].icon; if (o.target !== undefined) { aim(t, o.target); t.look = o.target; } else t.look = -1;
  t.tag.textContent = o.target !== undefined && o.target >= 0 ? "→ " + NAMES[o.target] : ""; t.tag.style.display = t.tag.textContent ? "" : "none";
  t.bub.innerHTML = `<b>${NAMES[i]}</b><span></span>`; t.bub.classList.add("on"); t.el.classList.add("talk");
  return tk;
}
export function endSay(i: number, tk: number) {
  const t = tiles[i]; if (!t || !t.say || t.say.token !== tk) return;
  t.say = null; t.emoUntil = performance.now() / 1000 + 0.5; t.el.classList.remove("talk");
  window.setTimeout(() => { if (!t.say) { t.bub.classList.remove("on"); t.tag.textContent = ""; } }, 1400);
}
/** Nổ súng ở ô i: tia lửa nòng, tay giật ngược; cả sân khấu rung + loé sáng trắng. */
export function fireGun(i: number) {
  const t = tiles[i]; if (t) { t.kick = 1; setFlash(t.gun, true); window.setTimeout(() => setFlash(t.gun, false), 90); }
  const h = host; if (!h) return; h.classList.remove("mshake"); void h.offsetWidth; h.classList.add("mshake"); window.setTimeout(() => h.classList.remove("mshake"), 700);
  const f = h.querySelector<HTMLElement>("#mflash"); if (f) { f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
}
/** Đèn sân khấu: main (người đang nắm lời) + also (người bị chỉ) sáng, các ô còn lại tối đi. null = tắt. */
export function setSpot(main: number | null, also: number[] = []) {
  grid?.classList.toggle("spot", main !== null);
  for (const t of tiles) t.el.classList.toggle("so", t.i === main || also.includes(t.i));
}
export const isTalking = (i: number) => !!tiles[i]?.say;

/* ───── mỗi khung hình ───── */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function pose(t: Tile, now: number) {
  const tt = now;
  let emo = t.emo; if (t.emoUntil < tt && !t.say) { emo = "neutral"; if (t.emo !== "neutral") { t.emo = "neutral"; t.ico.textContent = ""; } }
  const E = EMO[emo], tgt: P = { ...NEUTRAL, ...E.p };
  // ánh nhìn: người nói nhìn mục tiêu, người nghe quay về phía người đang nói
  let lx = 0, ly = 0;
  if (t.look >= 0) { lx = Math.max(-1, Math.min(1, t.tdx * 0.6)); ly = Math.max(-0.6, Math.min(0.6, t.tdy * 0.5)); }
  else if (tt > t.glanceAt) { t.glanceAt = tt + 1.2 + Math.random() * 2.5; t.lookX = (Math.random() - 0.5) * 0.5; t.lookY = (Math.random() - 0.5) * 0.25; }
  if (t.look < 0) { lx = t.lookX; ly = t.lookY; }
  tgt.yaw += lx * 0.7; tgt.pitch += ly * 0.5; tgt.px += lx * 1.2; tgt.py -= ly * 0.8;
  const agit = Math.min(1, heat.v);
  // chuyển động sống: thở, nhún khi nói, lắc đầu phủ nhận, gật đầu, run
  const sp = t.say ? Math.min(1, t.say.level() * 1.1) : 0;
  tgt.pitch += Math.sin(tt * 1.3 + t.i) * 0.015 + sp * Math.sin(tt * 9 + t.i) * 0.05;
  if (emo === "defend") tgt.yaw += Math.sin(tt * 10) * 0.16;
  if (emo === "disagree") tgt.yaw += Math.sin(tt * 9) * 0.2;
  if (emo === "agree") tgt.pitch += Math.max(0, Math.sin(tt * 7)) * 0.13;
  if (emo === "shout" || emo === "accuse") tgt.pitch += sp * 0.1;
  if (emo === "panic") { tgt.yaw += Math.sin(tt * 30) * 0.03; tgt.roll += Math.sin(tt * 26) * 0.03; }
  if (emo === "mock") tgt.pitch += Math.sin(tt * 16) * 0.05;
  // mắt: chớp
  let blink = false; if (tt > t.blinkAt) { t.blinkEnd = tt + 0.13; t.blinkAt = tt + 1.8 + Math.random() * 3.5; } blink = tt < t.blinkEnd;
  const k = 1 - Math.exp(-t.dt * (emo === "shock" ? 22 : 11));
  const c = t.cur as unknown as Record<string, number>; for (const key of Object.keys(NEUTRAL)) c[key] = lerp(c[key], (tgt as unknown as Record<string, number>)[key], k);
  // miệng: biên độ thật khi nói
  const base = c.mh, mo = t.say ? Math.max(base * 0.4, Math.min(1, t.say.level() * 1.9 * E.gain)) : base;
  t.mouth = lerp(t.mouth, mo, 1 - Math.exp(-t.dt * 30));
  t.face.set(t.cur, t.mouth, blink, tt);
  const sh = (emo === "shout" ? 0.012 : 0) * Math.sin(tt * 37) + (emo === "mock" ? 0.02 * Math.sin(tt * 18) : 0);
  t.neck.rotation.set(t.cur.pitch + sp * 0.02, t.cur.yaw, t.cur.roll, "YXZ");
  t.g.position.set(sh * 0.5, (emo === "mock" ? Math.abs(Math.sin(tt * 15)) * 0.012 : 0), t.cur.lean * PX * 3.2 * (1 + agit * 0.4));
  t.g.rotation.set(t.cur.lean * 0.05, Math.sin(tt * 0.7 + t.i) * 0.03 + t.cur.yaw * 0.25, 0);
  // đèn lửa chập chờn (nóng giận hơn thì lửa bốc mạnh)
  t.fire.intensity = 2.3 + Math.sin(tt * 11 + t.i * 2) * 0.35 + Math.sin(tt * 23 + t.i) * 0.2 + agit * 0.5;
  arms(t, emo, tt, sp);
  // súng: chỉ hiện trong tay phải khi đang bắn; camera lùi ra để thấy cánh tay giơ cao + tia lửa nòng súng
  if (emo === "gun" && !t.gun) { const g = buildGun("pistol"); g.rotation.x = Math.PI / 2; g.scale.setScalar(1.3); g.position.set(0, -0.1, 0.085); (t.armR.userData.hand as THREE.Object3D).add(g); t.gun = g; setFlash(g, false); }
  if (t.gun) t.gun.visible = emo === "gun";
  t.kick = Math.max(0, t.kick - t.dt * 5);
  t.zoom = lerp(t.zoom, emo === "gun" ? 1 : 0, 1 - Math.exp(-t.dt * 6));
  t.cam.position.set(0, 23.6 * PX + t.zoom * 0.5, 2.75 + t.zoom * 1.7);
  const pa = t.embers.geometry.getAttribute("position") as THREE.BufferAttribute; for (let n = 0; n < pa.count; n++) { let y = pa.getY(n) + t.dt * (0.12 + (n % 5) * 0.03); if (y > 2.2) y = 0.5; pa.setY(n, y); pa.setX(n, pa.getX(n) + Math.sin(tt * 2 + n) * 0.0008); } pa.needsUpdate = true;
}
function setCurl(a: THREE.Object3D, mode: string) {
  if (mode === "point") { curlArm(a, 1.35, 0.9); const f = a.userData.fingers as THREE.Group[]; f[0].rotation.z = 0; (f[0].userData.tip as THREE.Object3D).rotation.z = 0; }
  else if (mode === "open") curlArm(a, 0.12, 0.1); else if (mode === "fist") curlArm(a, 1.45, 0.95); else curlArm(a, 0.9, 0.5);
}
function arms(t: Tile, emo: Emo, tt: number, sp: number) {
  const A = EMO[emo].arm, side = t.tdx >= 0 ? 1 : -1, ry = Math.min(1.1, 0.3 + Math.abs(t.tdx) * 0.35), osc = Math.sin(tt * 17), tr = Math.sin(tt * 28) * 0.04;
  let R = [0.05, 0, 0.06, ELBOW_REST], L = [0.05, 0, -0.06, ELBOW_REST], cR = "rest", cL = "rest";
  if (A === "point") { const P = [-1.5, side * ry, 0.02, -0.12 + sp * 0.05], rest = [0.1, 0, side > 0 ? -0.1 : 0.1, -0.5]; if (side > 0) { R = P; L = [0.1, 0, -0.15, -0.6]; cR = "point"; cL = "fist"; } else { L = [-1.5, -ry, -0.02, -0.12 + sp * 0.05]; R = rest; cL = "point"; cR = "fist"; } }
  else if (A === "fist") { R = [-1.05 + osc * 0.28, 0.1, 0.1, -1.7 + osc * 0.2]; L = [0.1, 0, -0.2, -0.7]; cR = "fist"; cL = "fist"; }
  else if (A === "palms") { R = [-0.95 + tr, -0.1, 0.5, -1.25]; L = [-0.95 + tr, 0.1, -0.5, -1.25]; cR = cL = "open"; }
  else if (A === "hands") { R = [-1.25 + tr, -0.2, 0.2, -2.1]; L = [-1.25 - tr, 0.2, -0.2, -2.1]; cR = cL = "open"; }
  else if (A === "chin") { R = [-0.7, -0.35, -0.15, -2.2]; L = [0.1, 0, -0.1, -0.6]; cR = "fist"; cL = "fist"; }
  else if (A === "shrug") { R = [-0.7, -0.1, 0.55 + Math.sin(tt * 4) * 0.08, -1.0]; L = [-0.7, 0.1, -0.55 - Math.sin(tt * 4) * 0.08, -1.0]; cR = cL = "open"; }
  else if (A === "nod") { R = [-0.45, 0, 0.12, -1.2 + Math.max(0, Math.sin(tt * 7)) * 0.2]; L = [0.05, 0, -0.1, -0.4]; cR = "fist"; }
  else if (A === "gun") { R = [-3.0 + t.kick * 0.55, 0, 0.14, -0.12 - t.kick * 0.45]; L = [0.1, 0, -0.2, -0.7]; cR = "fist"; cL = "fist"; }   // tay phải giơ thẳng lên trời, giật ngược khi nổ súng
  else if (A === "recoil") { R = [-0.5, 0, 0.5, -1.4]; L = [-0.5, 0, -0.5, -1.4]; cR = cL = "open"; }
  const k = 1 - Math.exp(-t.dt * 12);
  const ap = (a: THREE.Object3D, cur: number[], tg: number[]) => { for (let n = 0; n < 4; n++) cur[n] = lerp(cur[n], tg[n], k); a.rotation.set(cur[0], cur[1], cur[2]); (a.userData.elbow as THREE.Object3D).rotation.x = cur[3]; };
  ap(t.armR, t.aR, R); ap(t.armL, t.aL, L);
  if (cR !== t.curlR) { t.curlR = cR; setCurl(t.armR, cR); } if (cL !== t.curlL) { t.curlL = cL; setCurl(t.armL, cL); }
}

function bubbles(now: number) {
  for (const t of tiles) {
    const s = t.say; if (!s) continue; const f = Math.min(1, (now - s.t0) / Math.max(0.5, s.dur) * 1.12), n = Math.max(1, Math.ceil(s.words.length * f));
    const sp = t.bub.querySelector("span"); if (sp) { const txt = s.words.slice(0, n).join(" "); if (sp.textContent !== txt) sp.textContent = txt; }
  }
}

function frame(ms: number) {
  if (!on || !renderer) return; raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ms - last) / 1000); last = ms; const now = ms / 1000;
  for (const t of tiles) { t.dt = dt; if (!t.dead) pose(t, now); else { t.neck.rotation.set(0.45, 0, 0.1); t.arm = "rest"; } }
  bubbles(now);
  if (ms - lastRender < 28) return; lastRender = ms;
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  for (const t of tiles) { const r = t.rect; renderer.setViewport(r.x, r.y, r.w, r.h); renderer.setScissor(r.x, r.y, r.w, r.h); renderer.render(t.scene, t.cam); }
}
