import * as THREE from "three";
import { G } from "../state";
import { ALTITUDE as A } from "../config";
import { CAMP } from "./island";
import { me, suitMat } from "./characters";
import { fpMats } from "./camera";
import { canvasEl } from "./scene";
import { CINE } from "./cineState";
import { windSfx } from "../audio";
import { MV } from "../weaponState";
import { UI } from "../story";
import { toast } from "../ui/dom";

/**
 * Độ cao núi → (1) tiếng gió rít to dần từ A.windFrom tới sát đỉnh, (2) ĐỨNG LÂU trên cao (≥ A.frostFrom): quần áo phủ băng trắng (từ mặt hướng lên trên lan dần ra,
 * từng ô voxel) và màu sắc mất dần vì lạnh (người + cả màn hình + viền sương giá). Xuống thấp hoặc ra gần lửa trại thì tan dần. Chỉnh số ở ALTITUDE trong config.ts.
 */
export const COLD = { k: 0, wind: 0 };
const U = { uFrost: { value: 0 }, uCold: { value: 0 } };
const done = new WeakSet<THREE.Material>();
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sm = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Chèn hiệu ứng băng vào shader chuẩn: mask theo ô voxel (nhiễu) + ưu tiên mặt hướng lên; mix trắng-xanh băng; mất màu dần (desaturate + ngả xanh lạnh). */
function patch(mat: THREE.Material) {
  if (done.has(mat)) return; done.add(mat);
  const m = mat as THREE.MeshStandardMaterial;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFrost = U.uFrost; sh.uniforms.uCold = U.uCold;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFrP; varying vec3 vFrN;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFrP = position; vFrN = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFrost; uniform float uCold; varying vec3 vFrP; varying vec3 vFrN;")
      .replace("#include <color_fragment>", `#include <color_fragment>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 cold = vec3(lum * 0.86, lum * 0.97, lum * 1.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, cold, uCold * 0.85);
        float n = fract(sin(dot(floor(vFrP * 46.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float up = clamp(vFrN.y * 0.5 + 0.5, 0.0, 1.0);
        float thr = n * 0.72 + (1.0 - up) * 0.28;
        float e = uFrost * 1.25;
        float mask = 1.0 - smoothstep(e - 0.12, e, thr);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.95, 1.0), mask * 0.93);
      }`);
  };
  m.customProgramCacheKey = () => "frost1"; m.needsUpdate = true;
}

let ov: HTMLDivElement | null = null, lastF = -1, warn = 0;
function overlay() {
  if (ov) return ov;
  ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;background:radial-gradient(ellipse at center,rgba(200,230,255,0) 38%,rgba(190,225,255,.5) 72%,rgba(240,250,255,.92) 100%)";
  document.body.appendChild(ov); return ov;
}

/** Gọi mỗi frame sau khi cập nhật độ cao. */
export function updateAltitude(dt: number) {
  const m = me(), playing = G.phase === "play" && !CINE.active;
  if (G.phase === "menu" || CINE.active) { COLD.k = 0; warn = 0; }
  patch(suitMat(m.g)); for (const f of fpMats) patch(f);
  const y = m.y;
  // gió: theo độ cao (to dần, mạnh hẳn ở gần đỉnh)
  COLD.wind = playing ? sm((y - A.windFrom) / (A.windMax - A.windFrom)) : 0;
  windSfx.set(COLD.wind);
  // băng: đứng lâu thì phủ; đi lại chậm hơn; xuống thấp / gần lửa trại thì tan
  if (playing && !G.ghost && !m.dead) {
    const alt = clamp01((y - A.frostFrom) / (A.peak - A.frostFrom));
    if (y > A.frostFrom) COLD.k += (A.rateLow + (A.rateHigh - A.rateLow) * alt) * (MV.speed > 1 ? A.moveMul : 1) * dt;
    else COLD.k -= A.warm * dt;
    if (Math.hypot(m.x - CAMP[0], m.z - CAMP[1]) < A.campR) COLD.k -= A.campWarm * dt;
  } else if (G.ghost || m.dead) COLD.k -= A.warm * dt;
  COLD.k = clamp01(COLD.k);
  if (COLD.k > 0.4 && warn < 1) { warn = 1; toast(UI.coldWarn); } else if (COLD.k > 0.85 && warn < 2) { warn = 2; toast(UI.coldWarn); } else if (COLD.k < 0.1) warn = 0;
  U.uFrost.value = sm(COLD.k * 1.05); U.uCold.value = COLD.k;
  if (Math.abs(COLD.k - lastF) > 0.004) {
    lastF = COLD.k; const k = COLD.k;
    canvasEl.style.filter = k > 0.01 ? `saturate(${(1 - 0.72 * k).toFixed(3)}) contrast(${(1 - 0.06 * k).toFixed(3)}) brightness(${(1 + 0.06 * k).toFixed(3)})` : "";   // cả thế giới mất màu dần
    overlay().style.opacity = String(clamp01((k - 0.15) * 1.15));                                                                                          // sương giá bám viền màn hình
  }
}
