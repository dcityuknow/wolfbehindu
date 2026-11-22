import * as THREE from "three";
import LINES from "../config/tribunalLines.json";
import { scene, camera } from "../world/scene";
import { entities } from "../world/characters";
import { groundAt, walkable, CAMP_Y } from "../world/island";
import { WALLS } from "../world/map";
import { TRIB } from "../world/cineState";
import { buildSoldier, defOf, PX } from "../world/soldier";
import { buildGun, setFlash } from "../world/guns";
import { reach, SH, curlArm } from "../world/gunpose";
import { tracer, burst, bloodPool, clearBlood } from "../world/fx";
import { sfx } from "../audio";
import { COLORS, NAMES, SQUAD, GUNS } from "../config";
import { W } from "../weaponState";
import { G } from "../state";
import { locale } from "../i18n";
import { playClip } from "../meetVoice";
import { splash, hideSplash } from "../ui/hud";
import { UI } from "../story";
import { sleep } from "../ui/dom";
import { standAll } from "./seats";
import { hooks } from "./combat";
import type { Entity } from "../types";

/**
 * PHIÊN TÒA Ở ĐỐNG LỬA — chạy ngay SAU KHI đồng hồ họp (100 s) về 0, trong lúc giao dịch kiểm phiếu (tallyVotes) còn đang chờ xác nhận on-chain:
 *  1) CLIP CHỜ KẾT QUẢ: một người (bot hoặc chính người chơi, random) đứng cầm xấp phiếu, chăm chú đọc → ngạc nhiên → giận dữ…, nói thoại (phụ đề + giọng đọc). Lặp tới khi có kết quả.
 *  2) CÔNG BỐ: đúng lúc giao dịch trả về ai bị loại, người đó đọc tên.
 *  3) XỬ BẮN: cả nhóm xúm lại lột áo + tước vũ khí → lôi ra gốc cây → trói → xếp hàng xạ thủ → "Nạp đạn! Nhắm! BẮN!".
 * Hoàn toàn là diễn xuất ở máy: kết quả thật (ai bị loại, có phải gián điệp) đến từ contract; module này chỉ hiển thị.
 */
export interface Tribunal {
  /** Có kết quả: slot = người bị loại (null = hòa, không ai bị loại). Trả về khi cảnh xong (người bị loại đã nằm xuống). */
  resolve(slot: number | null, spy: boolean): Promise<void>;
  /** Giao dịch lỗi: dừng clip, trả mọi thứ về như cũ (để hiện lại màn họp + nút thử lại). */
  abort(): void;
}

/* ───────────── tiện ích ───────────── */
const rnd = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const angLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const vi = () => locale.lang === "vi";
/** Thoại luôn ĐỌC bằng tiếng Anh (en-US); phụ đề: dòng trên = tiếng Anh, dòng dưới = bản dịch sang ngôn ngữ người chơi (hiện có: tiếng Việt; ngôn ngữ khác chỉ hiện dòng tiếng Anh). */
interface Tx { en: string; tr: string; key: string }
const TXT = (l: { en: string; vi: string }, key: string, name?: string): Tx => { const f = (x: string) => (name === undefined ? x : x.replace("{0}", name)), lg = locale.lang, tr = lg === "en" || lg === "ng" ? "" : (l as Record<string, string>)[lg] ?? ""; return { en: f(l.en), tr: f(tr), key }; };
const BCP = () => "en-US";
const fwd = (r: number) => new THREE.Vector3(Math.sin(r), 0, Math.cos(r));
const rgt = (r: number) => new THREE.Vector3(Math.cos(r), 0, -Math.sin(r));
class Abort extends Error {}
const F = (eyes: 0 | 1 | 2 | 3, mouth: 0 | 1 | 2) => 10 + eyes * 10 + mouth;   // mắt: thường · trợn · giận · nheo — miệng: khép · hé · há to (soldier.ts buildFaceFx)

type Emo = "read" | "shock" | "anger" | "rage" | "tense" | "grim" | "plead" | "idle";
const EMO_FACE: Record<Emo, [0 | 1 | 2 | 3, 0 | 1 | 2, 0 | 1 | 2]> = {   // [mắt, miệng khi im, miệng khi nói]
  read: [3, 0, 1], shock: [1, 1, 2], anger: [2, 0, 2], rage: [2, 2, 2], tense: [3, 0, 1], grim: [3, 0, 1], plead: [1, 1, 2], idle: [0, 0, 1],
};

/* ───────────── trạng thái cảnh ───────────── */
interface Goal { path: [number, number][]; sp: number; face: number | null; done: boolean }
interface Shot { pos: (t: number) => THREE.Vector3; look: (t: number) => THREE.Vector3; k: number; t0: number }
const S = {
  on: false, t: 0, abort: false,
  ents: [] as Entity[], holder: null as Entity | null, victim: null as Entity | null, vClone: null as null | ReturnType<typeof makeBare>, pivot: null as THREE.Group | null,
  emo: new Map<number, Emo>(), speaking: new Set<number>(), look: new Map<number, number>(),
  goals: new Map<number, Goal>(), aim: new Map<number, number>(),
  papers: null as null | { g: THREE.Group; sheets: THREE.Mesh[]; cyc: number }, paperMode: "read" as "read" | "up" | "low", grab: new Set<number>(),
  shot: null as Shot | null, cur: new THREE.Vector3(), curLook: new THREE.Vector3(), cut: true,
  props: [] as THREE.Object3D[], slump: 0, tied: false, ropes: 0,
};

