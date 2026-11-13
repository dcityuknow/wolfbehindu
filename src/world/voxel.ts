import * as THREE from "three";
import { hash } from "./noise";

export { hash, vnoise, fbm, fbm4, smooth, lerp } from "./noise";

/** Texture "pixel" 8x8 (nhiễu xám nhẹ, NearestFilter) -> mọi khối trông như block pixel-art. */
let _tex: THREE.CanvasTexture | null = null;
export function pixelTexture() {
  if (_tex) return _tex;
  const c = document.createElement("canvas"); c.width = c.height = 8;
  const g = c.getContext("2d")!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let v = 218 + Math.floor(hash(x, y, 3) * 37);
    if (x === 0 || y === 0) v -= 18; // viền tối nhẹ -> thấy rõ từng khối
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1);
  }
  _tex = new THREE.CanvasTexture(c);
  _tex.magFilter = THREE.NearestFilter; _tex.minFilter = THREE.NearestMipmapLinearFilter; _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}
export const voxMat = (color = 0xffffff, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map: pixelTexture(), color, roughness: 0.92, metalness: 0, ...extra });
const unit = new THREE.BoxGeometry(1, 1, 1);

/** Gom hàng nghìn khối thành 1 InstancedMesh (1 draw call). box(x,y,z) = TÂM khối. */
export class VoxelBatch {
  private d: number[] = [];
  count = 0;
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, jitter = 0.07) {
    const c = new THREE.Color(color), j = 1 + (hash(x * 1.7, y * 2.3, z * 3.1) - 0.5) * 2 * jitter;
    this.d.push(x, y, z, sx, sy, sz, Math.min(1, c.r * j), Math.min(1, c.g * j), Math.min(1, c.b * j)); this.count++;
  }
  cube(x: number, y: number, z: number, color: number, jitter = 0.07) { this.box(x, y, z, 1, 1, 1, color, jitter); }
  build(cast = true, receive = true, material: THREE.Material = voxMat()) {
    const m = new THREE.InstancedMesh(unit, material, Math.max(1, this.count)), M = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const o = i * 9, d = this.d;
      M.compose(new THREE.Vector3(d[o], d[o + 1], d[o + 2]), new THREE.Quaternion(), new THREE.Vector3(d[o + 3], d[o + 4], d[o + 5]));
      m.setMatrixAt(i, M); m.setColorAt(i, col.setRGB(d[o + 6], d[o + 7], d[o + 8]));
    }
    m.count = this.count; m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false;
    return m;
  }
}

/** Các khối phát sáng nhấp nháy (đèn LED, màn hình) — 1 InstancedMesh, đổi màu mỗi frame. */
export class Glow {
  private it: { x: number; y: number; z: number; s: number; c: THREE.Color; ph: number; sp: number; mn: number }[] = [];
  mesh!: THREE.InstancedMesh;
  add(x: number, y: number, z: number, s: number, color: number, speed = 0, phase = 0, min = 0.35) { this.it.push({ x, y, z, s, c: new THREE.Color(color), ph: phase, sp: speed, mn: min }); }
  build() {
    this.mesh = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, this.it.length));
    const M = new THREE.Matrix4();
    this.it.forEach((g, i) => { M.makeScale(g.s, g.s, g.s).setPosition(g.x, g.y, g.z); this.mesh.setMatrixAt(i, M); this.mesh.setColorAt(i, g.c); });
    this.mesh.count = this.it.length; this.mesh.frustumCulled = false; return this.mesh;
  }
  update(t: number) {
    const c = new THREE.Color();
    this.it.forEach((g, i) => {
      const k = g.sp ? g.mn + (1 - g.mn) * (0.5 + 0.5 * Math.sin(t * g.sp + g.ph)) : 1;
      this.mesh.setColorAt(i, c.copy(g.c).multiplyScalar(k));
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
