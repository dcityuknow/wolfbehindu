import * as THREE from "three";
import { scene, camera } from "./scene";
import { G } from "../state";
import { BLIZZARD as B } from "../config";
import { me } from "./characters";
import { CINE } from "./cineState";

/**
 * Gió thổi + tuyết bay trên đỉnh núi: hạt tuyết trôi theo chiều gió (có cơn gió giật mạnh yếu theo nhịp) trong một hộp quanh người chơi,
 * kèm các vệt gió trắng mảnh lướt ngang. Càng lên cao càng dày/mạnh (BLIZZARD trong config.ts); xuống dưới B.from thì tắt hẳn.
 * Hạt có toạ độ thế giới (đi bộ qua thì thấy tuyết lùi lại phía sau — có chiều sâu thật), chỉ được cuộn vòng quanh người để dùng lại.
 */
const sm = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/* ── hạt tuyết ── */
const N = B.count, HB = B.box, HY = 30;
const pos = new Float32Array(N * 3), vsp = new Float32Array(N * 3);   // vsp: [hệ số theo gió · tốc độ rơi · pha xoáy]
const geo = new THREE.BufferGeometry();
const rnd = Math.random;
for (let i = 0; i < N; i++) {
  pos[i * 3] = (rnd() * 2 - 1) * HB; pos[i * 3 + 1] = rnd() * HY - 6; pos[i * 3 + 2] = (rnd() * 2 - 1) * HB;
  vsp[i * 3] = 0.55 + rnd() * 0.9; vsp[i * 3 + 1] = 0.4 + rnd() * 1.1; vsp[i * 3 + 2] = rnd() * 6.28;
}
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
const flake = (() => {   // chấm tròn mềm
  const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
})();
const snowMat = new THREE.PointsMaterial({ map: flake, color: 0xf4fbff, size: 0.26, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
const snow = new THREE.Points(geo, snowMat); snow.frustumCulled = false; snow.visible = false; scene.add(snow);

/* ── vệt gió ── */
const SN = 140, sp = new Float32Array(SN * 3), sv = new Float32Array(SN * 2), sl = new Float32Array(SN * 6);
for (let i = 0; i < SN; i++) { sp[i * 3] = (rnd() * 2 - 1) * HB; sp[i * 3 + 1] = rnd() * HY - 6; sp[i * 3 + 2] = (rnd() * 2 - 1) * HB; sv[i * 2] = 0.8 + rnd() * 0.6; sv[i * 2 + 1] = rnd() * 6.28; }
const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute("position", new THREE.BufferAttribute(sl, 3));
const streakMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
const streaks = new THREE.LineSegments(sgeo, streakMat); streaks.frustumCulled = false; streaks.visible = false; scene.add(streaks);

/** Gió hiện tại (đọc được từ nơi khác): hướng (đơn vị) + tốc độ m/s. */
export const WIND = { x: 1, z: 0.4, speed: 0, k: 0 };

const wrap = (v: number, c: number, h: number) => ((((v - c + h) % (2 * h)) + 2 * h) % (2 * h)) - h + c;   // cuộn vòng về trong hộp [c-h, c+h)
const wrapY = (v: number, c: number, lo: number) => ((((v - c - lo) % HY) + HY) % HY) + lo + c;           // hộp cao HY, thấp nhất c+lo

export function updateBlizzard(dt: number, t: number) {
  const m = me(), play = G.phase === "play" && !CINE.active;
  const k = play ? sm((m.y - B.from) / (B.full - B.from)) : 0;
  WIND.k = k;
  if (k < 0.004) { snow.visible = streaks.visible = false; WIND.speed = 0; return; }
  // chiều gió trôi chậm theo thời gian; cơn giật = hai sóng chồng nhau
  const ang = 0.6 + Math.sin(t * 0.045) * 0.7 + Math.sin(t * 0.11 + 2) * 0.25;
  const gust = Math.max(0, 0.55 + 0.45 * Math.sin(t * 0.43) * Math.sin(t * 0.97 + 1.3) + 0.25 * Math.sin(t * 0.21));
  const spd = (B.windMin + (B.windMax - B.windMin) * k) * (0.6 + 0.6 * gust);
  const dx = Math.cos(ang), dz = Math.sin(ang);
  WIND.x = dx; WIND.z = dz; WIND.speed = spd;

  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  snow.visible = streaks.visible = true;
  geo.setDrawRange(0, Math.max(40, Math.floor(N * (0.18 + 0.82 * k))));
  snowMat.opacity = 0.35 + 0.5 * k; snowMat.size = 0.2 + 0.1 * k;
  streakMat.opacity = Math.min(0.5, (0.1 + 0.35 * gust) * k);

  for (let i = 0; i < N; i++) {
    const j = i * 3, w = vsp[j] * spd, ph = vsp[j + 2];
    pos[j] += (dx * w + Math.sin(t * 1.3 + ph) * 0.9) * dt;
    pos[j + 1] += (-vsp[j + 1] * (0.5 + 0.4 * k) + Math.sin(t * 2.1 + ph * 1.7) * 0.8 * k * (0.4 + gust)) * dt;   // rơi chậm + bị gió quật lên xuống
    pos[j + 2] += (dz * w + Math.cos(t * 1.1 + ph) * 0.9) * dt;
    pos[j] = wrap(pos[j], cx, HB); pos[j + 2] = wrap(pos[j + 2], cz, HB);
    pos[j + 1] = wrapY(pos[j + 1], cy, -8);
  }
  (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

  const len = 0.8 + spd * 0.22;
  for (let i = 0; i < SN; i++) {
    const j = i * 3, v = sv[i * 2] * spd * 1.25;
    sp[j] += dx * v * dt; sp[j + 2] += dz * v * dt; sp[j + 1] += Math.sin(t * 0.8 + sv[i * 2 + 1]) * 0.25 * dt;
    sp[j] = wrap(sp[j], cx, HB); sp[j + 2] = wrap(sp[j + 2], cz, HB);
    sp[j + 1] = wrapY(sp[j + 1], cy, -6);
    const o = i * 6;
    sl[o] = sp[j]; sl[o + 1] = sp[j + 1]; sl[o + 2] = sp[j + 2];
    sl[o + 3] = sp[j] - dx * len; sl[o + 4] = sp[j + 1] + 0.05 * len; sl[o + 5] = sp[j + 2] - dz * len;
  }
  (sgeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

  // sương mù bụi tuyết nhẹ khi gió giật mạnh ở sát đỉnh (không che khuất người ở xa)
  const F = scene.fog as THREE.FogExp2; F.density += 0.0012 * k * gust;
}
