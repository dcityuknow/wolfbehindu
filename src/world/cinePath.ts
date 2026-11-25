/**
 * Quỹ đạo của cảnh mở đầu 3D (toán thuần — không import three, nên chạy thử được bằng node).
 * "Đồng hồ phim" ct (giây) khớp kịch bản 60s: ct = -12 là giây 0:00 (trong khoang) · ct = 0 là 0:12 (đèn xanh) · ct = 10 là 0:22 (bão) ·
 * ct = 26 là 0:38 (phân cảnh 4: nhìn xuống rơi tự do, dài thêm EXT giây rồi đồng hồ độ cao báo đỏ, dù bung ~ct 28 + EXT) · beat 5 bắt đầu ở ct = 36 + EXT (màn đen rồi rơi xuống rừng).
 */
export const N = 11;
/** Đoạn bấm E để bung dù (cảnh rơi tự do của người chơi). Cảnh báo bật ở giây EXT - ALERT_LEAD của phân cảnh 4, hạn chót bấm là giây EXT + DEP (dù bung theo kịch bản).
 *  Bấm E kịp → dù bung bình thường. Không bấm → fail: người chơi tiếp tục rơi, KHÔNG có dù, chạm đất tử nạn (stateOf nhánh "crash"). */
export const ALERT_LEAD = 2.2, DEP = 2.4;
/** Tán cây để kiểm tra va chạm khi rơi: [x, z, bán kính đáy tán, bán kính đỉnh tán, độ cao đáy, độ cao đỉnh, loại (0 thông · 1 sồi · 2 dừa)]. cine3d.ts điền từ map.ts (CANOPIES). */
export type Canopy = [number, number, number, number, number, number, number];
/** Quỹ đạo rơi không dù đã mô phỏng sẵn: mỗi mẫu (1/60 s) = [x, y, z, góc lăn, tốc độ ngang, đang chạm đất]. */
export interface Traj { dt: number; n: number; d: Float32Array; hd: number }
/** Trạng thái đoạn bấm E. Mọi mốc thời gian d = giây tính từ lúc hết hạn bung dù. tc = lúc chạm đất lần đầu (-1 = chưa tính), tr = lúc nằm im, bounces = các lần đập/nảy, treeHit = lần đâm vào tán cây. */
export const DIVE = {
  armed: false, ok: false, fail: false, ft: 0, tc: -1, tr: -1, hit: false, press: 0, nb: 0, th: false,
  traj: null as Traj | null, trees: [] as Canopy[], bounces: [] as { d: number; v: number; x: number; z: number }[], treeHit: null as { d: number; x: number; y: number; z: number; k: number } | null, cur: { hs: 0, contact: false, fall: 0 },
};
export const diveReset = () => Object.assign(DIVE, { armed: false, ok: false, fail: false, ft: 0, tc: -1, tr: -1, hit: false, press: 0, nb: 0, th: false, traj: null, bounces: [], treeHit: null, cur: { hs: 0, contact: false, fall: 0 } });
/** Số giây kéo dài thêm cho đoạn người chơi rơi tự do (góc nhìn xuống đất) trước khi bung dù. */
export const EXT = 16;   // +2 so với trước: thêm 2 giây rơi tự do để có đủ thời gian cho cảnh cảnh báo + bấm E
/** Thứ tự 10 đồng đội bung dù (id) và giây (tính từ đầu phân cảnh 4) họ bung — camera lia tới từng người lúc họ bung. */
export const DEP_ORDER = [3, 5, 1, 6, 2, 4, 7, 8, 9, 10];
export const T_DEP = (i: number) => 3.2 + 1.0 * DEP_ORDER.indexOf(i);
export const PL = { x0: -212, y: 650, v: 22 };                     // máy bay bay theo +x, cao 650m (để có ~25s rơi tự do trong bão), 22 m/s
const turb = (ct: number) => 0.07 * Math.sin(ct * 3.1) + 0.04 * Math.sin(ct * 7.3);
export const planeAt = (ct: number) => ({ x: PL.x0 + PL.v * ct, y: PL.y + turb(ct), z: 0 });
/** Toạ độ trong khoang (lx ngang, ly cao từ sàn, lz dọc: -z = mũi, +z = đuôi/ramp) → thế giới. Máy bay xoay y = -π/2. */
export const PLANE_YAW = -Math.PI / 2;
export const toWorld = (ct: number, lx: number, ly: number, lz: number) => { const p = planeAt(ct); return { x: p.x - lz, y: p.y + ly, z: p.z + lx }; };