/* ───────────── lớp phủ: dải đen điện ảnh, phụ đề, đèn flash, mờ dần ───────────── */
let ui: null | { root: HTMLDivElement; sub: HTMLDivElement; tag: HTMLDivElement; flash: HTMLDivElement; fade: HTMLDivElement } = null;
function mountUi() {
  if (!document.getElementById("tribCss")) {
    const st = document.createElement("style"); st.id = "tribCss";
    st.textContent = `#trib{position:fixed;inset:0;z-index:8;pointer-events:none;font-family:system-ui,sans-serif}
#trib .tbar{position:absolute;left:0;right:0;height:9vh;background:#000;transition:transform .8s;margin:0;border-radius:0}#trib .bt{top:0;transform:translateY(-100%)}#trib .bb{bottom:0;transform:translateY(100%)}
#trib.on .bt,#trib.on .bb{transform:none}
#trib .vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 45%,rgba(0,0,0,.65) 100%)}
#trib .sub{position:absolute;left:50%;bottom:11vh;transform:translateX(-50%);width:min(860px,92vw);text-align:center;opacity:0;transition:opacity .2s;text-shadow:0 2px 6px #000,0 0 3px #000}
#trib .sub.on{opacity:1}#trib .sub small{display:block;font:800 13px ui-monospace,monospace;letter-spacing:.16em;margin-bottom:3px;color:#ffb35a}
#trib .sub i{display:none;margin-top:4px;font-style:normal;font-size:clamp(15px,2vw,22px);font-weight:600;color:#ffd98a;line-height:1.3}
#trib .sub b{display:block;font-size:clamp(20px,2.9vw,31px);color:#fff;font-weight:800;line-height:1.3}
#trib .tag{position:absolute;left:3vw;top:11vh;color:#ff5a4a;font:800 14px ui-monospace,monospace;letter-spacing:.14em;opacity:0;transition:opacity .4s}
#trib .tag.on{opacity:1;animation:tribBlink 1.2s infinite}@keyframes tribBlink{50%{opacity:.35}}
#trib .flash{position:absolute;inset:0;background:#fff;opacity:0}#trib .flash.go{animation:tribFlash .5s ease-out}@keyframes tribFlash{0%{opacity:.85}100%{opacity:0}}
#trib .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity 1.4s}`;
    document.head.appendChild(st);
  }
  const root = document.createElement("div"); root.id = "trib";
  root.innerHTML = `<div class="vig"></div><div class="tbar bt"></div><div class="tbar bb"></div><div class="tag"></div><div class="sub"><small></small><b></b><i></i></div><div class="flash"></div><div class="fade"></div>`;
  document.body.appendChild(root);
  ui = { root, sub: root.querySelector(".sub")!, tag: root.querySelector(".tag")!, flash: root.querySelector(".flash")!, fade: root.querySelector(".fade")! };
  requestAnimationFrame(() => root.classList.add("on"));
}
const caption = (who: string, text: string, col: string, tr = "") => { if (ui) { const i = ui.sub.querySelector("i") as HTMLElement; i.textContent = tr; i.style.display = tr ? "block" : "none"; } if (!ui) return; (ui.sub.querySelector("small") as HTMLElement).textContent = who; (ui.sub.querySelector("small") as HTMLElement).style.color = col; (ui.sub.querySelector("b") as HTMLElement).textContent = text; ui.sub.classList.add("on"); };
const captionOff = () => ui?.sub.classList.remove("on");
const flash = () => { if (!ui) return; ui.flash.classList.remove("go"); void ui.flash.offsetWidth; ui.flash.classList.add("go"); };

/* ───────────── giọng nói + phụ đề: nói xong mới đi tiếp ───────────── */
const check = () => { if (S.abort) throw new Abort(); };
const wait = async (sec: number) => { const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { check(); await sleep(50); } check(); };
let speakSeq = 0;
async function say(e: Entity, tx: Tx, o: { shout?: boolean; hold?: number; pitch?: number; rate?: number } = {}) {
  check(); const text = tx.en, seq = ++speakSeq, col = "#" + COLORS[e.i].toString(16).padStart(6, "0");
  caption(NAMES[e.i] + (e.i === G.slot ? " ★" : ""), text, col, tx.tr); S.speaking.add(e.i);
  await new Promise<void>((res) => {
    const clip = playClip(`voice/trib/${e.i}_${tx.key}.mp3`, { text, gain: o.shout ? 1.25 : 1.0, pan: 0, lang: BCP(), pitch: o.pitch ?? 0.75 + (e.i % 5) * 0.13, onEnd: res });   // CÙNG file giọng Kokoro của lính đó như lúc cãi nhau ở đống lửa
    const iv = setInterval(() => { if (S.abort) { clip.stop(); clearInterval(iv); } }, 100);
    setTimeout(() => clearInterval(iv), 30000);
  });
  S.speaking.delete(e.i); await wait(o.hold ?? 0.35);
  if (seq === speakSeq) captionOff();
}

/* ───────────── dựng đồ vật ───────────── */
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const mat = (c: number) => { let m = matCache.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }); matCache.set(c, m); } return m; };
const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; (parent ?? scene).add(m); if (!parent) S.props.push(m); return m; };
const group = (x: number, y: number, z: number) => { const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g); S.props.push(g); return g; };

/** Xấp phiếu bầu (các mảnh giấy) trên tay người đọc. */
function makePapers(holder: Entity) {
  const g = new THREE.Group(), sheets: THREE.Mesh[] = [];
  for (let k = 0; k < 9; k++) { const s = box(0.27, 0.006, 0.36, k % 2 ? 0xf1ead2 : 0xfaf4de, (Math.random() - 0.5) * 0.012, k * 0.0075, (Math.random() - 0.5) * 0.012, g); s.rotation.y = (Math.random() - 0.5) * 0.12; sheets.push(s); }
  const ink = box(0.2, 0.002, 0.012, 0x2b2b2b, 0, 9 * 0.0075 + 0.001, -0.1, g); void ink;   // vài dòng chữ nguệch ngoạc trên tờ trên cùng
  box(0.2, 0.002, 0.012, 0x2b2b2b, 0, 9 * 0.0075 + 0.001, -0.03, g); box(0.14, 0.002, 0.012, 0xb02020, 0, 9 * 0.0075 + 0.001, 0.05, g);
  holder.g.add(g); S.papers = { g, sheets, cyc: 0 };
}
function dropPapers() { if (S.papers) { S.papers.g.parent?.remove(S.papers.g); S.papers = null; } }

/** Bản "cởi trần, không mũ, không vũ khí" của người bị xử — thay vào chỗ model cũ lúc bị lột đồ. */
function makeBare(e: Entity) {
  const d0 = defOf(SQUAD[e.i]), def = { ...d0, bare: true, vest: null, pouch: null, pack: null, tabs: null, glove: null, hat: { kind: "none", c: 0 } };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const s = buildSoldier(def, m, COLORS[e.i]); s.g.userData = { armL: s.armL, armR: s.armR, legL: s.legL, legR: s.legR, hip: s.hip, head: s.head, face: s.face };
  scene.add(s.g); return s;
}

