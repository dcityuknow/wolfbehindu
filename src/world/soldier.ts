import * as THREE from "three";

/**
 * Người lính voxel kiểu Minecraft (chuyển từ character.js tham khảo sang three.js của game).
 * Kích thước tính bằng "điểm ảnh" PX như skin Minecraft: đầu 8x8x8 · thân 8x12x4 · tay 4x12x4 · chân 4x12x4 (cao 32 → ~1.8m).
 * Mỗi nước một quân phục riêng: hoa văn rằn ri, mũ, áo giáp, ba lô, găng, ghệt, cờ trên tay áo.
 * Muốn đổi người / đội hình: sửa mảng CH bên dưới, và SQUAD trong config.ts.
 */
export const PX = 0.056;

/* ───── nhiễu giá trị (không cần thư viện) ───── */
const hb = (a: number, b: number, c: number, s: number) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041) + Math.imul(s | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const sm = (t: number) => t * t * (3 - 2 * t), lp = (a: number, b: number, t: number) => a + (b - a) * t;
function vn(x: number, y: number, z: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi), g = (a: number, b: number, c: number) => hb(xi + a, yi + b, zi + c, s);
  return lp(lp(lp(g(0, 0, 0), g(1, 0, 0), fx), lp(g(0, 1, 0), g(1, 1, 0), fx), fy), lp(lp(g(0, 0, 1), g(1, 0, 1), fx), lp(g(0, 1, 1), g(1, 1, 1), fx), fy), fz);
}
export const shade = (hex: number, f: number) => { const r = Math.min(255, Math.round(((hex >> 16) & 255) * f)), g = Math.min(255, Math.round(((hex >> 8) & 255) * f)), b = Math.min(255, Math.round((hex & 255) * f)); return (r << 16) | (g << 8) | b; };

type Fn = (i: number, j: number, k: number, nx: number, ny: number, nz: number) => number;
/** Hoa văn quân phục. plain = gần trơn · blob = rằn ri mảng mềm · pix = mảng vuông 2x2 (digital). */
function camoFn(pal: number[], kind: string, seed: number, sc = 1): Fn {
  const n = pal.length;
  if (kind === "plain") return (i, j, k) => ((hb(i, j, k, seed) * 0.5 + vn(i / 2.4 / sc, j / 2.4 / sc, k / 2.4 / sc, seed) * 0.5) > 0.8 ? pal[1] : pal[0]);
  return (i, j, k) => {
    let v: number;
    if (kind === "pix") { const a = Math.floor(i / (2 * sc)), b = Math.floor(j / (2 * sc)), c = Math.floor(k / (2 * sc)); v = 0.72 * vn((a * 2) / 3.4, (b * 2) / 3.4, (c * 2) / 3.4, seed) + 0.28 * hb(a, b, c, seed + 9); }
    else v = 0.7 * vn(i / 3.4 / sc, j / 3.4 / sc, k / 3.4 / sc, seed) + 0.3 * vn(i / 1.7 / sc + 5, j / 1.7 / sc, k / 1.7 / sc, seed + 3);
    v = (v - 0.5) * 1.7 + 0.5;
    return pal[Math.max(0, Math.min(n - 1, Math.floor(v * n)))];
  };
}

/* ───── cờ trên tay áo ───── */
const FC: Record<string, number> = { R: 0xd02a2a, B: 0x1d56b8, W: 0xf4f4f4, Y: 0xffd23f, G: 0x1f9a4a, O: 0xff9933, K: 0x222222 };
const FLAG: Record<string, string[]> = {
  vn: ["RRRR", "RYYR", "RYYR", "RRRR"], us: ["BBRR", "BBWW", "RRRR", "WWWW"], ru: ["WWWW", "BBBB", "RRRR"], ng: ["GWWG", "GWWG", "GWWG"], bd: ["GGGG", "GRRG", "GGGG"],
  id: ["RRRR", "WWWW"], in: ["OOOO", "WBBW", "GGGG"], cn: ["RYRR", "RRRR", "RRRR"], ph: ["WBBB", "WYRR", "WRRR"], ua: ["BBBB", "YYYY"], kr: ["WWWW", "WRBW", "WWWW"],
};

