import * as THREE from "three";
import { LIGHT } from "../config";
import { W } from "../weaponState";

export const canvasEl = document.getElementById("c") as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 700);
camera.rotation.order = "YXZ"; camera.layers.enable(1);   // layer 1 = súng / tay góc thứ nhất
export const torch = new THREE.PointLight(0xffe9c8, LIGHT.torch, LIGHT.torchRange, 2);

const HORIZON = 0xcfe6f2;
scene.background = new THREE.Color(HORIZON);
scene.fog = new THREE.FogExp2(HORIZON, LIGHT.fogPlay);

export const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xe3d3a0, LIGHT.ambient);
scene.add(hemi, torch);
export const sun = new THREE.DirectionalLight(0xfff0d6, LIGHT.sun);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 120 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
/** Ánh nắng + bóng đổ đi theo người chơi (giữ bản đồ shadow nhỏ mà vẫn nét). */
export function followSun(x: number, y: number, z: number) {
  const q = 1; x = Math.round(x / q) * q; z = Math.round(z / q) * q; // làm tròn để bóng không rung
  sun.target.position.set(x, y, z); sun.position.set(x + 26, y + 46, z + 16); sun.target.updateMatrixWorld();
}

// Bầu trời gradient + mặt trời
export const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x3d90e6) }, mid: { value: new THREE.Color(0xa6d8f5) }, hor: { value: new THREE.Color(HORIZON) } },
  vertexShader: "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: "uniform vec3 top,mid,hor;varying vec3 p;void main(){float h=clamp(normalize(p).y,0.,1.);vec3 c=mix(hor,mid,smoothstep(0.,.25,h));c=mix(c,top,smoothstep(.2,.9,h));gl_FragColor=vec4(c,1.);}",
}));
sky.renderOrder = -10; scene.add(sky);
const orb = (r: number, col: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: col, fog: false })); m.position.set(x, y, z); scene.add(m); return m; };
export const sunOrb = orb(14, 0xfff6c8, 230, 190, 150);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

/* ── Kính ngắm súng ngắm (giống game tham khảo): cảnh bình thường vẫn thấy ở ngoài, chỉ mặt kính tròn giữa màn hình là cảnh phóng to ── */
const SCP = { r: 0.36, zoom: 6, fog: 0.35 };   // r: bán kính mặt kính (tỉ lệ cạnh ngắn màn hình) · zoom: số lần phóng đại · fog: nhân độ đặc sương khi nhìn qua kính (nhìn xa hơn)
const scopeCam = new THREE.PerspectiveCamera(10, 1, 0.05, 700); scopeCam.rotation.order = "YXZ";
const scopeR = () => Math.round(Math.min(innerWidth, innerHeight) * SCP.r);
const scopeLayout = () => document.documentElement.style.setProperty("--lr", scopeR() + "px");
addEventListener("resize", scopeLayout); scopeLayout();
const scRT = new THREE.WebGLRenderTarget(2, 2, { samples: 4 });
const scQS = new THREE.Scene(), scQC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
scQS.add(new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: scRT.texture, depthTest: false, depthWrite: false, fog: false })));
function renderScope() {
  const w = innerWidth, h = innerHeight, r = scopeR(), d = r * 2, x = Math.round(w / 2 - r), y = Math.round(h / 2 - r);
  scopeCam.position.copy(camera.position); scopeCam.quaternion.copy(camera.quaternion);
  const half = Math.tan(camera.fov * Math.PI / 360) * d / h;
  scopeCam.fov = 2 * Math.atan(half / SCP.zoom) * 180 / Math.PI; scopeCam.updateProjectionMatrix();
  const px = Math.max(2, Math.round(d * renderer.getPixelRatio())); if (scRT.width !== px) scRT.setSize(px, px);
  const fg = scene.fog as THREE.FogExp2, den = fg.density, ac = renderer.autoClear;
  fg.density = den * SCP.fog; renderer.autoClear = false;
  renderer.setRenderTarget(scRT); renderer.clear(); renderer.render(scene, scopeCam); renderer.setRenderTarget(null);   // lượt 1: cảnh zoom → texture
  renderer.setViewport(x, y, d, d); renderer.render(scQS, scQC); renderer.setViewport(0, 0, w, h);                  // lượt 2: dán lên đĩa tròn giữa màn hình
  renderer.autoClear = ac; fg.density = den;
}
export const render = () => { renderer.render(scene, camera); if (W.scoped) renderScope(); };