/** Cây xử bắn (thân + tán lá bằng khối voxel). */
function makeTree(x: number, z: number) {
  const gy = groundAt(x, z), g = group(x, gy, z);
  for (let k = 0; k < 4; k++) box(0.9 - k * 0.04, 2.1, 0.9 - k * 0.04, k % 2 ? 0x6b4a2b : 0x5d4026, 0, 1.05 + k * 2.1, 0, g);
  for (const [dx, dz] of [[0.6, 0.2], [-0.5, 0.45], [0.1, -0.6], [-0.35, -0.4]]) box(0.45, 0.4, 0.45, 0x5d4026, dx, 0.2, dz, g);   // rễ nổi
  box(5.6, 1.5, 5.6, 0x2f6b2f, 0, 8.6, 0, g); box(4.4, 1.5, 4.4, 0x3a7a35, 0, 9.9, 0, g); box(3.0, 1.4, 3.0, 0x2f6b2f, 0, 11.1, 0, g); box(4.4, 1.3, 1.6, 0x3a7a35, 0, 8.1, 1.8, g);
  return g;
}

/** Quần áo + vũ khí bị tước: chất thành đống dưới đất, vài mảnh bay tung. */
function dropLoot(e: Entity, x: number, z: number) {
  const def = defOf(SQUAD[e.i]), pal = def.uni.pal as number[], gy = groundAt(x, z), g = group(x, gy, z);
  for (let k = 0; k < 7; k++) { const b = box(0.28 + Math.random() * 0.22, 0.07, 0.24 + Math.random() * 0.2, pal[k % pal.length], (Math.random() - 0.5) * 0.45, 0.04 + k * 0.045, (Math.random() - 0.5) * 0.4, g); b.rotation.y = Math.random() * 3; }
  box(0.34, 0.1, 0.3, def.vest ?? 0x4a5236, 0.1, 0.4, 0, g);
  const hat = box(0.3, 0.14, 0.3, typeof def.hat.c === "number" ? def.hat.c : pal[1], -0.12, 0.45, 0.05, g); hat.rotation.y = 0.5;
  const gid = (e.g.userData.gunId as string) ?? "rifle", gun = buildGun((e.i === G.slot ? GUNS[W.cur].id : gid) as "rifle"); gun.rotation.set(0, Math.random() * 6, 0); gun.position.set(0.55, 0.06, 0.3); g.add(gun);
  for (let k = 0; k < 14; k++) burst(new THREE.Vector3(x, gy + 1.3, z), "dust", 1, 3.5, 0.09, 0.9, 1.5);
}

/* ───────────── di chuyển ───────────── */
const CAMPV = new THREE.Vector3(0, 0, 0);
/** Đường đi vòng quanh đống lửa (không xuyên qua lửa): từ A đến B, nếu đoạn thẳng cắt vòng lửa bán kính 3,3 thì đi theo cung r = 3,9. */
function ringPath(ax: number, az: number, bx: number, bz: number): [number, number][] {
  const R = 3.9, d = (px: number, pz: number) => Math.hypot(px, pz);
  const abx = bx - ax, abz = bz - az, L2 = abx * abx + abz * abz || 1, t = Math.max(0, Math.min(1, -(ax * abx + az * abz) / L2)), cx = ax + abx * t, cz = az + abz * t;
  if (Math.hypot(cx, cz) > 3.3) return [[bx, bz]];
  const pts: [number, number][] = [];
  const a0 = Math.atan2(az, ax), a1 = Math.atan2(bz, bx), da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), n = Math.max(1, Math.ceil(Math.abs(da) / 0.6));
  if (d(ax, az) < R - 0.3) pts.push([Math.cos(a0) * R, Math.sin(a0) * R]);
  for (let k = 1; k <= n; k++) { const a = a0 + (da * k) / n; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  pts.push([bx, bz]); return pts;
}
function walk(e: Entity, x: number, z: number, sp = 3.4, face: number | null = null) { S.goals.set(e.i, { path: ringPath(e.x, e.z, x, z), sp, face, done: false }); }
const arrived = (es: Entity[]) => es.every((e) => !S.goals.has(e.i) || S.goals.get(e.i)!.done);
async function walkWait(es: Entity[], max = 14) { const t0 = performance.now(); while (!arrived(es) && performance.now() - t0 < max * 1000) { check(); await sleep(60); } for (const e of es) { const g = S.goals.get(e.i); if (g && !g.done) { const [x, z] = g.path[g.path.length - 1]; e.x = x; e.z = z; g.done = true; } } }
function stepGoals(dt: number) {
  for (const [i, g] of S.goals) {
    const e = entities[i]; if (g.done) { if (g.face !== null) e.rot = angLerp(e.rot, g.face, damp(8, dt)); continue; }
    const [tx, tz] = g.path[0], dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 0.12) { g.path.shift(); if (!g.path.length) { g.done = true; g.path = [[e.x, e.z]]; } continue; }
    const st = Math.min(d, g.sp * dt); e.x += (dx / d) * st; e.z += (dz / d) * st; e.rot = angLerp(e.rot, Math.atan2(dx, dz), damp(9, dt));
    e.y = lerp(e.y, groundAt(e.x, e.z), damp(10, dt));
  }
}