/* ───── 11 người lính (k = mã) ───── */
export const CH: any[] = [
  { k: "vn", skin: 0xf0c9a2, hair: 0x15110d, uni: { pal: [0x4c6633, 0x56703a], kind: "plain", seed: 11 }, hat: { kind: "pith", c: 0x62803e, brim: 0x4c6633, badge: "star" }, tabs: 0xd42a2a, boots: 0x2b2b26, belt: 0x3a2f1f, glove: null, vest: null, pack: null },
  { k: "us", skin: 0xf2cdb0, hair: 0x4a3220, uni: { pal: [0x5a4a36, 0xa89874, 0x7b7d52, 0x4f5a34], kind: "blob", seed: 21 }, hat: { kind: "helmet", c: "uni", nvg: true }, vest: 0x8a7a58, pouch: 0x6e6044, pack: 0x6e6a48, glove: 0x2a2a2a, boots: 0x8a6f4a, belt: 0x5a4a32, knee: true },
  { k: "ru", skin: 0xf3d0b8, hair: 0xb98f58, uni: { pal: [0x3b4a2c, 0x6c7a48, 0xb5a672, 0x5a4631], kind: "pix", seed: 31 }, hat: { kind: "ushanka", c: 0x8a868c, badge: "star" }, vest: 0x4a5236, pouch: 0x3a4128, pack: 0x4a5a3a, glove: 0x1f1f1f, boots: 0x2a2420, belt: 0x2f2a22 },
  { k: "ng", skin: 0x5a3a28, hair: 0x0d0b0a, uni: { pal: [0x2f3b24, 0x55703a, 0x7a6238, 0xa89c6d], kind: "blob", seed: 41 }, hat: { kind: "beret", c: 0x2a4a2a, badge: 0xd9b13b }, boots: 0x2b2822, belt: 0x2a2a22, glove: null, vest: null, pack: null },
  { k: "bd", skin: 0xa87048, hair: 0x100c0a, uni: { pal: [0x2a3d22, 0x4b6a36, 0x6a7a40, 0x3c3220], kind: "blob", seed: 51 }, hat: { kind: "cap", c: "uni", visor: 0x2a3a22, badge: 0xd02a2a }, boots: 0x1c1c1c, belt: 0x2a2a22, glove: null, vest: null, pack: null },
  { k: "id", skin: 0xc08a58, hair: 0x0e0b09, uni: { pal: [0x1f2a17, 0x4a5a2e, 0x7a5a30, 0x9a8a58], kind: "blob", seed: 61 }, hat: { kind: "beret", c: 0xb01820, badge: 0xd9b13b }, vest: 0x2d3524, pouch: 0x20281a, glove: 0x1c1c1c, boots: 0x1c1c1c, belt: 0x2a2a22, pack: null },
  { k: "in", skin: 0xb98258, hair: 0x0c0a09, uni: { pal: [0x3a3a28, 0x6a6a3a, 0x8a6a3c, 0x55603a], kind: "pix", seed: 71 }, hat: { kind: "beret", c: 0x7a1e2a, badge: 0xd9b13b }, boots: 0x2a2420, belt: 0x2f2a22, glove: null, vest: null, pack: null },
  { k: "cn", skin: 0xf0c8a0, hair: 0x0d0b0a, uni: { pal: [0x2e3a22, 0x587036, 0x8a9a5a, 0xb2a47a, 0x3a2e1e], kind: "pix", seed: 81 }, hat: { kind: "helmet", c: "uni", badge: "star" }, vest: 0x4a5535, pouch: 0x3a4428, pack: 0x44502f, glove: 0x2a2a2a, boots: 0x1f1f1f, belt: 0x2f2a22 },
  { k: "ph", skin: 0xc89868, hair: 0x120e0b, uni: { pal: [0x2c3c22, 0x4c6a3a, 0x7a8a50, 0x5a4a30], kind: "pix", seed: 91 }, hat: { kind: "boonie", c: "uni" }, boots: 0x3a3328, belt: 0x2f2a22, glove: null, vest: null, pack: null },
  { k: "ua", skin: 0xf1cfb4, hair: 0x6a4a2a, uni: { pal: [0x3d3a22, 0x6b6c3c, 0xa28f5c, 0x4a3a28], kind: "pix", seed: 101 }, hat: { kind: "helmet", c: "uni", badge: "ua" }, vest: 0x6a5a3c, pouch: 0x54482e, pack: 0x5a5030, glove: 0x2a2a2a, boots: 0x6b5a3c, belt: 0x4a3f2a, knee: true },
  { k: "kr", skin: 0xf0d0b4, hair: 0x0d0c0b, uni: { pal: [0x2a3326, 0x47573a, 0x7a7650, 0x1f1f1a], kind: "pix", seed: 111 }, hat: { kind: "cap", c: "uni", visor: 0x1f1f1a, badge: 0xd9b13b }, boots: 0x1a1a1a, belt: 0x1f1f1a, glove: null, vest: null, pack: null },
];
export const defOf = (k: string) => CH.find((c) => c.k === k) ?? CH[0];

