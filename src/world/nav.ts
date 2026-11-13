import { H, NG, STEP, CAMP, groundAt, walkable, slopeAt, PADS, STATION_XZ, VENT_XZ, HUT_XZ, HAMMOCK_XZ, RUINS_XZ, WRECK_XZ, VOLCANO_XZ, BEACH_XZ, DOCK, PONDS } from "./island";
import { WALLS } from "./map";
import { hash } from "./noise";

/**
 * Tìm đường cho Bot trên địa hình dốc (A* trên lưới ô 1m).
 * Một ô đi được nếu là đất liền (không phải biển/ao), không dính vật cản (WALLS nở ra bằng bán kính thân), và hai ô kề nhau chênh lệch ≤ STEP (1 khối).
 * Lưới được dựng LƯỜI ở lần gọi đầu tiên (sau khi map.ts + terrain.ts đã đăng ký xong mọi vật cản).
 */
const W = NG * 2;
let blocked: Uint8Array | null = null, reach: Uint8Array | null = null;
const idx = (ix: number, iz: number) => (ix + NG) * W + iz + NG;
const inGrid = (ix: number, iz: number) => ix >= -NG && ix < NG && iz >= -NG && iz < NG;

function build() {
  blocked = new Uint8Array(W * W);
  for (let ix = -NG; ix < NG; ix++) for (let iz = -NG; iz < NG; iz++) if (!walkable(ix + 0.5, iz + 0.5)) blocked[idx(ix, iz)] = 1;
  for (const [cx, cz, w, d] of WALLS) {
    const hx = w / 2 + 0.55, hz = d / 2 + 0.55;
    for (let ix = Math.floor(cx - hx); ix <= Math.ceil(cx + hx); ix++) for (let iz = Math.floor(cz - hz); iz <= Math.ceil(cz + hz); iz++)
      if (inGrid(ix, iz) && Math.abs(ix + 0.5 - cx) < hx && Math.abs(iz + 0.5 - cz) < hz) blocked[idx(ix, iz)] = 1;
  }
  // vùng đi tới được từ đống lửa
  reach = new Uint8Array(W * W);
  const s = nearestOpen(0, 4.5); if (!s) return;
  const q: number[] = [s[0], s[1]]; reach[idx(s[0], s[1])] = 1;
  for (let qi = 0; qi < q.length; qi += 2) {
    const x = q[qi], z = q[qi + 1];
    for (const [dx, dz] of N4) { const nx = x + dx, nz = z + dz; if (!inGrid(nx, nz) || reach[idx(nx, nz)] || !edgeOK(x, z, nx, nz)) continue; reach[idx(nx, nz)] = 1; q.push(nx, nz); }
  }
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const gAt = (ix: number, iz: number) => groundAt(ix + 0.5, iz + 0.5);
const open = (ix: number, iz: number) => inGrid(ix, iz) && !blocked![idx(ix, iz)];
const edgeOK = (x: number, z: number, nx: number, nz: number) => open(nx, nz) && Math.abs(gAt(nx, nz) - gAt(x, z)) <= STEP;

/** Ô trống gần (x, z) nhất (tìm trong bán kính 6). */
function nearestOpen(x: number, z: number): [number, number] | null {
  if (!blocked) build();
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let r = 0; r <= 6; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    if (open(cx + dx, cz + dz)) return [cx + dx, cz + dz];
  }
  return null;
}
/** Điểm (x, z) có nằm trong vùng đi bộ nối với đống lửa không. */
export function reachable(x: number, z: number) { if (!reach) build(); const ix = Math.floor(x), iz = Math.floor(z); return inGrid(ix, iz) && reach![idx(ix, iz)] === 1; }