/* ───────────── camera ───────────── */
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const headOf = (e: Entity) => V3(e.x, e.y + 1.55, e.z);
function cut(s: Omit<Shot, "t0" | "k"> & { k?: number }, hard = true) { S.shot = { k: 3.5, ...s, t0: S.t }; S.cut = hard; }
/** Cận mặt: dist = khoảng cách, side = lệch phải, push = tốc độ tiến gần. */
const shotFace = (e: Entity, dist = 1.5, side = 0.35, push = 0.05, h = 0) => cut({
  pos: (t) => headOf(e).addScaledVector(fwd(e.rot), Math.max(1.1, dist - push * t)).addScaledVector(rgt(e.rot), side).setY(e.y + 1.78 + h),
  look: () => headOf(e).setY(e.y + 1.5 + h * 0.6), k: 4,
});
const shotChest = (e: Entity, dist = 2.4, side = 0.6) => cut({ pos: () => V3(e.x, e.y + 1.35, e.z).addScaledVector(fwd(e.rot), dist).addScaledVector(rgt(e.rot), side), look: () => V3(e.x, e.y + 1.35, e.z) });
const shotPapers = (e: Entity) => cut({ pos: () => V3(e.x, e.y + 1.62, e.z).addScaledVector(fwd(e.rot), 1.25).addScaledVector(rgt(e.rot), 0.25).setY(e.y + 1.95), look: () => V3(e.x, e.y + 1.22, e.z).addScaledVector(fwd(e.rot), 0.34) });
/** Cảnh rộng trên cao, quay chậm quanh vòng lửa. */
const shotWide = (a0: number, r = 8.5, h = 4.6) => cut({ pos: (t) => V3(Math.sin(a0 + t * 0.07) * r, CAMP_Y + h, Math.cos(a0 + t * 0.07) * r), look: () => V3(0, CAMP_Y + 0.9, 0), k: 2.2 });
const centroid = (es: Entity[]) => { const c = V3(); es.forEach((e) => c.add(V3(e.x, e.y, e.z))); return c.multiplyScalar(1 / Math.max(1, es.length)); };
const shotFollow = (es: Entity[], off: THREE.Vector3) => cut({ pos: () => centroid(es).add(off), look: () => centroid(es).add(V3(0, 1.2, 0)), k: 2 });
function updateCamera(dt: number) {
  const s = S.shot; if (!s) return;
  const t = S.t - s.t0, p = s.pos(t), l = s.look(t);
  if (S.cut) { S.cur.copy(p); S.curLook.copy(l); S.cut = false; } else { S.cur.lerp(p, damp(s.k, dt)); S.curLook.lerp(l, damp(s.k + 1, dt)); }
  camera.position.copy(S.cur); camera.lookAt(S.curLook);
  if (Math.abs(camera.fov - 52) > 0.1) { camera.fov = 52; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
}

/* ───────────── mỗi khung hình (gọi từ main.ts sau animateCrew) ───────────── */
const HAND = { r: V3(0.13, 1.2, 0.36), l: V3(-0.13, 1.2, 0.36) }, _t = V3();
export function tribunalUpdate(dt: number) {
  if (!S.on) return; S.t += dt;
  stepGoals(dt);
  const tt = S.t;
  for (const e of S.ents) {
    const u = e.g.userData, vic = e === S.victim && S.vClone;
    if (vic) { e.g.visible = false; continue; }
    e.g.visible = true; e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = e.rot;
    const emo = S.emo.get(e.i) ?? "idle", talking = S.speaking.has(e.i), [eyes, quiet, loud] = EMO_FACE[emo];
    // mặt: miệng nhép theo nhịp khi đang nói
    const flap = talking ? ((tt * 7.3 + e.i) % 1 < 0.55 ? loud : (loud ? 1 : 0)) : quiet;
    u.face?.(F(eyes, flap as 0 | 1 | 2));
    // ánh nhìn: quay đầu về phía người đang nói / mục tiêu
    const lk = S.look.get(e.i);
    if (lk !== undefined && u.head) { const o = entities[lk], want = Math.atan2(o.x - e.x, o.z - e.z), dy = Math.atan2(Math.sin(want - e.rot), Math.cos(want - e.rot)); u.head.rotation.y = lerp(u.head.rotation.y, Math.max(-1.1, Math.min(1.1, dy)), damp(8, dt)); }
    else if (u.head) u.head.rotation.y = lerp(u.head.rotation.y, 0, damp(6, dt));
    // dáng súng: người đứng hàng xạ thủ giơ súng ngắm
    const aim = S.aim.get(e.i); if (aim !== undefined) { e.aim = lerp(e.aim, aim, damp(7, dt)); e.pitch = lerp(e.pitch, -0.03, damp(6, dt)); }
    if (e.kick > 0) e.kick = Math.max(0, e.kick - dt * 7);
    if (S.grab.has(e.i)) grabPose(e, victimTarget());
    if (e === S.holder && S.papers) holderPose(e, dt, emo, talking);
    else if (u.head && e !== S.victim) u.head.rotation.x = lerp(u.head.rotation.x, emo === "shock" ? -0.12 : 0, damp(6, dt));
  }
  victimPose(dt);
  updateCamera(dt);
}

/** Xúm lại giật quần áo / trói: hai tay vươn về phía người bị loại, giật liên hồi. */
const victimTarget = () => (S.vClone ? S.vClone.g.getWorldPosition(V3()) : S.victim ? V3(S.victim.x, S.victim.y, S.victim.z) : V3());
function grabPose(e: Entity, tg: THREE.Vector3) {
  const u = e.g.userData, tt = S.t, d = Math.atan2(tg.x - e.x, tg.z - e.z) - e.rot, sw = Math.sin(tt * 13 + e.i), gr = u.gunRig;
  if (gr) { gr.pivot.visible = false; if (gr.extra) gr.extra.visible = false; }
  const R = V3(0.14 + sw * 0.07, 1.08 + Math.cos(tt * 11 + e.i) * 0.1, 0.52), L = V3(-0.14 - sw * 0.07, 1.0 - Math.cos(tt * 11 + e.i) * 0.1, 0.5); void d;
  reach(u.armR, SH.r, R); reach(u.armL, SH.l, L); curlArm(u.armR, 1.4, 0.9); curlArm(u.armL, 1.4, 0.9);
}

/** Người cầm phiếu: hai tay nâng xấp giấy, đầu cúi đọc / ngẩng lên khi sốc / tay còn lại đấm vào không khí khi giận dữ. */
function holderPose(e: Entity, dt: number, emo: Emo, talking: boolean) {
  const u = e.g.userData, P = S.papers!, tt = S.t, down = emo === "read" ? 0.55 : emo === "tense" ? 0.16 : emo === "anger" || emo === "rage" ? 0.05 : emo === "shock" ? -0.05 : 0.08;
  const shake = emo === "shock" ? 0.012 : emo === "rage" ? 0.02 : emo === "anger" ? 0.01 : 0.002, lift = S.paperMode === "up" ? 0.22 : S.paperMode === "low" ? -0.12 : 0;
  if (u.head) u.head.rotation.x = lerp(u.head.rotation.x, down + (talking ? Math.sin(tt * 9) * 0.04 : 0), damp(7, dt));
  const lh = _t.set(HAND.l.x + Math.sin(tt * 31) * shake, HAND.l.y + lift + Math.cos(tt * 27) * shake, HAND.l.z), rh = V3(HAND.r.x + Math.sin(tt * 29) * shake, HAND.r.y + lift + Math.cos(tt * 33) * shake, HAND.r.z);
  if (emo === "rage") { rh.set(0.32, 1.78 + Math.sin(tt * 14) * 0.08, 0.26 + Math.cos(tt * 14) * 0.05); lh.set(-0.1, 1.3, 0.3); }
  reach(u.armR, SH.r, rh); reach(u.armL, SH.l, lh); curlArm(u.armL, 1.1, 0.9); curlArm(u.armR, emo === "rage" ? 1.5 : 1.1, 0.9);
  const gr = u.gunRig; if (gr) { gr.pivot.visible = false; if (gr.extra) gr.extra.visible = false; }   // đang cầm giấy: súng đã cất
  // xấp giấy nằm giữa hai tay, nghiêng cho mặt giấy hướng lên mắt; mỗi ~1,3 s lật một tờ sang sau
  const cx = emo === "rage" ? lh.x + 0.1 : 0, cy = emo === "rage" ? lh.y : (lh.y + rh.y) / 2 + 0.02, cz = emo === "rage" ? lh.z + 0.02 : 0.37;
  P.g.position.set(cx, cy, cz); P.g.rotation.set(emo === "rage" ? -0.5 : -0.72, 0, emo === "shock" ? Math.sin(tt * 40) * 0.04 : 0);
  P.cyc += dt / (emo === "read" ? 1.0 : 1.7);
  const top = P.sheets[P.sheets.length - 1], lf = Math.sin(Math.PI * Math.min(1, P.cyc * 1.6));
  if (top) { top.position.x = lf * 0.2; top.position.y = (P.sheets.length - 1) * 0.0075 + lf * 0.05; top.rotation.z = lf * 0.7; }
  if (P.cyc >= 1) { P.cyc = 0; if (top) { top.position.x = 0; top.rotation.z = 0; P.sheets.unshift(P.sheets.pop()!); P.sheets.forEach((q, k) => (q.position.y = k * 0.0075)); } }   // lật xong: tờ trên cùng xuống đáy xấp
}

/** Người bị xử: đứng dựa gốc cây tay bị trói ra sau; sau loạt đạn thì gục xuống treo trên dây. */
function victimPose(dt: number) {
  const v = S.vClone; if (!v || !S.victim) return; const u = v.g.userData;
  const k = S.slump, tt = S.t;
  if (S.tied) {
    u.armL.rotation.set(0.55, 0, 0.12); u.armR.rotation.set(0.55, 0, -0.12); u.armL.userData.elbow.rotation.x = -0.1; u.armR.userData.elbow.rotation.x = -0.1;
    u.head.rotation.x = lerp(0.0, 0.85, k) + (k < 0.05 ? Math.sin(tt * 3) * 0.05 : 0); u.head.rotation.y = k < 0.05 ? Math.sin(tt * 1.7) * 0.4 : 0.15 * k;
    u.legL.rotation.x = -0.35 * k; u.legR.rotation.x = -0.35 * k; for (const l of [u.legL, u.legR]) if (l.userData.knee) l.userData.knee.rotation.x = 0.7 * k;
    if (S.pivot) { S.pivot.rotation.x = 0.55 * k; v.g.position.set(0, -1.0 - 0.18 * k, 0); }
    if (k < 0.05) { v.g.rotation.z = Math.sin(tt * 13) * 0.012; }
  }
}

/* ───────────── chọn chỗ đặt cây xử bắn ───────────── */
function blocked(x: number, z: number, m: number) { if (!walkable(x, z)) return true; for (const [cx, cz, w, d] of WALLS) if (Math.abs(x - cx) < w / 2 + m && Math.abs(z - cz) < d / 2 + m) return true; return false; }
function pickTreeSpot() {
  let best: { x: number; z: number; ux: number; uz: number; score: number } | null = null;
  const R = 15;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2 + Math.random() * 0.05, ux = -Math.cos(a), uz = -Math.sin(a), tx = Math.cos(a) * R, tz = Math.sin(a) * R;   // u = hướng từ cây về phía lửa
    let ok = true, hmin = 1e9, hmax = -1e9;
    for (let d = -2.5; d <= 8.5 && ok; d += 1) for (const s of [-3, 0, 3]) {
      const x = tx + ux * d - uz * s, z = tz + uz * d + ux * s; if (blocked(x, z, 1.2)) { ok = false; break; }
      const h = groundAt(x, z); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
    }
    if (!ok) continue; const score = hmax - hmin + Math.random() * 0.4;
    if (!best || score < best.score) best = { x: tx, z: tz, ux, uz, score };
  }
  if (best) return best;
  for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2, x = Math.cos(a) * 12, z = Math.sin(a) * 12; if (walkable(x, z)) return { x, z, ux: -Math.cos(a), uz: -Math.sin(a), score: 9 }; }
  return { x: 12, z: 0, ux: -1, uz: 0, score: 9 };
}

