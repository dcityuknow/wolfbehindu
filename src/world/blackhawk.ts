import * as THREE from "three";

/**
 * Trực thăng Sikorsky MH-60 Black Hawk dựng bằng VOXEL (ô 0.15 m) theo ảnh minh họa — sinh bằng code lúc khởi động:
 *  thân bo tròn (siêu-elip) · camo olive/xanh rêu/be theo nhiễu 3D · kính buồng lái + cửa sổ · cửa hông khoét + cửa trượt · hai động cơ + cửa hút gió + ống xả ·
 *  trụ rotor + moay-ơ + 4 cánh sọc · thân đuôi dài + vây đứng + cánh quạt đuôi + cánh ổn định · bánh đáp · tháp cảm biến · súng máy cửa hông ·
 *  chữ "US ARMY" + sao tròn dán lên thân · đổ bóng AO từng đỉnh (nhìn ra khối như ảnh voxel).
 * Toạ độ cục bộ: mũi = -z, đuôi = +z, sàn khoang y = 0, x + = bên phải phi công. Khoang trong: |x| < 1.9, z -7..7, y 0..3.0 (cine3d.ts đặt ghế/đèn bên trong).
 */
export interface BHMats { tipR: THREE.Material; tipG: THREE.Material }
export interface BH { body: THREE.Group; doors: THREE.Group[]; rotorMain: THREE.Group; rotorTail: THREE.Group }

const VS = 0.15, X0 = -4.2, Y0 = -2.7, Z0 = -13.5, NX = 56, NY = 70, NZ = 256;

/* ───────────── nhiễu + bảng màu ───────────── */
const h3 = (i: number, j: number, k: number) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const sm = (t: number) => t * t * (3 - 2 * t);
const vn = (x: number, y: number, z: number) => {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = sm(x - i), fy = sm(y - j), fz = sm(z - k);
  const a = (p: number, q: number) => h3(i + p, j + q, k) * (1 - fz) + h3(i + p, j + q, k + 1) * fz;
  const b = (p: number) => a(p, 0) * (1 - fy) + a(p, 1) * fy;
  return b(0) * (1 - fx) + b(1) * fx;
};
const pal = new Map<number, [number, number, number]>();
const rgb = (hex: number): [number, number, number] => { let c = pal.get(hex); if (!c) { const t = new THREE.Color(hex); c = [t.r, t.g, t.b]; pal.set(hex, c); } return c; };

/* vật liệu ô: 1 vỏ camo · 2 kim loại tối · 3 kính · 4 đen · 5 xám · 6 trắng · 8 đỏ · 9 ống xả · 10 viền cửa · 11 lưới hút gió */
const CAMO_BASE = 0x56613a, CAMO_DARK = 0x38442a, CAMO_LIGHT = 0x687441, CAMO_TAN = 0x7d7048, INK = 0x14150f;

/* chữ 5x7 để dán "US ARMY" */
const GL: Record<string, string[]> = {
  U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."], S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"], R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
  M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"], Y: ["X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."], " ": ["...", "...", "...", "...", "...", "...", "..."],
};
const TXT: boolean[][] = (() => { const rows: boolean[][] = [[], [], [], [], [], [], []]; for (const ch of "US ARMY") { const g = GL[ch]; for (let r = 0; r < 7; r++) { for (const c of g[r]) rows[r].push(c === "X"); rows[r].push(false); } } return rows; })();
const STAR = ["...X...", "...X...", "XXXXXXX", ".XXXXX.", "..XXX..", ".XX.XX.", "XX...XX"];

