import * as THREE from "three";
import { renderer } from "../world/scene";
import { buildSoldier, defOf } from "../world/soldier";
import { COLORS, SQUAD } from "../config";

/**
 * Ảnh đại diện (chân dung đầu + vai) của từng người lính, dùng ở bảng họp.
 * Mỗi người được dựng lại bằng đúng mô hình voxel (soldier.ts) trong một cảnh riêng nhỏ (nền màu theo băng tay nhận diện), chụp một lần rồi lưu lại.
 * Người đã chết / bị loại: quân phục xám, mặt biểu cảm chết, nền xám.
 */
const S = 128;
const cache = new Map<string, string>();
let rt: THREE.WebGLRenderTarget | null = null;

export function avatarOf(i: number, dead = false): string {
  const k = `${i}:${dead ? 1 : 0}`;
  let u = cache.get(k);
  if (u === undefined) { u = render(i, dead); cache.set(k, u); }
  return u;   // "" nếu không chụp được -> bảng họp quay về chấm màu
}

function render(i: number, dead: boolean): string {
  const prev = renderer.getRenderTarget();
  try {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const { g, head, face } = buildSoldier(defOf(SQUAD[i]), mat, COLORS[i]);
    if (dead) { mat.color.setHex(0x8a8a8a); face?.(2); }
    const sc = new THREE.Scene();
    sc.background = dead ? new THREE.Color(0x2b2e36) : new THREE.Color(COLORS[i]).multiplyScalar(0.4);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8f9bb0, 1.5));
    const key = new THREE.DirectionalLight(0xfff3e0, 2.0); key.position.set(2, 3, 5); sc.add(key, g);
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(head), c = bb.getCenter(new THREE.Vector3()), hs = Math.max(bb.getSize(new THREE.Vector3()).y, 1e-3);
    const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 50), d = hs * 6.2, a = 0.35;
    cam.position.set(c.x + Math.sin(a) * d, c.y + hs * 0.15, c.z + Math.cos(a) * d);   // mặt nhìn về +Z: máy đứng trước, lệch nhẹ cho có chiều sâu
    cam.lookAt(c.x, c.y - hs * 0.35, c.z); cam.updateMatrixWorld();                    // hạ điểm nhìn một chút để lấy cả cổ + vai
    rt ??= new THREE.WebGLRenderTarget(S, S, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(rt); renderer.render(sc, cam);
    const buf = new Uint8Array(S * S * 4); renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
    const cv = document.createElement("canvas"); cv.width = cv.height = S;
    const cx = cv.getContext("2d")!, img = cx.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);   // lật dọc (WebGL đọc từ dưới lên)
    cx.putImageData(img, 0, 0);
    sc.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
    mat.dispose();
    return cv.toDataURL("image/png");
  } catch { return ""; }
  finally { renderer.setRenderTarget(prev); }
}