/* ───── "Hộp voxel": mỗi voxel 1 màu, chỉ sinh mặt ngoài, gộp thành 1 geometry (vertex color) ───── */
class VB {
  private p: number[] = []; private n: number[] = []; private c: number[] = [];
  /** tâm (cx,cy,cz) · kích thước (w,h,d) tính bằng mét · color: số hoặc hàm (i,j,k,nx,ny,nz) → hex */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number | Fn) {
    const nx = Math.max(1, Math.round(w / PX)), ny = Math.max(1, Math.round(h / PX)), nz = Math.max(1, Math.round(d / PX));
    const sx = w / nx, sy = h / ny, sz = d / nz, x0 = cx - w / 2, y0 = cy - h / 2, z0 = cz - d / 2, col = new THREE.Color();
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const edge = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1; if (!edge) continue;
      const hex = typeof color === "number" ? shade(color, 1 + (hb(i, j, k, 7) - 0.5) * 0.07) : color(i, j, k, nx, ny, nz);
      col.setHex(hex);
      const X = x0 + i * sx, Y = y0 + j * sy, Z = z0 + k * sz;
      if (i === nx - 1) this.quad([X + sx, Y, Z + sz], [X + sx, Y, Z], [X + sx, Y + sy, Z], [X + sx, Y + sy, Z + sz], [1, 0, 0], col);
      if (i === 0) this.quad([X, Y, Z], [X, Y, Z + sz], [X, Y + sy, Z + sz], [X, Y + sy, Z], [-1, 0, 0], col);
      if (j === ny - 1) this.quad([X, Y + sy, Z + sz], [X + sx, Y + sy, Z + sz], [X + sx, Y + sy, Z], [X, Y + sy, Z], [0, 1, 0], col);
      if (j === 0) this.quad([X, Y, Z], [X + sx, Y, Z], [X + sx, Y, Z + sz], [X, Y, Z + sz], [0, -1, 0], col);
      if (k === nz - 1) this.quad([X, Y, Z + sz], [X + sx, Y, Z + sz], [X + sx, Y + sy, Z + sz], [X, Y + sy, Z + sz], [0, 0, 1], col);
      if (k === 0) this.quad([X + sx, Y, Z], [X, Y, Z], [X, Y + sy, Z], [X + sx, Y + sy, Z], [0, 0, -1], col);
    }
  }
  private quad(a: number[], b: number[], c: number[], d: number[], nrm: number[], col: THREE.Color) {
    for (const v of [a, b, c, a, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(col.r, col.g, col.b); }
  }
  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = false; return m;
  }
}
const B = (v: VB, x: number, y: number, z: number, w: number, h: number, d: number, col: number | Fn) => v.box(x * PX, y * PX, z * PX, w * PX, h * PX, d * PX, col);

