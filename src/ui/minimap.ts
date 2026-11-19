import { G } from "../state";
import { COLORS } from "../config";
import { entities, bodies, me } from "../world/characters";
import { H, NG, ISLE, isPond, CAMP, STATION_XZ, VOLCANO_XZ } from "../world/island";
import { kindAt } from "../world/terrain";

/**
 * Bản đồ nhỏ ở góc trái (dưới các nút). Nền là địa hình thật vẽ từ bản đồ độ cao (biển / hồ / cát / cỏ / đá / tuyết, có đổ bóng sườn núi).
 *  - Phím M (hoặc bấm vào bản đồ): đổi cỡ  gần (110 m, xoay theo hướng nhìn) → rộng (240 m) → cả đảo (Bắc ở trên).
 *  - Chỉ hiện người đang NHÌN THẤY được (cùng luật tầm nhìn thật: bị che khuất thì không có chấm), xác người chết là dấu ✕.
 *  - 🔥 trại · ◆ trạm nhiệm vụ · ▲ núi lửa · mũi tên cam ở viền chỉ hướng về trại khi trại nằm ngoài khung.
 */
const SIZE = 190, EXT = ISLE + 20, W = EXT * 2;            // cỡ khung (px CSS) · nửa cạnh vùng vẽ nền (m) · cạnh nền (m = px)
const VIEWS = [110, 240, W];                              // số mét hiển thị theo từng chế độ
let mode = 0;

const cv = document.createElement("canvas"), dpr = Math.min(2, window.devicePixelRatio || 1);
cv.width = cv.height = Math.round(SIZE * dpr);
cv.style.cssText = `position:absolute;left:12px;top:160px;width:${SIZE}px;height:${SIZE}px;border-radius:50%;border:3px solid #ffffffcc;box-shadow:0 2px 12px #000a;background:#174f86;pointer-events:auto;cursor:pointer`;
cv.title = "M";
document.getElementById("hud")?.appendChild(cv);
const g = cv.getContext("2d")!;
cv.addEventListener("click", () => (mode = (mode + 1) % VIEWS.length));
addEventListener("keydown", (e) => { if (e.code === "KeyM" && (e.target as HTMLElement).tagName !== "INPUT") mode = (mode + 1) % VIEWS.length; });

/* ── nền địa hình: vẽ dần vài chục hàng mỗi lần để không giật lúc vào game ── */
const base = document.createElement("canvas"); base.width = base.height = W;
const bg = base.getContext("2d")!; bg.fillStyle = "#174f86"; bg.fillRect(0, 0, W, W);
const img = bg.createImageData(W, 1);
const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const COL: Record<string, [number, number, number]> = { sand: hex(0xeedba2), grass: hex(0x68ad48), stone: hex(0x8c8c8c), snow: hex(0xf6faff), gravel: hex(0x8f8a85), bed: hex(0x3b86d2) };
const SEA = [hex(0x5cc0d8), hex(0x3f9fc8), hex(0x2b7db4)];   // nông → sâu
let row = 0;
function buildRows(n: number) {
  for (let k = 0; k < n && row < W; k++, row++) {
    const iz = row - EXT, d = img.data;
    for (let c = 0; c < W; c++) {
      const ix = c - EXT, h = H(ix, iz), o = c * 4;
      let col: [number, number, number], f = 1;
      if (ix < -NG || ix >= NG || iz < -NG || iz >= NG) col = hex(0x174f86);
      else if (h < 0) col = SEA[Math.min(2, -h - 1)];
      else if (isPond(ix + 0.5, iz + 0.5)) col = COL.bed;
      else { col = COL[kindAt(ix, iz)] ?? COL.grass; f = Math.max(0.62, Math.min(1.38, 1 + 0.075 * (H(ix - 1, iz) - H(ix + 1, iz) + H(ix, iz - 1) - H(ix, iz + 1)))); }   // ánh sáng từ Tây-Bắc: sườn quay về đó sáng, sườn kia tối
      d[o] = Math.min(255, col[0] * f); d[o + 1] = Math.min(255, col[1] * f); d[o + 2] = Math.min(255, col[2] * f); d[o + 3] = 255;
    }
    bg.putImageData(img, 0, row);
  }
}

const ARROW = (x: number, y: number, a: number, s: number, fill: string) => {   // mũi tên chỉ hướng a (rad, 0 = lên trên)
  g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.75, s * 0.8); g.lineTo(0, s * 0.4); g.lineTo(-s * 0.75, s * 0.8); g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#000c"; g.stroke(); g.restore();
};

