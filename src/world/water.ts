import * as THREE from "three";
import { scene, camera } from "./scene";
import { G } from "../state";
import { MV, W } from "../weaponState";
import { WATER } from "../config";
import { me } from "./characters";
import { surfaceAt, pondAt } from "./island";
import { CINE } from "./cineState";
import { DAY } from "./daycycle";
import { sfx, cineSfx, underSfx } from "../audio";
import { flashRed } from "../ui/hud";

/**
 * Bơi + LẶN + nín thở (bê cách làm của game tham khảo: nature/swim.js + nature/runtime.js), dùng chung cho biển và các hồ trên cao nguyên.
 *  - Xuống nước: tiếng "tũm"; bơi: mỗi nhịp quạt tay một tiếng "bì-bõm"; lên bờ: tiếng nước nhỏ.
 *  - Giữ Shift = lặn, Space = trồi nhanh, thả ra = tự nổi lên. Đầu chìm dưới mặt nước thì: màn hình phủ xanh nước + sương dày, bong bóng khí, tiếng ù dưới nước.
 *  - Hơi thở (WATER.air giây): hết thì mất máu từng nhịp tới khi ngoi lên (không bao giờ xuống dưới 1 máu — cái chết thật chỉ đến từ xử bắn on-chain).
 */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* ── màn nước phủ màn hình + thanh hơi thở ── */
let ov: HTMLDivElement | null = null, bar: HTMLDivElement | null = null, fill: HTMLDivElement | null = null, tintKey = "";
function overlay() {
  if (ov) return ov;
  ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;transition:none";
  document.body.appendChild(ov);
  return ov;
}
function airBar() {
  if (bar) return bar;
  bar = document.createElement("div");
  bar.style.cssText = "position:fixed;left:50%;bottom:132px;transform:translateX(-50%);width:210px;height:16px;border-radius:9px;background:rgba(0,20,40,.55);border:1px solid rgba(160,220,255,.6);padding:2px;z-index:6;pointer-events:none;display:none;box-sizing:border-box";
  bar.innerHTML = '<div style="position:absolute;left:-26px;top:-5px;font-size:18px">🫧</div>';
  fill = document.createElement("div"); fill.style.cssText = "height:100%;width:100%;border-radius:6px;background:linear-gradient(#bfeaff,#43b4ff)"; bar.appendChild(fill);
  document.body.appendChild(bar);
  return bar;
}

/* ── mặt nước nhìn từ DƯỚI lên (tấm phẳng chỉ thấy mặt sau) ── */
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x7fd6f0, transparent: true, opacity: 0.5, side: THREE.BackSide, depthWrite: false, fog: false }));
ceil.rotation.x = -Math.PI / 2; ceil.renderOrder = 3; ceil.visible = false; ceil.frustumCulled = false; scene.add(ceil);

/* ── bong bóng khí nổi lên (pool) ── */
const bGeo = new THREE.SphereGeometry(0.5, 6, 5), bMat = new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.8, fog: false });
const bubs = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(bGeo, bMat); m.visible = false; m.frustumCulled = false; scene.add(m); return { m, vy: 0, top: 0, ph: 0, life: 0 }; });
let bi = 0;
function bubble(x: number, y: number, z: number, top: number) {
  const b = bubs[bi++ % bubs.length], s = 0.04 + Math.random() * 0.07;
  b.m.position.set(x, y, z); b.m.scale.setScalar(s); b.m.visible = true; b.vy = 0.9 + Math.random() * 0.7; b.top = top; b.ph = Math.random() * 6.28; b.life = 4;
}

/* ── sương dưới nước: nhớ màu/độ đặc gốc để trả lại khi lên mặt nước ── */
const WC = new THREE.Color(), WC0 = new THREE.Color(), FOG0 = DAY.fog;   // FOG0 = màu sương trên mặt nước THEO GIỜ (daycycle.ts cập nhật mỗi khung), không còn là hằng số ban ngày
let fogOn = false, uw = 0;

let wasIn = false, wasUnder = false, strokePh = 0, treadT = 0, bubT = 0, dmT = 0, deepT = 0;

function drown() {
  const m = me();
  for (let i = 0; i < 4; i++) bubble(m.x + (Math.random() - 0.5) * 0.5, m.y + 1.4, m.z + (Math.random() - 0.5) * 0.5, surfaceAt(m.x, m.z));
  const dmg = Math.min(W.hp - 1, WATER.drownDmg);
  if (dmg >= 1) { W.hp -= dmg; flashRed(dmg); }
  sfx.drown();
}