/* ───────────── hình dạng thân ───────────── */
/** Mặt cắt thân theo z: [z, nửa rộng, đáy, đỉnh]. */
const PF: number[][] = [
  [-12.9, 0.25, 0.35, 0.95], [-12.4, 0.75, 0.15, 1.45], [-11.6, 1.25, -0.15, 1.95], [-10.6, 1.65, -0.3, 2.55], [-9.6, 1.9, -0.35, 3.15], [-8.4, 2.05, -0.35, 3.3],
  [-7.1, 2.1, -0.35, 3.3], [7.0, 2.1, -0.35, 3.3], [8.6, 1.95, 0.0, 3.3], [10.0, 1.45, 0.85, 3.45], [11.6, 0.98, 1.45, 3.58], [13, 0.8, 1.75, 3.6], [19, 0.5, 2.0, 3.45], [22, 0.38, 2.2, 3.5],
];
const prof = (z: number): [number, number, number] | null => {
  if (z < PF[0][0] || z > PF[PF.length - 1][0]) return null;
  for (let q = 0; q < PF.length - 1; q++) { const a = PF[q], b = PF[q + 1]; if (z <= b[0]) { const t = (z - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; } }
  return null;
};
const sup = (a: number, b: number, n: number) => Math.pow(Math.abs(a), n) + Math.pow(Math.abs(b), n);
/** Trong khoang (rỗng): |x| < 1.9, y 0..3.0, z -7..7, góc bo tròn. */
const inCav = (x: number, y: number, z: number) => z >= -7 && z <= 7 && y >= 0 && sup(x / 1.9, (y - 1.5) / 1.5, 4) <= 1;
const inDoorHole = (x: number, y: number, z: number) => Math.abs(x) > 1.5 && y >= 0.3 && y <= 2.7 && z >= 0.5 && z <= 4.5;

/* ───────────── lưới voxel → mesh (cắt mặt kề + AO) ───────────── */
type ColFn = (m: number, wx: number, wy: number, wz: number, nx: number, ny: number, nz: number, inward: boolean) => [number, number, number];
const DIRS = [[1, 0, 0, 0, 1, 0, 0, 0, 1], [-1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 1, 0, 0, 0, 1, 1, 0, 0], [0, -1, 0, 0, 0, 1, 1, 0, 0], [0, 0, 1, 1, 0, 0, 0, 1, 0], [0, 0, -1, 1, 0, 0, 0, 1, 0]];
const AOB = [0.5, 0.68, 0.86, 1];
function meshOf(M: Uint8Array, nx: number, ny: number, nz: number, ox: number, oy: number, oz: number, col: ColFn, inward: (wx: number, wy: number, wz: number, nx: number, ny: number, nz: number) => boolean, mat: THREE.Material) {
  const at = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? 0 : M[(j * nz + k) * nx + i]);
  const pos: number[] = [], cl: number[] = [], nr: number[] = [], ix: number[] = []; let vc = 0;
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const m = M[(j * nz + k) * nx + i]; if (!m) continue;
    const cx = ox + (i + 0.5) * VS, cy = oy + (j + 0.5) * VS, cz = oz + (k + 0.5) * VS;
    for (const D of DIRS) {
      const [dx, dy, dz, ux, uy, uz, vx, vy, vz] = D;
      if (at(i + dx, j + dy, k + dz)) continue;
      const c = col(m, cx, cy, cz, dx, dy, dz, inward(cx + dx * VS, cy + dy * VS, cz + dz * VS, dx, dy, dz));
      const ao: number[] = [], cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const [su, sv] of cs) {
        const s1 = at(i + dx + ux * su, j + dy + uy * su, k + dz + uz * su) ? 1 : 0, s2 = at(i + dx + vx * sv, j + dy + vy * sv, k + dz + vz * sv) ? 1 : 0, cn = at(i + dx + ux * su + vx * sv, j + dy + uy * su + vy * sv, k + dz + uz * su + vz * sv) ? 1 : 0;
        ao.push(s1 && s2 ? 0 : 3 - (s1 + s2 + cn));
      }
      const cr = (uy * vz - uz * vy) * dx + (uz * vx - ux * vz) * dy + (ux * vy - uy * vx) * dz;   // hướng quấn mặt
      for (let q = 0; q < 4; q++) {
        const [su, sv] = cs[q], b = AOB[ao[q]];
        pos.push(cx + dx * VS * 0.5 + ux * su * VS * 0.5 + vx * sv * VS * 0.5, cy + dy * VS * 0.5 + uy * su * VS * 0.5 + vy * sv * VS * 0.5, cz + dz * VS * 0.5 + uz * su * VS * 0.5 + vz * sv * VS * 0.5);
        cl.push(c[0] * b, c[1] * b, c[2] * b); nr.push(dx, dy, dz);
      }
      const flip = ao[0] + ao[2] < ao[1] + ao[3];
      const t = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
      if (cr > 0) for (const q of t) ix.push(vc + q); else for (let q = t.length - 1; q >= 0; q--) ix.push(vc + t[q]);
      vc += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nr, 3)); g.setIndex(ix);
  return new THREE.Mesh(g, mat);
}