/* ───────────── kịch bản ───────────── */
const NAME = (i: number) => NAMES[i];

export function beginTribunal(): Tribunal {
  S.on = true; S.t = 0; S.abort = false; TRIB.active = true; S.props = []; S.goals.clear(); S.aim.clear(); S.emo.clear(); S.speaking.clear(); S.look.clear(); S.victim = null; S.vClone = null; S.pivot = null; S.slump = 0; S.tied = false; S.ropes = 0; S.paperMode = "read"; S.grab.clear();
  S.ents = entities.filter((e) => !e.dead && !e.out && !(e.i === G.slot && G.ghost));
  S.ents.forEach((e) => { e.g.visible = true; (e.g.userData.tag as THREE.Object3D).visible = false; });   // ẩn nhãn tên lơ lửng khi quay cận cảnh
  S.holder = rnd(S.ents);
  mountUi(); if (ui) ui.tag.textContent = ((LINES.tag as Record<string, string>)[locale.lang] ?? LINES.tag.en); ui?.tag.classList.add("on");
  const h = S.holder; makePapers(h); S.emo.set(h.i, "read");
  for (const e of S.ents) if (e !== h) S.emo.set(e.i, "idle");
  for (const e of S.ents) if (e !== h) S.look.set(e.i, h.i);
  let verdict: null | { slot: number | null; spy: boolean; done: () => void } = null, finished: Promise<void>, fin!: () => void;
  finished = new Promise<void>((r) => (fin = r));
  void run();

  async function run() {
    try {
      shotFace(h, 2.3, 0.7, 0.05);
      // ── 1) clip đọc phiếu: chạy hết kịch bản mở đầu (tối thiểu), rồi lặp "chờ" tới khi có kết quả ──
      let beat = 0;
      const lines = LINES.intro as unknown as { emo: Emo; en: string; vi: string }[], waits = LINES.wait as unknown as { emo: Emo; en: string; vi: string }[];
      for (const ln of lines) {
        S.emo.set(h.i, ln.emo); S.paperMode = ln.emo === "shock" ? "up" : "read";
        reactCrowd(ln.emo);
        const shots = [() => shotFace(h, 2.2, 0.7, 0.05), () => shotPapers(h), () => shotFace(h, 1.9, -0.6, 0.05, 0.05), () => shotWide(Math.random() * 6), () => shotChest(h, 2.2, 0.7)];
        (ln.emo === "read" ? [shots[1], shots[0]][beat % 2] : ln.emo === "shock" ? shots[2] : ln.emo === "rage" ? shots[4] : shots[beat % shots.length])();
        await say(h, TXT(ln, "intro" + lines.indexOf(ln)), { shout: ln.emo === "rage" || ln.emo === "anger", hold: ln.emo === "read" ? 1.0 : 0.6 }); beat++;
        if (beat === 3) { shotWide(2); await wait(1.2); }
      }
      let w = 0;
      while (!verdict) {
        const wi = w++ % waits.length, ln = waits[wi]; S.emo.set(h.i, ln.emo); S.paperMode = "read"; reactCrowd(ln.emo);
        [() => shotFace(h, 2.1, 0.6, 0.05), () => shotPapers(h), () => shotChest(h, 2.6, -0.9)][w % 3]();
        await say(h, TXT(ln, "wait" + wi), { shout: ln.emo === "anger", hold: 0.9 });
        if (!verdict) await wait(1.0 + Math.random());
      }
      // ── 2) công bố ──
      const v = verdict as { slot: number | null; spy: boolean; done: () => void };
      ui?.tag.classList.remove("on"); S.emo.set(h.i, "grim"); S.paperMode = "low"; S.look.clear(); S.ents.forEach((e) => { if (e !== h) S.look.set(e.i, h.i); });
      shotFace(h, 1.9, 0.3, 0.08); const A = LINES.announce;
      await say(h, TXT(A.ready, "ready"), { hold: 0.9 });
      if (v.slot === null) {
        S.emo.set(h.i, "tense"); shotChest(h, 2.4, 0.5); await say(h, TXT(A.tie, "atie"), { hold: 1.5 });
        await outro(); v.done(); return;
      }
      const victim = entities[v.slot], self = victim === h;
      if (self) {
        S.emo.set(h.i, "shock"); await say(h, TXT(A.self, "self"), { shout: true, hold: 0.8 });
      } else {
        shotFace(h, 1.7, 0.3, 0.1); await say(h, TXT(A.before, "before"), { hold: 1.3 });
        S.emo.set(h.i, "rage"); S.paperMode = "up"; shotFace(h, 1.5, 0.2, 0.08);
        await say(h, TXT(A.name, "name" + v.slot, NAME(v.slot)), { shout: true, hold: 0.4 });
      }
      flash(); sfx.kill();
      // người bị loại sững sờ, những người còn lại quay phắt nhìn
      S.victim = victim; S.emo.set(victim.i, "plead"); S.ents.forEach((e) => { if (e !== victim) { S.emo.set(e.i, e === h ? "grim" : "shock"); S.look.set(e.i, victim.i); } });
      dropPapers(); S.look.delete(victim.i);
      shotFace(victim, 2.0, 0.5, 0.1); await wait(1.6);
      const pi = (Math.random() * LINES.plea.length) | 0;
      await say(victim, TXT(LINES.plea[pi], "plea" + pi), { shout: true, hold: 0.6 });
      await execution(victim, h, v.spy);
      await outro(); v.done();
    } catch (e) { if (!(e instanceof Abort)) console.error("[tribunal]", e); fin(); }
  }

  /** Khán giả phản ứng theo cảm xúc của người đọc: giật mình, nhíu mày… */
  function reactCrowd(emo: Emo) {
    for (const e of S.ents) { if (e === h) continue; const r = Math.random(); S.emo.set(e.i, emo === "shock" ? (r < 0.7 ? "shock" : "tense") : emo === "rage" || emo === "anger" ? (r < 0.5 ? "tense" : "shock") : emo === "tense" ? "tense" : r < 0.3 ? "tense" : "idle"); }
  }

  /* ───── 3) XỬ BẮN ───── */
  async function execution(victim: Entity, cmd: Entity, spy: boolean) {
    standAll(); S.ents.forEach((e) => { e.y = e.seat >= 0 ? e.y : groundAt(e.x, e.z); });
    const others = S.ents.filter((e) => e !== victim), tree = pickTreeSpot(), spot = { x: tree.x + tree.ux * 0.68, z: tree.z + tree.uz * 0.68 };
    const treeG = makeTree(tree.x, tree.z); void treeG;
    const ux = tree.ux, uz = tree.uz, vx = -uz, vz = ux, yaw = Math.atan2(ux, uz);   // yaw: hướng nhìn của người bị trói (về phía lửa / xạ thủ)

    // a) cả nhóm xúm lại quanh người bị loại
    S.emo.set(cmd.i, "rage"); S.look.clear(); others.forEach((e) => S.look.set(e.i, victim.i));
    const ring = others.map((e, k) => { const a = (k / others.length) * Math.PI * 2; return { e, x: victim.x + Math.cos(a) * 1.15, z: victim.z + Math.sin(a) * 1.15 }; });
    ring.forEach((r) => walk(r.e, r.x, r.z, 3.6, Math.atan2(victim.x - r.x, victim.z - r.z)));
    shotWide(Math.atan2(victim.x, victim.z) + 0.5, 7, 3.8);
    void say(cmd, TXT(LINES.strip[0], "strip0"), { shout: true, hold: 0.2 });
    await walkWait(others, 5); await wait(0.4);
    // b) lột áo + tước vũ khí
    shotChest(victim, 2.6, 0.9);
    for (const r of ring) { S.emo.set(r.e.i, "anger"); S.grab.add(r.e.i); }
    const bare = makeBare(victim); S.vClone = bare; bare.g.position.set(victim.x, victim.y, victim.z); bare.g.rotation.y = victim.rot;
    S.pivot = null; bare.g.visible = false;
    await wait(1.1);
    sfx.hit(); flash(); bare.g.visible = true; dropLoot(victim, victim.x + 0.9, victim.z - 0.4); victim.g.visible = false;
    bare.face(F(1, 2)); bare.armL.rotation.set(-0.4, 0, 0.5); bare.armR.rotation.set(-0.4, 0, -0.5);
    await wait(1.4);
    others.forEach((e) => S.grab.delete(e.i));
    // c) lôi ra gốc cây (hai người kẹp hai bên, những người còn lại theo sau)
    const esc = others.slice(0, 2), rest = others.slice(2);
    S.emo.set(cmd.i, "anger"); void say(cmd, TXT(LINES.tie[0], "tie0"), { shout: true, hold: 0.2 });
    const pathV = ringPath(victim.x, victim.z, spot.x, spot.z);
    S.goals.set(victim.i, { path: pathV.map((p) => [...p] as [number, number]), sp: 2.6, face: null, done: false });
    esc.forEach((e, k) => S.goals.set(e.i, { path: pathV.map((p) => [p[0] + vx * (k ? 0.9 : -0.9) + ux * 0.3, p[1] + vz * (k ? 0.9 : -0.9) + uz * 0.3] as [number, number]), sp: 2.6, face: null, done: false }));
    rest.forEach((e, k) => walk(e, spot.x + ux * (3 + k * 0.5) + vx * (k % 2 ? 2 : -2), spot.z + uz * (3 + k * 0.5) + vz * (k % 2 ? 2 : -2), 3.2, yaw + Math.PI));
    shotFollow([victim, ...esc], V3(vx * 4.5 - ux * 3, 2.4, vz * 4.5 - uz * 3));
    // người bị lôi đi: thân nằm theo hướng đi, bị kéo
    const dragT = setInterval(() => { const g = S.goals.get(victim.i); if (!g || g.done) return; bare.g.position.set(victim.x, victim.y, victim.z); bare.g.rotation.y = victim.rot; }, 16);
    try { await walkWait([victim, ...esc], 22); } finally { clearInterval(dragT); }
    // d) trói vào gốc cây
    victim.x = spot.x; victim.z = spot.z; victim.y = groundAt(spot.x, spot.z); victim.rot = yaw;
    const pv = new THREE.Group(); pv.rotation.order = "YXZ"; pv.position.set(spot.x, victim.y + 1.0, spot.z); pv.rotation.y = yaw; scene.add(pv); S.props.push(pv); S.pivot = pv; pv.add(bare.g); bare.g.position.set(0, -1.0, 0); bare.g.rotation.set(0, 0, 0);
    S.tied = true; S.slump = 0; bare.face(F(1, 2));
    esc.forEach((e, k) => { walk(e, spot.x + ux * 1.1 + vx * (k ? 0.8 : -0.8), spot.z + uz * 1.1 + vz * (k ? 0.8 : -0.8), 2.4, yaw + Math.PI); });
    shotFace(victim, 2.0, 0.9, 0.1); cut({ pos: () => V3(spot.x + ux * 2.2 + vx * 1.2, victim.y + 1.55, spot.z + uz * 2.2 + vz * 1.2), look: () => V3(spot.x, victim.y + 1.3, spot.z), k: 3 });
    esc.forEach((e) => S.grab.add(e.i));
    for (let k = 0; k < 3; k++) {
      await wait(0.7); const y = [0.55, 1.1, 1.58][k], rope = group(spot.x + ux * 0.22, victim.y + y, spot.z + uz * 0.22); rope.rotation.y = yaw;
      for (const [w, d, x, z] of [[0.04, 1.5, 0.5, 0], [0.04, 1.5, -0.5, 0], [1.04, 0.04, 0, 0.73], [1.04, 0.04, 0, -0.73]] as number[][]) box(w, 0.07, d, 0x8a6a3a, x, 0, z, rope);
      sfx.pin(); S.ropes++;
    }
    esc.forEach((e) => S.grab.delete(e.i)); await walkWait(esc, 4); S.emo.set(victim.i, "plead");
    await say(victim, TXT(LINES.begging[0], "begging0"), { hold: 0.5 });
    // e) xếp hàng xạ thủ cách cây ~7,5 m, quay mặt vào người bị trói; số còn lại đứng quan sát phía sau
    const squad = others.filter((e) => e !== cmd).slice(0, 6); if (!squad.length) squad.push(cmd);
    const watch = others.filter((e) => !squad.includes(e) && e !== cmd), C = { x: spot.x + ux * 7.4, z: spot.z + uz * 7.4 }, face = Math.atan2(-ux, -uz);
    squad.forEach((e, k) => { walk(e, C.x + vx * (k - (squad.length - 1) / 2) * 1.2, C.z + vz * (k - (squad.length - 1) / 2) * 1.2, 3.6, face); S.look.set(e.i, victim.i); });
    watch.forEach((e, k) => walk(e, C.x + ux * (2 + (k >> 1) * 0.8) + vx * ((k % 2 ? 1 : -1) * (1.6 + (k >> 1) * 1.1)), C.z + uz * (2 + (k >> 1) * 0.8) + vz * ((k % 2 ? 1 : -1) * (1.6 + (k >> 1) * 1.1)), 3.4, face));
    if (cmd !== squad[0]) walk(cmd, C.x + vx * ((squad.length + 1) / 2 + 0.6) + ux * 0.5, C.z + vz * ((squad.length + 1) / 2 + 0.6) + uz * 0.5, 3.4, face);
    S.ents.forEach((e) => { if (e !== victim) S.emo.set(e.i, "grim"); });
    shotFollow(squad, V3(vx * 8, 2.4, vz * 8));
    await walkWait([...squad, ...watch, cmd], 18);
    // f) hiệu lệnh: vào vị trí → nạp đạn → nhắm → BẮN
    const SQ = LINES.squad as unknown as { key: string; en: string; vi: string }[];
    const ck = (k: string) => SQ.find((s) => s.key === k)!;
    S.emo.set(cmd.i, "anger"); cut({ pos: () => V3(C.x + ux * 3.4 + vx * 2, groundAt(C.x, C.z) + 1.8, C.z + uz * 3.4 + vz * 2), look: () => V3(C.x, groundAt(C.x, C.z) + 1.3, C.z), k: 2.5 });
    await say(cmd, TXT(ck("pos"), "squad_pos"), { shout: true, hold: 0.5 });
    shotFace(victim, 2.3, 0.4, 0.1); squad.forEach((e) => S.aim.set(e.i, 0.6)); sfx.swap();
    await say(cmd, TXT(ck("load"), "squad_load"), { shout: true, hold: 0.5 }); sfx.reload(0.6);
    cut({ pos: () => V3(C.x + ux * 1.6 + vx * 1.3, groundAt(C.x, C.z) + 1.75, C.z + uz * 1.6 + vz * 1.3), look: () => V3(spot.x, victim.y + 1.3, spot.z), k: 3 });
    squad.forEach((e) => S.aim.set(e.i, 1));
    await say(cmd, TXT(ck("aim"), "squad_aim"), { shout: true, hold: 1.4 });
    S.emo.set(victim.i, "plead"); shotFace(victim, 2.2, 0.2, 0.2); await wait(0.5);
    cut({ pos: () => V3((spot.x + C.x) / 2 + vx * 7, groundAt(C.x, C.z) + 1.5, (spot.z + C.z) / 2 + vz * 7), look: () => V3((spot.x + C.x) / 2, groundAt(C.x, C.z) + 1.3, (spot.z + C.z) / 2), k: 3 });
    await say(cmd, TXT(ck("fire"), "squad_fire"), { shout: true, hold: 0.05 });
    await volley(squad, victim, spot, bare, tree, spy);
    await wait(2.6);
  }

  /** Loạt đạn: tiếng nổ lệch nhau vài chục mili-giây, tia lửa nòng, vệt đạn, máu; người bị trói gục xuống. */
  async function volley(squad: Entity[], victim: Entity, spot: { x: number; z: number }, bare: ReturnType<typeof makeBare>, tree: { ux: number; uz: number }, spy: boolean) {
    const chest = V3(spot.x, victim.y + 1.25, spot.z), MZ = V3(), T = V3();
    flash(); hooks.shake(0.7); bare.face(F(1, 2)); void spy;
    squad.forEach((e, k) => setTimeout(() => {
      const u = e.g.userData, gid = e.i === G.slot ? GUNS[W.cur].id : (u.gunId as string), model = u.gunRig?.models?.[gid] as THREE.Object3D | undefined;
      e.kick = 1; if (model) { model.updateWorldMatrix(true, false); MZ.copy(model.userData.muzzle as THREE.Vector3).applyMatrix4(model.matrixWorld); setFlash(model, true); setTimeout(() => setFlash(model, false), 90); } else MZ.set(e.x, e.y + 1.4, e.z);
      T.copy(chest).add(V3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.2));
      tracer(MZ, T); burst(T, "blood", 8, 3, 0.07, 0.7, 1.2); sfx.shot(gid === "sniper" ? "sniper" : "rifle", 1); if (k === 0) sfx.hit();
      burst(V3(spot.x - tree.ux * 0.5, T.y, spot.z - tree.uz * 0.5), "dust", 3, 2, 0.07, 0.5, 0.6);
    }, k * 45 + Math.random() * 50));
    await wait(0.5); sfx.kill(); bare.face(F(0, 0)); bare.face(2);
    for (let k = 0; k <= 30; k++) { S.slump = k / 30; S.slump = S.slump * S.slump * (3 - 2 * S.slump); await wait(0.03); }
    bloodPool(spot.x + tree.ux * 0.3, spot.z + tree.uz * 0.3, 0, 1.2);
    squad.forEach((e) => S.aim.set(e.i, 0)); S.emo.set(victim.i, "idle");
  }

  async function outro() {
    // lời cuối của người chỉ huy + tiết lộ phiếu có phải gián điệp không (kết quả THẬT từ contract), rồi tối dần
    const v = verdict!;
    if (v.slot !== null) {
      cut({ pos: () => centroid(S.ents.filter((e) => e !== S.victim)).add(V3(0, 3.2, 6)), look: () => V3(S.vClone?.g.getWorldPosition(V3()).x ?? 0, groundAt(0, 0) + 1.2, S.vClone?.g.getWorldPosition(V3()).z ?? 0), k: 1.5 });
      S.ents.forEach((e) => { if (e !== S.victim) { S.emo.set(e.i, "grim"); S.look.set(e.i, v.slot as number); } });
      const who = S.holder!;
      await say(who, TXT(LINES.after[0], "after0"), { hold: 0.7 });
      splash(UI.ejected(NAME(v.slot), v.spy), "", v.spy ? "#5f9" : "#f55", 34, "rgba(0,0,0,.35)");
      await wait(3.2); hideSplash();
    } else { await wait(0.4); }
    if (ui) ui.fade.style.opacity = "1"; await wait(1.5);
  }

  const cleanup = () => {
    S.on = false; TRIB.active = false; speakSeq++; captionOff();
    try { speechSynthesis.cancel(); } catch { /* không có giọng đọc */ }
    dropPapers(); S.goals.clear(); S.aim.clear(); S.grab.clear();
    for (const e of S.ents) { const tg = e.g.userData.tag as THREE.Object3D | undefined; if (tg) tg.visible = !e.dead; }
    for (const e of S.ents) { e.aim = 0; e.kick = 0; const u = e.g.userData; u.face?.(0); if (u.head) { u.head.rotation.set(0, 0, 0); } }
    for (const o of S.props) o.parent?.remove(o); S.props = [];
    if (S.vClone) { S.vClone.g.parent?.remove(S.vClone.g); S.vClone = null; }
    S.pivot = null; clearBlood();
    ui?.root.remove(); ui = null; hideSplash();
    if (S.victim) S.victim.g.visible = false;
  };

  return {
    resolve(slot, spy) {
      if (verdict) return finished;
      verdict = { slot, spy, done: () => { cleanup(); fin(); } };
      return finished;
    },
    abort() {
      S.abort = true; cleanup();
      // trả người đọc về trạng thái bình thường; ghế ngồi giữ nguyên để màn họp mở lại được
      fin();
    },
  };
}
