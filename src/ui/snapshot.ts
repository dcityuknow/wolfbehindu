import * as THREE from "three";
import { renderer, scene } from "../world/scene";
import { entities, bodies } from "../world/characters";
import { G } from "../state";
import { groundAt, losBlocked } from "../world/island";
import { wallMeshes } from "../world/map";

/** Ảnh chụp từng nhân vật (kèm phông nền thật của hòn đảo) tại đúng thời điểm ván kết thúc — dùng cho các thẻ "mở khoá vai trò". */
export let SNAPS: string[] = [];
const W = 720, H = 800;   // gần vuông (thẻ xếp 2 hàng ≈ 0,9:1), độ phân giải cao để phóng to vẫn nét
const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 700), _t = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), ray = new THREE.Raycaster();
const AZ = [0.95, -0.95, 0.6, -0.6, 1.4, -1.4, 0.25, -0.25, 2.0, -2.0, Math.PI];   // góc lệch so với hướng mặt: nhìn NGHIÊNG trước (thấy súng nằm gọn trong tay, không bị chĩa thẳng vào ống kính)

/** Đặt máy ảnh quanh nhân vật t: thử lần lượt (xa → gần, thấp → cao, nhiều góc) tới khi máy nằm trên mặt đất và không bị đồi / tường chắn giữa máy và người. */
function placeCam(t: THREE.Vector3, rot: number, lying: boolean) {
  const baseEl = lying ? 1.6 : 0.35, baseD = lying ? 3.4 : 4.2;
  for (const dm of [1, 0.7, 0.5]) for (const lift of [0, 0.8, 1.8, 3.2]) for (const az of AZ) {
    const a = rot + az, d = baseD * dm, cx = t.x + Math.sin(a) * d, cz = t.z + Math.cos(a) * d, cy = t.y + baseEl + lift;
    if (cy < groundAt(cx, cz) + 0.6 || losBlocked(cx, cy, cz, t.x, t.y, t.z)) continue;
    _c.set(cx, cy, cz); _d.copy(t).sub(_c); const L = _d.length(); ray.set(_c, _d.divideScalar(L)); ray.far = L;
    if (ray.intersectObjects(wallMeshes, false).length) continue;
    cam.position.copy(_c); return;
  }
  cam.position.set(t.x + 0.01, t.y + 6, t.z + 0.01);   // bất đắc dĩ: nhìn từ trên xuống
}

/** Chụp cả 7 nhân vật NGAY LẬP TỨC (gọi đồng bộ ở đầu mỗi kết cục, trước khi cảnh thay đổi). Mỗi người: camera đứng trước mặt, nhìn từ ngực, nền là đảo + trời tại chỗ họ đứng. */
export function captureCrew() {
  SNAPS = [];
  let rt: THREE.WebGLRenderTarget | null = null; const prev = renderer.getRenderTarget();
  try {
    rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const buf = new Uint8Array(W * H * 4), cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const cx = cv.getContext("2d")!, img = cx.createImageData(W, H);
    for (const e of entities) {
      const own = e.i === G.slot ? bodies.find((b) => b.own) : undefined;   // chính mình đã chết: chụp cái xác nằm đó, không chụp mô hình đứng
      const g = own ? own.g : e.g, u = g.userData, tag = u.tag as THREE.Object3D, alert = u.alert as THREE.Object3D, mats = u.mats as THREE.MeshStandardMaterial[];
      const vis = [g.visible, tag.visible, alert.visible], mm = mats.map((m) => [m.transparent, m.opacity] as const);
      g.visible = true; tag.visible = false; alert.visible = false; mats.forEach((m) => { m.transparent = false; m.opacity = 1; });   // cả người ngoài tầm nhìn / hồn ma đều hiện rõ
      g.updateMatrixWorld(true);
      const lying = e.dead || !!own;
      const selfHid = own ? e.g.visible : false; if (own) e.g.visible = false;
      _t.set(g.position.x, g.position.y + (lying ? 0.3 : 0.95), g.position.z);
      placeCam(_t, g.rotation.y, lying); cam.lookAt(_t); cam.updateMatrixWorld();
      renderer.setRenderTarget(rt); renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // lật dọc (WebGL đọc từ dưới lên)
      cx.putImageData(img, 0, 0); SNAPS.push(cv.toDataURL("image/jpeg", 0.88));
      if (own) e.g.visible = selfHid;
      g.visible = vis[0]; tag.visible = vis[1]; alert.visible = vis[2]; mats.forEach((m, i) => { m.transparent = mm[i][0]; m.opacity = mm[i][1]; });
    }
  } catch { SNAPS = []; }
  finally { renderer.setRenderTarget(prev); rt?.dispose(); }
}