/* ───────────── sơn vỏ: camo, đường ghép, chữ, sao ───────────── */
const hullCol: ColFn = (m, x, y, z, nx, ny, nz, inward) => {
  if (inward) { const f = ny > 0 ? 0x2a3326 : ny < 0 ? 0x2c3426 : 0x3a4430; const j = 0.94 + 0.12 * h3(Math.floor(x / VS), Math.floor(y / VS), Math.floor(z / VS)); const c = rgb(f); return [c[0] * j, c[1] * j, c[2] * j]; }
  const jit = 0.95 + 0.1 * h3(Math.floor(x / VS), Math.floor(y / VS), Math.floor(z / VS));
  let hex: number;
  switch (m) {
    case 2: hex = 0x363a3e; break;
    case 3: { const g = Math.max(0, Math.min(1, (y - 1) / 2)); hex = ((0x16 + Math.round(g * 0x1c)) << 16) | ((0x24 + Math.round(g * 0x26)) << 8) | (0x38 + Math.round(g * 0x2a)); break; }
    case 4: hex = 0x121316; break;
    case 5: hex = 0x7c8084; break;
    case 6: hex = 0xdcdccf; break;
    case 8: hex = 0xc42a22; break;
    case 9: { const g = Math.max(0, Math.min(1, (z - 1.7) / 1.2)); hex = ((0x6a - Math.round(g * 0x40)) << 16) | ((0x62 - Math.round(g * 0x40)) << 8) | (0x5c - Math.round(g * 0x3c)); break; }
    case 10: hex = 0x2b3320; break;
    case 11: hex = (Math.floor(y / VS) & 1) ? 0x0c0d0e : 0x34383c; break;
    default: {
      const s = vn(x * 0.55, y * 0.55, z * 0.35) * 0.65 + vn(x * 1.4 + 7, y * 1.4, z * 1.1) * 0.35;
      hex = s < 0.4 ? CAMO_DARK : s > 0.63 ? CAMO_LIGHT : CAMO_BASE;
      if (vn(x * 0.42 + 13, y * 0.42, z * 0.3 + 5) > 0.8) hex = CAMO_TAN;
      if (ny < 0) hex = 0x3b4230;   // bụng tối
      // chữ US ARMY + sao tròn (chỉ ở mặt hông)
      if (nx !== 0) {
        const side = nx > 0 ? 1 : -1;
        if (z > 10.2 && z < 17.4 && y > 2.2 && y < 3.4) { const c = Math.floor(side > 0 ? (16.9 - z) / VS : (z - 10.4) / VS), r = Math.floor((3.35 - y) / VS); if (r >= 0 && r < 7 && c >= 0 && c < TXT[0].length && TXT[r][c]) hex = INK; }
        if (z > 7.6 && z < 8.95 && y > 1.5 && y < 2.8) {
          const c = Math.floor((z - 7.75) / VS), r = Math.floor((2.7 - y) / VS), d = Math.hypot(z - 8.3, y - 2.15);
          if (d < 0.62) hex = r >= 0 && r < 7 && c >= 0 && c < 7 && STAR[r][c] === "X" ? 0xeeeeee : 0x24407a;
        }
        // đường ghép tấm vỏ
        if (((z + 0.05) % 3.0 + 3) % 3 < 0.07 || Math.abs(y - 2.6) < 0.06) { const c = rgb(hex); const k = 0.76 * jit; return [c[0] * k, c[1] * k, c[2] * k]; }
      }
    }
  }
  const c = rgb(hex); return [c[0] * jit, c[1] * jit, c[2] * jit];
};