export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ghế ngồi (băng ghế hai bên khoang), index = id người (0 = bạn). yaw = hướng mặt khi ngồi. */
export const SEAT = [
  { x: -1.55, z: 0.2, yaw: Math.PI / 2 }, { x: 1.55, z: -1.1, yaw: -Math.PI / 2 }, { x: -1.55, z: -2.3, yaw: Math.PI / 2 }, { x: 1.55, z: 1.4, yaw: -Math.PI / 2 },
  { x: -1.55, z: 2.7, yaw: Math.PI / 2 }, { x: 1.55, z: -3.6, yaw: -Math.PI / 2 }, { x: -1.55, z: -4.8, yaw: Math.PI / 2 },
  // 4 lính mới (id 7..10): Hotel · India · Juliet bên phải, Kilo bên trái gần ramp. Id 6 (Golf) vẫn ngồi xa nhất nên vẫn nhảy sau cùng.
  { x: 1.55, z: 2.65, yaw: -Math.PI / 2 }, { x: 1.55, z: -2.35, yaw: -Math.PI / 2 }, { x: 1.55, z: 0.15, yaw: -Math.PI / 2 }, { x: -1.55, z: 4.1, yaw: Math.PI / 2 },
];
/** Thứ tự nhảy: ghế gần ramp (z lớn) nhảy trước. RANK[id] = thứ tự. */
export const RANK: number[] = (() => { const o = [...Array(N).keys()].sort((a, b) => SEAT[b].z - SEAT[a].z), r: number[] = []; o.forEach((id, k) => (r[id] = k)); return r; })();
export const TJ = (k: number) => 3.6 + 0.45 * k;    // thời điểm nhảy theo thứ tự hàng (k = RANK); người cuối (id 6) nhảy sau cùng
const TS = (k: number) => 0.3 + 0.12 * k;           // thời điểm đứng dậy
/** Trực thăng Black Hawk: lính thoát qua CỬA TRƯỢT HAI BÊN HÔNG (không còn ramp sau). DZ = tâm cửa dọc khoang (lz), DOOR_X = lx của ngưỡng cửa. SIDE[id] = -1 băng ghế trái · +1 băng ghế phải: mỗi bên xếp một hàng riêng trước cửa bên mình. */
export const DZ = 2.5, DOOR_X = 2.15;
export const SIDE: number[] = SEAT.map((s) => (s.x < 0 ? -1 : 1));
const ORD: number[] = []; RANK.forEach((k, id) => { ORD[k] = id; });
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Thời điểm dù bung / chạm đất theo id. Người chơi (id 0) là nhân vật bị ngất: dù bung muộn nhất, chạm đất ngay sau màn đen (đầu cảnh 5). */
export const TO = (i: number) => (i === 0 ? 28.4 + EXT : 26 + T_DEP(i));
export const TL = (i: number) => (i === 0 ? 38.9 + EXT : TO(i) + 8.5);
const QS = 0.85, WALK = 3.0, M = PL.v * 0.9, TAU = 1.2, TC = 0.4, H_OPEN = 60;   // dù bung ở độ cao 60m trên mặt đất (gần đất mới bung)
/** Điểm hạ cánh của từng người. Mặc định: vòng tròn quanh lửa trại; cine3d.cineBegin() thay bằng vị trí NGẪU NHIÊN rải khắp đảo mỗi ván. */
export const LAND: { x: number; z: number; a: number }[] = [...Array(N).keys()].map((i) => { const a = 0.4 + (i * Math.PI * 2) / N; return { x: 5.2 * Math.cos(a), z: 5.2 * Math.sin(a), a }; });
/** Độ mạnh của bão theo ct (0..1): vào bão ở 0:22, dịu đi khi dù đã bung. */
export const storm = (ct: number) => smooth(10, 12, ct) * (1 - smooth(28 + EXT, 33 + EXT, ct));

