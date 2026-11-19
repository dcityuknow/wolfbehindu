import * as THREE from "three";
import { wallMeshes, TRUNKS } from "./map";
import { me } from "./characters";
import { losBlocked } from "./island";

const ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

/** Thân cây có chắn đoạn nhìn (ax,ay,az)→(bx,by,bz) không? Đoạn thẳng 2D vs hình tròn thân cây, rồi kiểm tra độ cao tia tại đó thấp hơn ngọn. */
function trunkBlocks(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; if (L2 < 1) return false;
  const minX = Math.min(ax, bx) - 1, maxX = Math.max(ax, bx) + 1, minZ = Math.min(az, bz) - 1, maxZ = Math.max(az, bz) + 1;
  for (const [x, z, r, top] of TRUNKS) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const u = Math.max(0.02, Math.min(0.98, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * u - x, pz = az + dz * u - z;
    if (px * px + pz * pz < r * r && ay + (by - ay) * u < top) return true;
  }
  return false;
}

/**
 * Tầm nhìn THẬT: thấy người khác ở BẤT KỲ khoảng cách nào (kể cả cách xa hàng trăm mét) — chỉ khi bị che khuất mới không thấy:
 * đồi / núi / vách đá (địa hình), nhà · đá · bụi rậm (vật cản đặc), thân cây. Không còn giới hạn tầm nhìn cố định hay "nón nhìn" nhân tạo:
 * ai nằm ngoài khung hình thì tự khuất khỏi màn hình theo camera, còn trong khung hình mà không bị che thì luôn thấy.
 */
export function canSee(o: { x: number; z: number }) {
  const m = me(), dx = o.x - m.x, dz = o.z - m.z, L = Math.hypot(dx, dz);
  if (L < 0.01) return true;
  const ey = m.y + 1.6, ty = ((o as { y?: number }).y ?? m.y) + 1.4;
  if (losBlocked(m.x, ey, m.z, o.x, ty, o.z)) return false;   // đồi/núi chắn tầm nhìn
  if (trunkBlocks(m.x, ey, m.z, o.x, ty, o.z)) return false;   // thân cây chắn tầm nhìn
  _o.set(m.x, m.y + 1, m.z); _d.set(dx, 0, dz).normalize(); ray.set(_o, _d); ray.far = L;
  return ray.intersectObjects(wallMeshes).length === 0;
}