/* ───────────── dựng ───────────── */
export function buildBlackHawk(mats: BHMats): BH {
  const M = new Uint8Array(NX * NY * NZ);
  const ci = (v: number, o: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor((v - o) / VS)));
  const each = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, f: (x: number, y: number, z: number, c: number) => number) => {
    for (let j = ci(y0, Y0, NY); j <= ci(y1, Y0, NY); j++) for (let k = ci(z0, Z0, NZ); k <= ci(z1, Z0, NZ); k++) for (let i = ci(x0, X0, NX); i <= ci(x1, X0, NX); i++) {
      const id = (j * NZ + k) * NX + i, r = f(X0 + (i + 0.5) * VS, Y0 + (j + 0.5) * VS, Z0 + (k + 0.5) * VS, M[id]); if (r >= 0) M[id] = r;
    }
  };
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: number) => each(x0, x1, y0, y1, z0, z1, (x, y, z) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 ? m : -1));
  const ell = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, m: number) => each(cx - rx, cx + rx, cy - ry, cy + ry, cz - rz, cz + rz, (x, y, z) => (Math.pow(Math.abs(x - cx) / rx, n) + Math.pow(Math.abs(y - cy) / ry, n) + Math.pow(Math.abs(z - cz) / rz, n) <= 1 ? m : -1));

  // 1) thân chính: siêu-elip theo mặt cắt, khoét khoang rỗng + hai ô cửa hông
  each(-2.3, 2.3, -0.5, 3.8, -13, 22.2, (x, y, z) => {
    const p = prof(z); if (!p) return -1;
    const [w, yb, yt] = p, yc = (yb + yt) / 2, h = (yt - yb) / 2;
    if (sup(x / w, (y - yc) / h, z > 8.5 ? 3 : 4) > 1) return -1;
    if (inCav(x, y, z) || inDoorHole(x, y, z)) return 0;
    return 1;
  });
  // viền cửa hông sơn tối
  each(-2.4, 2.4, 0.1, 2.9, 0.3, 4.7, (x, y, z, c) => (c === 1 && Math.abs(x) > 1.5 && y >= 0.15 && y <= 2.85 && z >= 0.35 && z <= 4.65 ? 10 : -1));
  // kính: cửa sổ cabin, kính chắn gió, cửa sổ buồng lái
  const WIN = [[-6.4, -5.0], [-4.5, -3.1], [-2.6, -1.2], [-0.55, 0.3], [5.0, 6.4]];
  each(-2.4, 2.4, 0, 3.6, -12, 7, (x, y, z, c) => {
    if (c !== 1) return -1; const p = prof(z); if (!p) return -1;
    if (Math.abs(x) > 1.9 && y >= 1.2 && y <= 2.0 && WIN.some((q) => z >= q[0] && z <= q[1])) return 3;
    if (z >= -11.6 && z <= -9.55 && y > p[2] - 1.1 && Math.abs(x) < p[0] * 0.86) return 3;
    if (z >= -10.4 && z <= -7.3 && Math.abs(x) > p[0] - 0.3 && y >= 1.7 && y <= 2.95) return 3;
    if (z >= -12.1 && z <= -11.0 && y < 1.0 && y > 0.0 && Math.abs(x) > 0.2 && Math.abs(x) < 0.9) return 3;   // kính chân (chin window)
    return -1;
  });
  // 2) động cơ + hộp số + trụ rotor + cửa hút gió + ống xả
  for (const sx of [-1, 1]) {
    ell(sx * 1.1, 4.1, -2.1, 0.85, 1.0, 3.9, 3.0, 1); box(sx * 1.1 - 0.6, sx * 1.1 + 0.6, 4.7, 4.95, -4.4, 0.2, 1);
    each(sx * 1.1 - 0.8, sx * 1.1 + 0.8, 3.2, 4.9, -6.2, -5.3, (x, y, z, c) => (c === 1 && z < -5.45 ? 11 : -1));   // lưới hút gió
    box(sx * 1.15 - 0.3, sx * 1.15 + 0.3, 3.8, 4.4, 1.6, 2.9, 9);                                                    // ống xả
    box(sx * 1.4 - 0.2, sx * 1.4 + 0.2, 3.95, 4.3, 2.8, 3.4, 9);
    box(sx * 0.2 + sx * 1.6 - 0.04, sx * 0.2 + sx * 1.6 + 0.04, 3.3, 3.9, 2.2, 2.9, 2);   // thanh chống ống xả
  }
  ell(0, 3.7, -1.5, 1.35, 1.0, 3.5, 3.5, 1);
  each(-0.6, 0.6, 4.4, 6.3, -2.1, -0.9, (x, y, z) => (Math.hypot(x, z + 1.5) < 0.52 ? 2 : -1));                      // trụ rotor
  each(-0.9, 0.9, 5.4, 5.75, -2.4, -0.6, (x, y, z) => (Math.hypot(x, z + 1.5) < 0.82 ? 5 : -1));                      // vòng swashplate
  // 3) mũi: tháp cảm biến (cầu xám + thấu kính đen), cần cắt dây, ăng-ten
  ell(0, -0.45, -12.15, 0.55, 0.55, 0.55, 2, 5); each(-0.3, 0.3, -0.8, -0.1, -12.9, -12.5, (x, y, z) => (Math.hypot(x, y + 0.45) < 0.26 ? 4 : -1));
  box(-0.075, 0.075, 3.1, 4.1, -9.6, -9.45, 2); box(-0.075, 0.075, -1.0, -0.2, -11.4, -11.25, 2);                     // cần cắt dây (trên + dưới)
  box(0.4, 0.55, 3.2, 3.9, -6.3, -5.9, 2); box(-0.55, -0.4, 3.2, 3.7, 4.4, 4.8, 2);                                   // ăng-ten lưỡi
  box(-0.3, 0.3, 3.5, 4.0, 11.2, 11.8, 5);                                                                            // gây nhiễu hồng ngoại trên thân đuôi
  box(-0.15, 0.15, 3.4, 3.9, 8.8, 9.2, 5);
  // 4) vây đứng + hộp số đuôi + đèn chớp + cánh ổn định
  each(-0.3, 0.3, 2.9, 7.2, 19, 24, (x, y, z) => (Math.abs(x) < 0.23 && y >= 3.0 && y <= 7.1 && z >= 19.6 + 0.55 * (y - 3.0) && z <= 22.3 + 0.35 * (y - 3.0) ? 1 : -1));
  box(-0.62, 0.3, 6.0, 6.9, 22.7, 23.7, 2); box(-0.1, 0.1, 7.1, 7.3, 22.85, 23.05, 8);
  box(-3.5, 3.5, 2.7, 2.85, 19.4, 20.9, 1); box(-3.5, -3.35, 2.65, 2.9, 19.4, 20.9, 8); box(3.35, 3.5, 2.65, 2.9, 19.4, 20.9, 4);
  box(-0.9, 0.9, 2.6, 2.95, 19.6, 20.7, 1);

  const body = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 });
  body.add(meshOf(M, NX, NY, NZ, X0, Y0, Z0, hullCol, (x, y, z) => inCav(x, y, z), hullMat));

  /* ── cửa trượt hai bên (1 lớp voxel, camo khớp với thân) ── */
  const doors: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const dnx = 1, dny = 18, dnz = 27, D = new Uint8Array(dnx * dny * dnz);
    for (let j = 0; j < dny; j++) for (let k = 0; k < dnz; k++) {
      let m = 1; if (j === 0 || j === dny - 1 || k === 0 || k === dnz - 1) m = 10;
      else if (j >= 7 && j <= 14 && k >= 4 && k <= 22 && !((j === 7 || j === 14) && (k === 4 || k === 22))) m = 3;
      else if (j === 5 && k >= 3 && k <= 6) m = 4;   // tay nắm
      D[(j * dnz + k) * dnx] = m;
    }
    const dm = meshOf(D, dnx, dny, dnz, -0.075, 0.15, -2.025, (m, x, y, z, nx2, ny2, nz2, inw) => hullCol(m, sx * 2.17, y, 2.5 + z, nx2 * sx, ny2, nz2, inw), (_x, _y, _z, nx2) => nx2 * sx < 0, hullMat);
    const g = new THREE.Group(); g.position.set(sx * 2.17, 0, 2.5); g.add(dm); body.add(g); doors.push(g);
  }

  /* ── rotor chính ── */
  const metal = new THREE.MeshStandardMaterial({ color: 0x5f646a, roughness: 0.45, metalness: 0.6 }), metalD = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.5 });
  const bladeD = new THREE.MeshStandardMaterial({ color: 0x2b3023, roughness: 0.6, metalness: 0.2 }), bladeW = new THREE.MeshStandardMaterial({ color: 0xe4e2d2, roughness: 0.6, metalness: 0.1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.9 }), gun = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.4, metalness: 0.7 });
  const bx = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); g.add(k); return k; };
  const rotorMain = new THREE.Group(); rotorMain.position.set(0, 6.4, -1.5); body.add(rotorMain);
  bx(rotorMain, 1.5, 0.35, 1.5, 0, 0, 0, metalD); bx(rotorMain, 1.0, 0.18, 1.0, 0, 0.26, 0, metal);
  for (let q = 0; q < 4; q++) {
    const bl = new THREE.Group(); bl.rotation.y = q * Math.PI / 2;
    bx(bl, 1.3, 0.3, 0.5, 1.4, -0.02, 0, metalD); bx(bl, 0.35, 0.34, 0.62, 0.85, 0, 0, metal);
    bx(bl, 6.4, 0.08, 0.92, 5.2, 0.04, 0, bladeD); bx(bl, 6.4, 0.085, 0.14, 5.2, 0.045, 0.39, rubber);   // cánh + mép dẫn tối
    for (let b = 0; b < 4; b++) bx(bl, 0.76, 0.09, 0.92, 8.8 + 0.76 * b, 0.045, 0, b % 2 === 0 ? bladeW : bladeD);
    bl.rotation.x = 0; rotorMain.add(bl);
  }
  { const disc = new THREE.Mesh(new THREE.CircleGeometry(11.8, 48), new THREE.MeshBasicMaterial({ color: 0xa4aa92, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; rotorMain.add(disc); }

  /* ── rotor đuôi (bên trái vây đứng như ảnh) ── */
  const rotorTail = new THREE.Group(); rotorTail.position.set(-0.78, 6.45, 23.2); body.add(rotorTail);
  bx(rotorTail, 0.3, 0.5, 0.5, 0, 0, 0, metalD);
  for (let q = 0; q < 2; q++) { const bl = new THREE.Group(); bl.rotation.x = q * Math.PI / 2 + 0.4; bx(bl, 0.05, 3.5, 0.3, 0, 0, 0, bladeD); bx(bl, 0.06, 0.7, 0.31, 0, 1.4, 0, bladeW); bx(bl, 0.06, 0.7, 0.31, 0, -1.4, 0, bladeW); rotorTail.add(bl); }
  { const d2 = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: 0xa4aa92, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, fog: false })); d2.rotation.y = Math.PI / 2; rotorTail.add(d2); }

  /* ── bánh đáp: chân chính hai bên + bánh đuôi ── */
  const cyl = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => { const d = b.clone().sub(a), len = d.length(), k = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m); k.position.copy(a).addScaledVector(d, 0.5); k.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); body.add(k); };
  const wheel = (x: number, y: number, z: number, r: number, w: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), rubber); t.rotation.z = Math.PI / 2; t.position.set(x, y, z); body.add(t);
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.06, 10), metal); hb.rotation.z = Math.PI / 2; hb.position.set(x, y, z); body.add(hb);
  };
  for (const sx of [-1, 1]) {
    cyl(new THREE.Vector3(sx * 1.95, 0.1, -6.6), new THREE.Vector3(sx * 2.45, -1.4, -6.6), 0.13, metal);   // thanh chống chính
    cyl(new THREE.Vector3(sx * 1.9, -0.2, -5.3), new THREE.Vector3(sx * 2.45, -1.4, -6.55), 0.07, metalD);   // thanh giằng
    cyl(new THREE.Vector3(sx * 2.2, -0.45, -6.6), new THREE.Vector3(sx * 2.45, -1.0, -6.6), 0.2, metalD);   // ống giảm chấn
    wheel(sx * 2.55, -1.45, -6.6, 0.5, 0.4);
  }
  cyl(new THREE.Vector3(0, 2.0, 18.2), new THREE.Vector3(0, -1.5, 18.2), 0.1, metal); cyl(new THREE.Vector3(0.2, 2.0, 17.2), new THREE.Vector3(0, -1.2, 18.2), 0.05, metalD); wheel(0, -1.55, 18.2, 0.36, 0.28);

  /* ── súng máy cửa hông (xoay ra ngoài, như ảnh) ── */
  for (const sx of [-1, 1]) {
    bx(body, 0.12, 0.12, 0.9, sx * 2.35, 1.5, -0.2, metalD); bx(body, 0.5, 0.1, 0.1, sx * 2.1, 1.5, -0.6, metalD);       // cần treo
    const g = new THREE.Group(); g.position.set(sx * 2.7, 1.4, -0.9); g.rotation.set(0.12, sx * 0.25, 0); body.add(g);
    bx(g, 0.34, 0.34, 1.0, 0, 0, 0, gun); bx(g, 0.2, 0.3, 0.4, 0, 0.3, 0.2, metalD); bx(g, 0.18, 0.18, 0.5, 0, -0.26, 0.1, rubber);   // thân + hộp đạn
    for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3; bx(g, 0.05, 0.05, 1.0, Math.cos(a) * 0.1, Math.sin(a) * 0.1, -1.0, gun); }
    bx(g, 0.26, 0.26, 0.08, 0, 0, -1.45, metalD);
  }

  /* ── đèn hiệu (dùng chung vật liệu nhấp nháy của cine3d) ── */
  bx(body, 0.34, 0.2, 0.34, -3.5, 2.66, 20.15, mats.tipR); bx(body, 0.34, 0.2, 0.34, 3.5, 2.66, 20.15, mats.tipG); bx(body, 0.3, 0.3, 0.3, 0, 7.35, 22.95, mats.tipR); bx(body, 0.3, 0.12, 0.3, 0, -0.5, 4.0, mats.tipR);
  return { body, doors, rotorMain, rotorTail };
}