/* ───── mũ ───── */
function addHat(v: VB, def: any, U: Fn) {
  const h = def.hat, c = h.c === "uni" ? U : h.c, RED = 0xd02a2a, YEL = 0xffd23f, pal1 = def.uni.pal[1];
  const baseCol = (f: number) => (typeof c === "function" ? shade(pal1, f) : shade(c as number, f));
  const badge = (x: number, y: number, z: number) => {
    if (h.badge === "star") B(v, x, y, z, 3, 3, 1, (i, j) => (i === 1 && j === 1 ? YEL : RED));
    else if (h.badge === "ua") B(v, x, y, z, 3, 3, 1, (_i, j) => (j >= 1 ? 0x1d56b8 : 0xffd23f));
    else if (h.badge) B(v, x, y, z, 2, 2, 1, h.badge);
  };
  switch (h.kind) {
    case "helmet": B(v, 0, 31, 0, 10, 4, 10, c); B(v, 0, 29.5, 0, 11, 1, 11, baseCol(0.7)); B(v, 0, 30, -5.5, 10, 3, 1, c); if (h.nvg) B(v, 0, 32, 5.5, 3, 2, 1, 0x1f1f1f); badge(0, 31, 5.5); break;
    case "pith": B(v, 0, 29.5, 0, 12, 1, 12, h.brim); B(v, 0, 31, 0, 9, 2, 9, c); B(v, 0, 32.5, 0, 7, 1, 7, c); B(v, 0, 30.5, 4.5, 9, 1, 1, baseCol(0.75)); badge(0, 31, 5); break;
    case "beret": B(v, 0, 30.5, 0, 10, 3, 10, c); B(v, 1, 32.5, 0, 9, 1, 9, c); B(v, 4.5, 29.5, 2, 2, 2, 5, c); badge(-2.5, 31, 5.5); break;
    case "cap": B(v, 0, 30.5, 0, 9, 3, 9, c); B(v, 0, 32.5, 0, 9, 1, 9, typeof c === "function" ? def.uni.pal[0] : shade(c as number, 0.85)); B(v, 0, 29.5, 6, 8, 1, 4, h.visor); badge(0, 31, 5); break;
    case "boonie": B(v, 0, 31.5, 0, 9, 3, 9, c); B(v, 0, 29.5, 0, 13, 1, 13, typeof c === "function" ? def.uni.pal[0] : shade(c as number, 0.8)); B(v, 0, 30.5, 4.5, 9, 1, 1, 0x2a2a22); break;
    case "ushanka": B(v, 0, 31, 0, 10, 4, 10, c); B(v, -5, 27.5, 0, 2, 5, 6, shade(h.c, 0.85)); B(v, 5, 27.5, 0, 2, 5, 6, shade(h.c, 0.85)); B(v, 0, 29.5, -5.5, 10, 3, 1, shade(h.c, 0.85)); badge(0, 31, 5.5); break;
  }
}