export function updateMinimap(_dt: number) {
  const show = G.phase === "play" && !G.mini;
  cv.style.display = show ? "block" : "none";
  if (!show) return;
  if (row < W) buildRows(24);
  const m = me(), S = SIZE * dpr, view = VIEWS[mode], ppm = S / view, whole = mode === VIEWS.length - 1;
  const cx = whole ? 0 : m.x, cz = whole ? 0 : m.z, rot = whole ? 0 : m.rot - Math.PI;   // cả đảo: Bắc ở trên · còn lại xoay để hướng nhìn luôn ở trên
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
  g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = "#174f86"; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2); g.rotate(rot); g.scale(ppm, ppm); g.translate(-cx, -cz);
  g.imageSmoothingEnabled = false; g.drawImage(base, -EXT, -EXT);
  const px = 1 / ppm;   // 1 điểm ảnh màn hình tính bằng mét: giữ kích thước ký hiệu cố định khi đổi mức phóng
  // trại lửa
  g.beginPath(); g.arc(CAMP[0], CAMP[1], 5 * px, 0, 7); g.fillStyle = "#ff8a1f"; g.fill(); g.lineWidth = 1.6 * px; g.strokeStyle = "#fff"; g.stroke();
  // trạm nhiệm vụ
  g.fillStyle = "#33e0ff"; g.strokeStyle = "#012"; g.lineWidth = 1.2 * px;
  for (const [x, z] of STATION_XZ) { g.save(); g.translate(x, z); g.rotate(Math.PI / 4); g.fillRect(-3.2 * px, -3.2 * px, 6.4 * px, 6.4 * px); g.strokeRect(-3.2 * px, -3.2 * px, 6.4 * px, 6.4 * px); g.restore(); }
  // núi lửa
  g.beginPath(); g.moveTo(VOLCANO_XZ[0], VOLCANO_XZ[1] - 5 * px); g.lineTo(VOLCANO_XZ[0] + 4.5 * px, VOLCANO_XZ[1] + 3.5 * px); g.lineTo(VOLCANO_XZ[0] - 4.5 * px, VOLCANO_XZ[1] + 3.5 * px); g.closePath(); g.fillStyle = "#e5361f"; g.fill(); g.stroke();
  // xác người chết: dấu ✕
  g.strokeStyle = "#ff3b3b"; g.lineWidth = 2.2 * px;
  for (const b of bodies) { const s = 3.4 * px; g.beginPath(); g.moveTo(b.x - s, b.z - s); g.lineTo(b.x + s, b.z + s); g.moveTo(b.x + s, b.z - s); g.lineTo(b.x - s, b.z + s); g.stroke(); }
  // người đang nhìn thấy được (cùng luật tầm nhìn thật)
  for (const e of entities) {
    if (e.i === G.slot || e.dead || e.out || !e.g.visible) continue;
    g.beginPath(); g.arc(e.x, e.z, 4.2 * px, 0, 7); g.fillStyle = "#" + COLORS[e.i % COLORS.length].toString(16).padStart(6, "0"); g.fill(); g.lineWidth = 1.5 * px; g.strokeStyle = "#fff"; g.stroke();
  }
  g.restore();
  // mũi tên chỉ về trại khi trại ra ngoài khung
  const cdx = CAMP[0] - cx, cdz = CAMP[1] - cz;
  if (!whole && Math.hypot(cdx, cdz) * ppm > S / 2 - 8) {
    const a = Math.atan2(cdz, cdx) + rot, r = S / 2 - 9;
    g.save(); g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.beginPath(); g.moveTo(0, -6 * dpr); g.lineTo(5 * dpr, 5 * dpr); g.lineTo(-5 * dpr, 5 * dpr); g.closePath(); g.fillStyle = "#ff8a1f"; g.fill(); g.lineWidth = 1.2 * dpr; g.strokeStyle = "#000c"; g.stroke(); g.restore();
  }
  // người chơi ở giữa (cả đảo: ở đúng vị trí, mũi tên theo hướng nhìn)
  const ax = whole ? S / 2 + (m.x - cx) * ppm : S / 2, az = whole ? S / 2 + (m.z - cz) * ppm : S / 2;
  ARROW(ax, az, whole ? Math.PI - m.rot : 0, 7.5 * dpr, "#ffe14d");
  // chữ N (hướng Bắc) ở viền
  const na = whole ? -Math.PI / 2 : -Math.PI / 2 + rot, nr = S / 2 - 11 * dpr;
  g.font = `700 ${12 * dpr}px system-ui`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 3 * dpr; g.strokeStyle = "#000c"; g.fillStyle = "#ff6b6b";
  g.strokeText("N", S / 2 + Math.cos(na) * nr, S / 2 + Math.sin(na) * nr); g.fillText("N", S / 2 + Math.cos(na) * nr, S / 2 + Math.sin(na) * nr);
  // độ cao
  g.font = `600 ${11 * dpr}px system-ui`; g.fillStyle = "#fff"; g.strokeStyle = "#000c"; g.lineWidth = 3 * dpr;
  const txt = `⛰ ${Math.max(0, Math.round(m.y))} m`; g.strokeText(txt, S / 2, S - 13 * dpr); g.fillText(txt, S / 2, S - 13 * dpr);
}
