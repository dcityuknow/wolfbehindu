import * as THREE from "three";
import { LIGHT } from "../config";

export const canvasEl = document.getElementById("c") as HTMLCanvasElement;
export const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
camera.rotation.order = "YXZ";
export const torch = new THREE.PointLight(0xffe9c8, LIGHT.torch, LIGHT.torchRange, 2);

const HORIZON = 0xd2eaf2;
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
export function followSun(x: number, z: number) {
  const q = 1; x = Math.round(x / q) * q; z = Math.round(z / q) * q; // làm tròn để bóng không rung
  sun.target.position.set(x, 0, z); sun.position.set(x + 26, 46, z + 16); sun.target.updateMatrixWorld();
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
export const render = () => renderer.render(scene, camera);