/** Dựng 1 người lính → { g, armL, armR, legL, legR }. Mặt nhìn +z, chân chạm y=0. `band` = màu băng tay nhận diện đồng đội. */
export function buildSoldier(def: any, mat: THREE.Material, band: number) {
  const g = new THREE.Group(), U = camoFn(def.uni.pal, def.uni.kind, def.uni.seed), sk = [def.skin, shade(def.skin, 0.94)], SKN = (i: number, j: number, k: number) => (((i + j + k) & 1) ? sk[0] : sk[1]);
  const mouth = shade(def.skin, 0.62), gl = def.glove, H = def.hair;
  const grp = (x: number, y: number) => { const q = new THREE.Group(); q.position.set(x * PX, y * PX, 0); g.add(q); return q; };
  { // đầu vuông 8x8x8: tóc, mắt, miệng + mũ
    const hv = new VB();
    hv.box(0, 28 * PX, 0, 8 * PX, 8 * PX, 8 * PX, (i, j, k) => {
      if (j === 7) return H;
      if (k === 7) {
        if (j === 3) { if (i === 1 || i === 6) return 0xffffff; if (i === 2 || i === 5) return 0x2a2018; }
        if (j === 4 && (i === 1 || i === 2 || i === 5 || i === 6)) return H;
        if (j === 1 && (i === 3 || i === 4)) return mouth;
        return j >= 5 ? H : SKN(i, j, k);
      }
      if (k === 0) return j >= 1 ? H : SKN(i, j, k);
      if (i === 0 || i === 7) return j >= 4 ? H : SKN(i, j, k);
      return SKN(i, j, k);
    });
    addHat(hv, { ...def, head: "square" }, U); g.add(hv.mesh(mat));
  }
  { // thân: áo + áo giáp + túi đạn + thắt lưng + phù hiệu cổ áo + ba lô
    const bv = new VB(), vest = def.vest, pc = def.pouch;
    bv.box(0, 18 * PX, 0, 8 * PX, 12 * PX, 4 * PX, (i, j, k, _nx, _ny, nz) => {
      const fr = k === nz - 1, bk = k === 0;
      if (j === 1) return def.belt;
      if (vest && (fr || bk) && j >= 2 && j <= 9 && i >= 1 && i <= 6) {
        if (fr && j >= 2 && j <= 4 && (i <= 2 || i >= 5)) return pc;
        if (fr && j === 4 && (i === 3 || i === 4)) return shade(vest, 0.8);
        return vest;
      }
      if (vest && j >= 10 && (i === 1 || i === 6) && (fr || bk)) return vest;
      if (def.tabs && fr && j >= 9 && (i === 1 || i === 2 || i === 5 || i === 6)) return def.tabs;
      return U(i, j, k, 0, 0, 0);
    });
    if (def.pack) B(bv, 0, 19, -3, 7, 8, 2, def.pack);
    if (pc && vest) { B(bv, -2.5, 15.5, 2.5, 2, 3, 1, pc); B(bv, 2.5, 15.5, 2.5, 2, 3, 1, pc); }
    g.add(bv.mesh(mat));
  }
  const mkArm = (sx: number) => { // tay: tay áo rằn ri, tay trần/găng, băng màu đội, cờ ở mép ngoài tay áo
    const q = grp(sx * 6, 24), av = new VB();
    av.box(0, -6 * PX, 0, 4 * PX, 12 * PX, 4 * PX, (i, j, k) => (j <= 2 ? (gl || SKN(i, j, k)) : U(i + (sx > 0 ? 4 : 0), j, k, 0, 0, 0)));
    B(av, 0, -1, 0, 4.4, 1.6, 4.4, band);
    const fl = FLAG[def.k];
    if (fl) { const rows = fl.length; B(av, sx * 2.5, -3.5 - rows / 2 + 0.5, 0, 1, rows, 4, (_i, j, k) => { const c = sx > 0 ? 3 - k : k, r = rows - 1 - j; return FC[fl[r][c]]; }); }
    q.add(av.mesh(mat)); return q;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkLeg = (sx: number) => { // chân: quần rằn ri, ghệt/giày, miếng gối
    const q = grp(sx * 2, 12), lv = new VB();
    lv.box(0, -6 * PX, 0, 4 * PX, 12 * PX, 4 * PX, (i, j, k, _nx, _ny, nz) => {
      if (j <= 2) return def.boots;
      if (def.knee && k === nz - 1 && j >= 5 && j <= 6 && i >= 1 && i <= 2) return shade(def.vest || 0x444444, 0.7);
      return U(i, j + 3, k + (sx > 0 ? 5 : 0), 0, 0, 0);
    });
    q.add(lv.mesh(mat)); return q;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  return { g, armL, armR, legL, legR };
}