/** Gọi mỗi frame SAU updateCamera (cần vị trí camera thật) và SAU khi main.ts đặt độ đặc sương. */
export function updateWater(dt: number, t: number) {
  const m = me(), F = scene.fog as THREE.FogExp2;
  const play = G.phase === "play" && !CINE.active && !G.ghost && !m.dead && !G.mini;
  const inW = play && MV.inWater;
  const surf = inW ? surfaceAt(m.x, m.z) : 0;
  const under = inW && m.y + 1.3 < surf - 0.03;           // ĐẦU chìm → hết hơi dần, có bong bóng, không bắn được
  const camUnder = inW && camera.position.y < surf - 0.02; // CAMERA chìm (góc 3 đứng cao hơn đầu) → phủ màn nước
  MV.under = under;

  /* âm thanh vào/ra nước, nhịp bơi, đạp nước, lặn xuống / ngoi lên */
  if (play) {
    if (inW && !wasIn) sfx.splash(true);
    else if (!inW && wasIn) sfx.splash(false);
    if (inW) {
      const ph = Math.floor(MV.stk / Math.PI);
      if (MV.swimK > 0.3 && ph !== strokePh) sfx.wade(under ? 0.5 : 1);     // mỗi nhịp quạt tay một tiếng "bì-bõm"
      strokePh = ph;
      if (!MV.swimming && !under) { treadT -= dt; if (treadT <= 0) { treadT = 1.4 + Math.random() * 0.5; sfx.wade(0.3); } }   // đứng đạp nước: khẽ
    }
    if (under && !wasUnder) { sfx.dive(); for (let i = 0; i < 6; i++) bubble(m.x + (Math.random() - 0.5) * 0.7, m.y + 1.2, m.z + (Math.random() - 0.5) * 0.7, surf); }
    if (!under && wasUnder) { sfx.splash(false, 0.8); if (MV.air < 0.45) cineSfx.breath(); }   // ngoi lên: tiếng nước + thở gấp nếu nín lâu
  }
  wasIn = inW; wasUnder = under;

  /* hơi thở */
  if (under) {
    MV.air = Math.max(0, MV.air - dt / WATER.air);
    if (MV.air <= 0) { dmT -= dt; if (dmT <= 0) { dmT = WATER.drownTick; drown(); } } else dmT = 0;
    bubT -= dt;
    if (bubT <= 0) { bubT = 0.3 + Math.random() * 0.3; bubble(m.x + (Math.random() - 0.5) * 0.5, m.y + 1.45, m.z + (Math.random() - 0.5) * 0.5, surf); sfx.bubble(); }
    if (MV.air < 0.25) { deepT -= dt; if (deepT <= 0) { deepT = 1.6; cineSfx.heart(); } }   // sắp hết hơi: tim đập thình thịch
  } else {
    MV.air = Math.min(1, MV.air + (inW ? 3 : 4) * dt / WATER.air); dmT = 0; deepT = 0;
  }
  const b = airBar();
  b.style.display = play && (under || MV.air < 0.999) ? "block" : "none";
  if (fill) { fill.style.width = (MV.air * 100).toFixed(1) + "%"; fill.style.background = MV.air < 0.25 ? "linear-gradient(#ffb0b0,#ff4d4d)" : "linear-gradient(#bfeaff,#43b4ff)"; }

  /* nhìn dưới nước: phủ xanh + sương đặc + mặt nước nhìn từ dưới lên */
  uw += ((camUnder ? 1 : 0) - uw) * Math.min(1, dt * 10);
  underSfx.set(uw);
  const pond = inW && pondAt(m.x, m.z) !== null, key = pond ? "p" : "s";
  if (key !== tintKey) {
    tintKey = key;
    overlay().style.background = pond ? "linear-gradient(rgba(40,110,180,.5),rgba(10,50,120,.82))" : "linear-gradient(rgba(20,130,160,.5),rgba(6,70,110,.82))";
    WC0.setHex(pond ? 0x0b4a86 : 0x0a5a78);
  }
  WC.copy(WC0).multiply(DAY.tint);   // dưới nước ban đêm tối hơn
  overlay().style.filter = `brightness(${(0.3 + 0.7 * (1 - DAY.night)).toFixed(2)})`;
  overlay().style.opacity = uw < 0.01 ? "0" : uw.toFixed(2);
  if (uw > 0.005) { fogOn = true; F.color.copy(FOG0).lerp(WC, uw); F.density += (0.11 - F.density) * uw; }
  else if (fogOn) { F.color.copy(FOG0); fogOn = false; }
  ceil.visible = camUnder;
  if (camUnder) {
    const s = pond ? 44 : 260; ceil.scale.set(s, s, 1); ceil.position.set(camera.position.x, surf, camera.position.z);
    (ceil.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.1 * Math.sin(t * 1.7);
  }

  /* bong bóng bay lên rồi vỡ ở mặt nước */
  for (const p of bubs) {
    if (!p.m.visible) continue;
    p.life -= dt; p.m.position.y += p.vy * dt; p.m.position.x += Math.sin(t * 3 + p.ph) * 0.05 * dt; p.m.position.z += Math.cos(t * 2.4 + p.ph) * 0.05 * dt;
    if (p.m.position.y >= p.top - 0.02 || p.life <= 0) p.m.visible = false;
  }
}