/* ── A* với heap nhị phân ── */
const g = new Float32Array(W * W), from = new Int32Array(W * W), stamp = new Int32Array(W * W), closed = new Int32Array(W * W);
let run = 0;
export function findPath(x0: number, z0: number, x1: number, z1: number): [number, number][] {
  if (!blocked) build();
  const a = nearestOpen(x0, z0), b = nearestOpen(x1, z1); if (!a || !b) return [];
  run++;
  const heap: number[] = [], f: Record<number, number> = {};
  const push = (k: number, fv: number) => { f[k] = fv; heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hh = (ix: number, iz: number) => { const dx = Math.abs(ix - b[0]), dz = Math.abs(iz - b[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const sk = idx(a[0], a[1]), gk = idx(b[0], b[1]);
  g[sk] = 0; stamp[sk] = run; from[sk] = -1; push(sk, hh(a[0], a[1]));
  let it = 0;
  while (heap.length && it++ < 60000) {
    const k = pop(); if (closed[k] === run) continue; closed[k] = run;
    if (k === gk) break;
    const ix = ((k / W) | 0) - NG, iz = (k % W) - NG;
    for (const [dx, dz] of N8) {
      const nx = ix + dx, nz = iz + dz; if (!edgeOK(ix, iz, nx, nz)) continue;
      if (dx && dz && (!edgeOK(ix, iz, ix + dx, iz) || !edgeOK(ix, iz, ix, iz + dz))) continue;          // không cắt góc
      const nk = idx(nx, nz), ng = g[k] + (dx && dz ? 1.414 : 1) + Math.abs(gAt(nx, nz) - gAt(ix, iz)) * 0.3;
      if (stamp[nk] === run && ng >= g[nk]) continue;
      stamp[nk] = run; g[nk] = ng; from[nk] = k; push(nk, ng + hh(nx, nz));
    }
  }
  if (stamp[gk] !== run) return [];
  const path: [number, number][] = [];
  for (let k = gk; k !== -1; k = from[k]) path.push([((k / W) | 0) - NG + 0.5, (k % W) - NG + 0.5]);
  path.reverse();
  return smoothPath(path);
}
/** Đường thẳng giữa hai điểm có đi được không (không vướng ô chặn, không có bậc > STEP). */
function lineClear(ax: number, az: number, bx: number, bz: number) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.4);
  let px = Math.floor(ax), pz = Math.floor(az);
  for (let i = 1; i <= n; i++) {
    const x = Math.floor(ax + ((bx - ax) * i) / n), z = Math.floor(az + ((bz - az) * i) / n);
    if (x === px && z === pz) continue;
    if (!edgeOK(px, pz, x, z)) return false;
    if (x !== px && z !== pz && (!edgeOK(px, pz, x, pz) || !edgeOK(px, pz, px, z))) return false;
    px = x; pz = z;
  }
  return true;
}
function smoothPath(p: [number, number][]) {
  if (p.length < 3) return p;
  const out: [number, number][] = [p[0]]; let i = 0;
  while (i < p.length - 1) { let j = p.length - 1; while (j > i + 1 && !lineClear(p[i][0], p[i][1], p[j][0], p[j][1])) j--; out.push(p[j]); i = j; }
  return out;
}

/** Điểm ngẫu nhiên trên đất dễ đi (đồng cỏ), nối được với đống lửa. */
export function randomNavPoint(): [number, number] {
  if (!reach) build();
  for (let tries = 0; tries < 400; tries++) {
    const x = (Math.random() * 2 - 1) * 58, z = (Math.random() * 2 - 1) * 58, ix = Math.floor(x), iz = Math.floor(z);
    if (reachable(x, z) && H(ix, iz) >= 3 && H(ix, iz) <= 24 && slopeAt(ix, iz) <= 1) return [x, z];
  }
  return [0, 6];
}

/** Điểm tuần tra của Bot: quanh các công trình + một số điểm rải khắp đồng cỏ. */
let WP: [number, number][] | null = null;
export function waypoints() {
  if (WP) return WP;
  const raw: [number, number][] = [];
  const near = (x: number, z: number, r = 3): [number, number] => { const a = Math.atan2(CAMP[1] - z, CAMP[0] - x); return [x + Math.cos(a) * r, z + Math.sin(a) * r]; };   // đứng phía hướng về lửa trại
  for (const [x, z] of STATION_XZ) raw.push(near(x, z, 2.6));
  for (const [x, z] of VENT_XZ) raw.push(near(x, z, 2.4));
  for (const [x, z] of HUT_XZ) raw.push([x + 3.4, z + 1]);
  raw.push(near(...HAMMOCK_XZ, 3), near(...RUINS_XZ, 4), near(...WRECK_XZ, 5), near(...VOLCANO_XZ, 5), [BEACH_XZ[0], BEACH_XZ[1] - 3], [DOCK.x, DOCK.z0 + 5], [DOCK.x, DOCK.z1 - 3]);
  for (const o of PONDS) raw.push([o.x + o.r + 2.2, o.z]);
  for (const p of PADS) if (!p.pond && Math.hypot(p.x, p.z) < 14) raw.push([p.x + p.r, p.z]);
  for (let i = 0; i < 24; i++) { const x = (hash(i, 31) - 0.5) * 112, z = (hash(i, 37) - 0.5) * 112, ix = Math.floor(x), iz = Math.floor(z); if (H(ix, iz) >= 3 && slopeAt(ix, iz) <= 1) raw.push([x, z]); }
  WP = raw.filter(([x, z]) => reachable(x, z) && open(Math.floor(x), Math.floor(z)));
  if (!WP.length) WP = [[0, 8]];
  return WP;
}
