import * as THREE from "three";
import { wallMeshes } from "./map";
import { me } from "./characters";
import { VIS } from "../config";

const ray = new THREE.Raycaster();
/** Fog of war: thấy được nếu trong tầm, trong nón nhìn (~170°) hoặc rất gần, và không bị tường chắn. */
export function canSee(o: { x: number; z: number }) {
  const m = me(), dx = o.x - m.x, dz = o.z - m.z, L = Math.hypot(dx, dz);
  if (L > VIS) return false;
  const diff = Math.abs(((Math.atan2(dx, dz) - m.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  if (L > 3 && diff > 1.5) return false;
  ray.set(new THREE.Vector3(m.x, 1, m.z), new THREE.Vector3(dx, 0, dz).normalize());
  ray.far = L;
  return ray.intersectObjects(wallMeshes).length === 0;
}