export type Mode = "seat" | "walk" | "fall" | "chute" | "landed" | "crash";
export interface St { mode: Mode; wx: number; wy: number; wz: number; wyaw: number; lx: number; lz: number; stand: number; open: number; land: number; walking: boolean; ou: number; spin?: number; hs?: number; hd?: number; js?: number; ey?: number }

/** Mô phỏng rơi không dù từ lúc hết hạn (d = 0) tới khi nằm im (tối đa 14 s, bước 1/120 s, lưu 1/60 s). Trọng lực 12 m/s² (khớp quãng rơi nhanh dần của quỹ đạo cũ);
 *  chạm tán cây → mất ~55% tốc độ rơi + bị hất ngang + lăn tít (ghi DIVE.treeHit) · chạm đất → nảy (lần đầu 17% tốc độ, sau đó 32%), trượt/lăn có ma sát, va vào bậc đất cao thì dội lại. */
function simFall(hx: (sx: number) => { x: number; z: number }, so: number, yo: number, vt: number, gnd: (x: number, z: number) => number) {
  const DT = 1 / 120, STEPS = 14 * 120, NS = STEPS / 2, out = new Float32Array(NS * 6);
  const p0 = hx(so), p1 = hx(so + 0.01), p2 = hx(so - 0.01);
  let vx = (p1.x - p2.x) / 0.02, vz = (p1.z - p2.z) / 0.02;
  const h0 = Math.hypot(vx, vz), MIN = 7;   // đảm bảo có đà ngang để lăn (nếu gần như rơi thẳng đứng)
  if (h0 < MIN) { const ux = h0 > 0.1 ? vx / h0 : 1, uz = h0 > 0.1 ? vz / h0 : 0; vx = ux * MIN; vz = uz * MIN; }
  const hd = Math.atan2(vx, vz);
  let x = p0.x, z = p0.z, y = yo, vy = -vt, spin = 0, sr = 0, tc = -1, rest = -1, nb = 0, hitT = false, tgt = 0, wall = 0;
  const bounces: { d: number; v: number; x: number; z: number }[] = []; DIVE.treeHit = null;
  for (let st = 0; st < STEPS; st++) {
    const d = st * DT;
    vy -= 12 * DT;
    if (!hitT) for (const c of DIVE.trees) {   // đâm vào tán cây?
      if (Math.abs(x - c[0]) > 3.4 || Math.abs(z - c[1]) > 3.4 || y < c[4] || y > c[5]) continue;
      const u = (y - c[4]) / (c[5] - c[4]);
      if (Math.hypot(x - c[0], z - c[1]) < lerp(c[2], c[3], u)) {
        hitT = true; DIVE.treeHit = { d, x, y, z, k: c[6] };
        const a = (Math.sin(c[0] * 12.9898 + c[1] * 78.233) * 43758.5453) % 1; vy = Math.max(vy * 0.45, -14); vx = vx * 0.6 + Math.cos(a * 6.283) * 3.2; vz = vz * 0.6 + Math.sin(a * 6.283) * 3.2; sr = 7 + 3 * Math.abs(a);
        break;
      }
    }
    if (gnd(x + vx * DT * 3, z + vz * DT * 3) > y + 0.7) { vx *= -0.25; vz *= -0.25; wall = 1; } else wall = 0;   // đập vào bậc đất cao thì dội lại
    x += vx * DT; z += vz * DT; y += vy * DT;
    const g0 = gnd(x, z);
    if (y <= g0) {
      y = g0;
      if (vy < -2.2) {   // đập đất / nảy
        if (tc < 0) tc = d;
        bounces.push({ d, v: -vy, x, z });
        vy = -vy * (nb === 0 ? 0.17 : 0.32); nb++;
        vx *= 0.82; vz *= 0.82; sr = Math.max(sr, Math.hypot(vx, vz) / 0.45);
      } else vy = 0;
    }
    const contact = y <= g0 + 0.03 && vy <= 0.01;
    if (contact) { const f = Math.exp(-3.4 * DT); vx *= f; vz *= f; }
    const hs = Math.hypot(vx, vz);
    if (tc >= 0 && contact) sr = hs / 0.45;   // lăn theo quãng đường
    if (tc >= 0 && contact && hs < 0.3 && rest < 0) { rest = d; tgt = Math.round((spin + sr * 0.15) / Math.PI) * Math.PI; }   // nằm im → chốt góc nằm (sấp hoặc ngửa)
    if (rest >= 0) { sr = 0; spin += (tgt - spin) * Math.min(1, 7 * DT); } else spin += sr * DT;
    if (st % 2 === 0) { const o = (st / 2) * 6; out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = spin; out[o + 4] = hs; out[o + 5] = contact ? 1 : 0; }
    void wall;
  }
  DIVE.traj = { dt: 1 / 60, n: NS, d: out, hd }; DIVE.bounces = bounces; DIVE.tc = tc < 0 ? 3 : tc; DIVE.tr = rest < 0 ? DIVE.tc + 3 : Math.max(rest, DIVE.tc + 1.2);
}
/** Trạng thái người i tại thời điểm ct. gl = độ cao mặt đất chỗ hạ cánh. gAt (tuỳ chọn) = độ cao mặt đất tại (x, z) — chỉ cần cho cảnh người chơi rơi mà không bung dù (không rơi đúng chỗ hạ cánh dự kiến). */
export function stateOf(i: number, ct: number, gl: number, gAt?: (x: number, z: number) => number): St {
  const k = RANK[i], seat = SEAT[i], tj = TJ(k);
  if (ct < tj) { // còn trong trực thăng: ngồi → đứng dậy → đi vào hàng trước cửa hông bên mình → bước ra ngưỡng cửa
    const side = SIDE[i], lane = side * 0.7, t = ct - TS(k), stand = smooth(0, 0.6, t);
    let n0 = 0, ahead = 0; for (let kj = 0; kj < k; kj++) if (SIDE[ORD[kj]] === side) { n0++; ahead += 1 - smooth(TJ(kj) - 0.35, TJ(kj), ct); }
    const back = DZ - QS * n0 >= seat.z ? 0 : seat.yaw > 0 ? Math.PI : -Math.PI;      // hướng đi dọc lối giữa (về phía đuôi hoặc phía mũi)
    const yawW = seat.yaw + wrapPi(back - seat.yaw) * smooth(0.1, 0.7, t);
    const dz = DZ - QS * ahead - seat.z, P = WALK * Math.max(0, t - 0.6), lzQ = seat.z + Math.sign(dz) * Math.min(P, Math.abs(dz));
    const ex = smooth(tj - 0.6, tj, ct), lx = lerp(lerp(seat.x, lane, stand), side * DOOR_X, ex), lz = lerp(lzQ, DZ, ex), yaw = yawW + wrapPi(side * Math.PI / 2 - yawW) * ex, w = toWorld(ct, lx, 0, lz);
    return { mode: t < 0 ? "seat" : "walk", wx: w.x, wy: w.y, wz: w.z, wyaw: yaw + PLANE_YAW, lx, lz, stand, open: 0, land: 0, walking: P < Math.abs(dz) - 0.02 || (ex > 0 && ex < 1), ou: 0 };
  }
  const s = ct - tj, so = TO(i) - tj, sl = TL(i) - tj, L = LAND[i], pe = planeAt(tj), sd = SIDE[i], xe = pe.x - DZ, ze = pe.z + sd * DOOR_X, ye = pe.y;
  const fd = (x: number) => x - TAU * (1 - Math.exp(-x / TAU));                 // quãng rơi tự do / vận tốc cuối
  const vt = (ye - gl - H_OPEN) / fd(so);                                       // vận tốc rơi sao cho dù bung ở độ cao H_OPEN trên mặt đất
  const sA = (c: number) => 14 * storm(c);                                      // bão quật lính ra nhiều hướng
  const hx = (sx: number) => { const c = tj + sx, f = 0.7 * smooth(0, 1, sx / so);
    return { x: xe + M * (1 - Math.exp(-sx / 0.9)) + (L.x - xe - M) * f + Math.sin(c * 0.9 + i * 2.1) * sA(c), z: ze + (L.z - ze) * f + sd * 5.5 * (1 - Math.exp(-sx / 0.6)) + Math.cos(c * 0.7 + i * 1.3) * sA(c) * 1.3 }; };
  let wx: number, wy: number, wz: number, mode: Mode = "fall", open = 0, land = 0, ou = 0;
  if (i === 0 && DIVE.fail && s >= so) {   // KHÔNG bấm E: không có dù — rơi nhanh dần, có thể đâm vào tán cây (gãy cành, rụng lá), đập đất, nảy lên, lăn lốc rồi nằm im (mô phỏng 1 lần, xem simFall)
    const yo = ye - vt * fd(so), gnd = (x: number, z: number) => (gAt ? gAt(x, z) : gl);
    if (!DIVE.traj) simFall(hx, so, yo, vt, gnd);
    const T = DIVE.traj!, d = s - so, k = Math.max(0, Math.min(d / T.dt, T.n - 1)), i0 = Math.floor(k), i1 = Math.min(T.n - 1, i0 + 1), f = k - i0, q = (a: number) => lerp(T.d[i0 * 6 + a], T.d[i1 * 6 + a], f);
    const crashed = DIVE.tc >= 0 && d >= DIVE.tc;
    DIVE.cur = { hs: q(4), contact: q(5) > 0.5, fall: d };
    return { mode: crashed ? "crash" : "fall", wx: q(0), wy: q(1), wz: q(2), wyaw: 0, lx: 0, lz: 0, stand: 1, open: 0, land: crashed ? 1 : 0, walking: false, ou: crashed ? d - DIVE.tc : 0, spin: q(3), hs: q(4), hd: T.hd };
  }
  if (s < so) { const h = hx(s); wx = h.x; wz = h.z; wy = ye - vt * fd(s); }
  else {
    const o = hx(so), yo = gl + H_OPEN, u = s - so, ul = sl - so, f = Math.min(1, u / ul), v = (H_OPEN - vt * TC) / (ul - TC);
    wx = o.x + (L.x - o.x) * f; wz = o.z + (L.z - o.z) * f;
    wy = yo - (v * u + (vt - v) * TC * (1 - Math.exp(-u / TC))); mode = "chute"; open = smooth(0, 0.6, u); ou = u;
    const A = (0.3 + 2.7 * storm(ct)) * (1 - f);                                // gió giật làm dù lắc ngang
    wx += Math.sin(ct * 1.3 + i * 1.7) * A; wz += Math.cos(ct * 1.1 + i) * A;
  }
  if (s >= sl) { mode = "landed"; wx = L.x; wz = L.z; wy = gl; land = smooth(0, 0.8, s - sl); }
  return { mode, wx, wy: Math.max(gl, wy), wz, wyaw: 0, lx: 0, lz: 0, stand: 1, open, land, walking: false, ou, js: mode === "fall" ? s : undefined, ey: sd * Math.PI / 2 + PLANE_YAW };
}
