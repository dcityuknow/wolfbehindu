import * as THREE from "three";
import { camera, hemi, sun, torch, sky, sunOrb, scene, SUN_DIR } from "./scene";
import { LIGHT } from "../config";
import { CINE } from "./cineState";
import { locale } from "../i18n";

/**
 * CHU KỲ NGÀY – ĐÊM THEO GIỜ THẬT CỦA NGƯỜI CHƠI (bê cách làm của game tham khảo: world/common/daycycle.js).
 *
 *  1) Giờ:   IP → múi giờ (IANA) + vị trí (vĩ độ/kinh độ) → giờ địa phương bằng Intl. Tra lỗi / bị chặn → dùng múi giờ của trình duyệt.
 *            Kết quả nhớ 12 giờ trong localStorage ("si_geo") nên lần sau vào game có giờ ngay, không phải chờ mạng. Tra IP chạy NGẦM, không chặn game.
 *  2) Mặt trời mọc / lặn THẬT: tính theo vĩ độ + kinh độ + ngày hôm nay (công thức NOAA). Ví dụ Berlin tháng 11 lặn lúc ~16h, Hà Nội ~17h15.
 *            (Bản tham khảo cố định 6h–18h cho mọi nơi; ở đây trời tối đúng lúc ngoài đời tối.) Không có toạ độ → mặc định 6h–18h.
 *  3) Mốc giờ thật được "co giãn" về ngày chuẩn (mọc = 6, lặn = 18) rồi tra bảng KEYS bên dưới: bình minh cam → sáng → trưa nắng gắt → chiều ngả vàng → hoàng hôn → chạng vạng → đêm.
 *  4) Ảnh hưởng: nắng (sun) + ánh trăng (cùng 1 đèn có bóng đổ, hướng/ màu/ cường độ chuyển mượt), ánh sáng môi trường (hemi), màu vòm trời, sương mù,
 *            mặt trời + mặt trăng (có pha trăng thật theo ngày) + sao, đèn pin quanh người, mây / đáy biển / bọt sóng / tuyết (đọc DAY.tint).
 *  5) Cảnh phim mở đầu (cine3d.ts) tự đặt ánh sáng riêng → module này nhường hoàn toàn khi CINE.active, xong phim thì tự lấy lại.
 *
 *  Thử nhanh (thêm vào URL):  ?hour=21.5 (đứng yên ở 21:30) · ?hour=5&speed=600 (chạy nhanh: 1 giây = 10 phút) · ?tz=Asia/Tokyo · ?lat=35.7&lon=139.7 · ?speed=300 · ?moon=0.25 (pha trăng)
 *  Hoặc trong console:        DayCycle.setHour(21)  ·  DayCycle.setHour(null) (về giờ thật)  ·  DayCycle.info()
 */
const CFG = {
  geoTimeout: 2500,   // ms chờ mỗi dịch vụ tra IP
  cacheHours: 12,
  badge: true,        // đồng hồ nhỏ dưới mini-map: 🌙 21:05 · VN
  nightLight: 1,      // nhân độ sáng ban đêm (1 = mặc định; tăng 1.2–1.5 nếu thấy tối khó chơi)
  moonBase: 0.42,     // cường độ ánh trăng so với nắng trưa (LIGHT.sun)
  stars: 1300,        // số sao
  skyR: 380,          // bán kính vòm sao (< vòm trời 400, < camera.far)
  orbDist: 330,       // khoảng cách vẽ mặt trời / mặt trăng quanh camera
  minLightY: 0.26,    // độ cao tối thiểu của HƯỚNG đèn (khi mặt trời thấp, bóng không bị kéo dài vô lý)
};

/* ═════════════ Trạng thái dùng chung (các module khác chỉ ĐỌC) ═════════════ */
export const DAY = {
  hour: 12,                         // giờ địa phương thật (0..24)
  norm: 12,                         // giờ đã co giãn (mọc = 6, lặn = 18)
  night: 0,                         // 0 = ban ngày … 1 = đêm sâu
  sunElev: 1,                       // sin(góc cao mặt trời): <0 = dưới chân trời
  fog: new THREE.Color(0xcfe6f2),   // màu chân trời / sương mù hiện tại
  tint: new THREE.Color(1, 1, 1),   // nhân cho vật liệu KHÔNG ăn đèn (mây, đáy biển, bọt sóng, tuyết): ban ngày = trắng, ban đêm = xanh đen
};

/* ═════════════ 1) GIỜ: IP → múi giờ + vị trí ═════════════ */
const GEO_KEY = "si_geo", qs = new URLSearchParams(location.search);
interface Geo { tz: string; cc: string; lat: number | null; lon: number | null }
const geo: Geo = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", cc: "", lat: null, lon: null };

const okTz = (z: string) => { try { new Intl.DateTimeFormat("en-GB", { timeZone: z }); return true; } catch { return false; } };
const fmtCache: Record<string, Intl.DateTimeFormat> = {};
function partsIn(z: string, d: Date) {
  const f = (fmtCache[z] ??= new Intl.DateTimeFormat("en-GB", { timeZone: z, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }));
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = +x.value;
  return p;
}
const hourIn = (z: string, d: Date = new Date()) => { const p = partsIn(z, d); return (p.hour % 24) + p.minute / 60 + p.second / 3600; };

let baseH = 12, baseT = performance.now(), speed = 1, frozen = false, ovr = false;
const nowH = () => frozen ? baseH : (((baseH + (performance.now() - baseT) / 3.6e6 * speed) % 24) + 24) % 24;
function resync() { baseH = hourIn(geo.tz); baseT = performance.now(); }

/* ── Giờ mặt trời mọc / lặn thật (giờ địa phương) ── */
let SR = 6, SS = 18, solarKey = "";
const RAD = Math.PI / 180;
function solarTimes(y: number, mo: number, d: number, lat: number, lon: number): { rise: number; set: number } | "day" | "night" {   // công thức NOAA ("Sunrise equation")
  const jd = Date.UTC(y, mo - 1, d, 12) / 864e5 + 2440587.5, n = Math.round(jd - 2451545.0);
  const Js = n + 0.0008 - lon / 360, M = (((357.5291 + 0.98560028 * Js) % 360) + 360) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lam = (((M + C + 180 + 102.9372) % 360) + 360) % 360;
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lam * RAD);
  const sd = Math.sin(lam * RAD) * Math.sin(23.4397 * RAD), dec = Math.asin(sd);
  const cw = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sd) / (Math.cos(lat * RAD) * Math.cos(dec));
  if (cw > 1) return "night"; if (cw < -1) return "day";   // đêm địa cực / ngày địa cực
  const w = Math.acos(cw) / RAD, toDate = (J: number) => new Date((J - 2440587.5) * 864e5);
  return { rise: hourIn(geo.tz, toDate(Jt - w / 360)), set: hourIn(geo.tz, toDate(Jt + w / 360)) };
}
function updateSolar(force = false) {
  const p = partsIn(geo.tz, new Date()), key = `${p.year}-${p.month}-${p.day}|${geo.lat}|${geo.lon}|${geo.tz}`;
  if (!force && key === solarKey) return; solarKey = key;
  let lat = geo.lat, lon = geo.lon;
  const ql = parseFloat(qs.get("lat") ?? ""), qo = parseFloat(qs.get("lon") ?? ""); if (!isNaN(ql) && !isNaN(qo)) { lat = ql; lon = qo; }
  if (lat == null || lon == null) { SR = 6; SS = 18; return; }
  const r = solarTimes(p.year, p.month, p.day, lat, lon);
  if (r === "day") { SR = 2; SS = 22; } else if (r === "night") { SR = 10.5; SS = 13.5; } else { SR = r.rise; SS = r.set; }
  let D = (SS - SR + 24) % 24; const mid = SR + D / 2;                                   // ngày quá ngắn / quá dài thì ép lại cho còn chơi được
  if (D < 3) D = 3; else if (D > 21) D = 21; SR = (((mid - D / 2) % 24) + 24) % 24; SS = (((mid + D / 2) % 24) + 24) % 24;
}

/** giờ thật → giờ "chuẩn" (mọc = 6, lặn = 18). Ban ngày co giãn đều; ban đêm giữ nguyên độ dài hoàng hôn / rạng đông, phần giữa đêm co giãn. */
function normHour(h: number): number {
  const D = (SS - SR + 24) % 24 || 12, t = (((h - SR) % 24) + 24) % 24;
  if (t < D) return 6 + (t / D) * 12;
  const N = 24 - D, n = t - D; let a = 2.2, b = 1.2; const k = Math.min(1, (N - 1) / (a + b)); if (k < 1) { a *= k; b *= k; }
  const r = n < a ? 18 + n : n > N - b ? 30 - b + (n - (N - b)) : 18 + a + ((n - a) / (N - a - b)) * ((30 - b) - (18 + a));
  return r % 24;
}

async function getJSON(url: string): Promise<any> {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), CFG.geoTimeout);
  try { const r = await fetch(url, { signal: ac.signal, cache: "no-store" }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); } finally { clearTimeout(to); }
}
const num = (v: unknown) => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return typeof n === "number" && isFinite(n) ? n : null; };
/** Các dịch vụ tra IP (đều gọi được từ trình duyệt); thử lần lượt tới khi có kết quả. */
const GEO_SERVICES: [string, (j: any) => Geo | null][] = [
  ["https://ipwho.is/", (j) => j.success === false ? null : { tz: j.timezone?.id, cc: j.country_code, lat: num(j.latitude), lon: num(j.longitude) }],
  ["https://get.geojs.io/v1/ip/geo.json", (j) => ({ tz: j.timezone, cc: j.country_code, lat: num(j.latitude), lon: num(j.longitude) })],
  ["https://ipapi.co/json/", (j) => j.error ? null : { tz: j.timezone, cc: j.country_code, lat: num(j.latitude), lon: num(j.longitude) }],
  ["https://worldtimeapi.org/api/ip", (j) => ({ tz: j.timezone, cc: "", lat: null, lon: null })],
];
function applyGeo(g: Geo) {
  if (!g.tz || !okTz(g.tz)) return false;
  geo.tz = g.tz; geo.cc = (g.cc || geo.cc || "").toUpperCase(); geo.lat = g.lat; geo.lon = g.lon;
  if (!ovr) resync(); updateSolar(true); return true;
}
async function geolocate() {
  for (const [u, fn] of GEO_SERVICES) {
    try {
      const g = fn(await getJSON(u));
      if (g && applyGeo(g)) { try { localStorage.setItem(GEO_KEY, JSON.stringify({ ...geo, t: Date.now() })); } catch { /* chế độ riêng tư */ } return; }
    } catch { /* thử dịch vụ kế tiếp */ }
  }
}
(function init() {
  let c: (Geo & { t: number }) | null = null;
  try { c = JSON.parse(localStorage.getItem(GEO_KEY) || "null"); } catch { /* bỏ qua */ }
  const fresh = !!c && !!c.tz && Date.now() - c.t < CFG.cacheHours * 3.6e6;
  if (fresh) applyGeo(c!); else { resync(); updateSolar(true); }                      // mặc định: múi giờ trình duyệt (luôn có) — cache IP còn mới thì dùng luôn
  const qz = qs.get("tz"); if (qz && okTz(qz)) { geo.tz = qz; resync(); updateSolar(true); }
  const qh = parseFloat(qs.get("hour") ?? "");
  if (!isNaN(qh)) { baseH = ((qh % 24) + 24) % 24; baseT = performance.now(); ovr = true; speed = parseFloat(qs.get("speed") ?? "") || 0; frozen = !speed; }
  else if (qs.get("speed")) speed = parseFloat(qs.get("speed")!) || 1;
  if (!fresh && !qz) void geolocate();                                                // chưa có cache mới: tra IP ngầm (không chặn game)
})();
setInterval(() => { if (!ovr && speed === 1) { resync(); updateSolar(); } }, 30000);   // khớp lại đồng hồ hệ thống + qua ngày mới thì tính lại giờ mọc/lặn
document.addEventListener("visibilitychange", () => { if (!document.hidden && !ovr && speed === 1) { resync(); updateSolar(); } });

/* ═════════════ 2) BẢNG MÀU THEO GIỜ CHUẨN (mọc = 6, lặn = 18) ═════════════ */
/** sun/amb: hệ số so với LIGHT.sun / LIGHT.ambient (trưa = 1, đúng như game cũ) · moon: độ sáng trăng (0..1) · night: 0 = ngày … 1 = đêm (điều khiển sao, đèn pin, tối đồ không ăn đèn).
 *  hs/hg: ánh sáng môi trường (trời/đất) · hor/mid/top: vòm trời (màu NHÌN THẤY) · fog: sương mù chân trời · tint: nhân cho vật liệu không ăn đèn. Tất cả màu ghi dạng hex hiển thị. */
const KEYS = ([
  //  h     sun   sunC      amb   hs        hg        hor       mid       top       fog       moon  night tint
  [0,    0,    0xffffff, .50, 0x6f82c8, 0x2b2f55, 0x141e4c, 0x0b1238, 0x050a22, 0x121a40, 1,    1,    0x2a3158],
  [4.8,  0,    0xffffff, .50, 0x6f82c8, 0x2b2f55, 0x141e4c, 0x0b1238, 0x050a22, 0x121a40, 1,    1,    0x2a3158],
  [5.7,  .35,  0xff9a5a, .62, 0xffc8a8, 0x7a5a78, 0xffa878, 0xa07aa8, 0x2a3f8a, 0xf0b896, .35,  .5,   0xffd0b0],   // rạng đông
  [7.2,  .75,  0xffdcae, .90, 0xfff2e4, 0xe8d0a8, 0xcfd8e0, 0x78b4e8, 0x2a63c4, 0xf2e6d4, 0,    .08,  0xfff0e0],   // sáng: nắng vàng ấm
  [9.5,  .95,  0xffecc8, .98, 0xdcecff, 0xe3d3a0, 0xa8cde4, 0x68b2e8, 0x1450c8, 0xdbeaf2, 0,    0,    0xfffaf0],
  [11.5, 1,    0xfff0d6, 1,   0xcfe6ff, 0xe3d3a0, 0x9fcae2, 0x61afe9, 0x0c47ca, 0xcfe6f2, 0,    0,    0xffffff],   // trưa = ĐÚNG như game cũ
  [13.5, 1,    0xfff0d6, 1,   0xcfe6ff, 0xe3d3a0, 0x9fcae2, 0x61afe9, 0x0c47ca, 0xcfe6f2, 0,    0,    0xffffff],
  [15.5, .88,  0xffe6bc, .97, 0xe8eeff, 0xe3d3a0, 0xa8cde4, 0x68b2e8, 0x1a58c4, 0xdbeaf2, 0,    0,    0xfffaf0],   // chiều: nắng vừa
  [17.2, .62,  0xffc690, .90, 0xffeedd, 0xe0b8a8, 0xe8c8a8, 0x7fa0d8, 0x2a55b0, 0xf6dcc0, 0,    .15,  0xffe0c0],
  [18.1, .28,  0xff8a50, .72, 0xffc0a0, 0x6a4a78, 0xff9a6b, 0xc07aa0, 0x2a3a8a, 0xe8a888, .15,  .5,   0xff9a70],   // hoàng hôn
  [19.1, 0,    0xffa060, .55, 0x8a8ad0, 0x34386a, 0x4a4a88, 0x252a68, 0x0c1240, 0x3a3c78, .6,   .9,   0x5a5a90],   // chạng vạng: tắt nắng
  [20.2, 0,    0xffffff, .50, 0x6f82c8, 0x2b2f55, 0x141e4c, 0x0b1238, 0x050a22, 0x121a40, 1,    1,    0x2a3158],
  [24,   0,    0xffffff, .50, 0x6f82c8, 0x2b2f55, 0x141e4c, 0x0b1238, 0x050a22, 0x121a40, 1,    1,    0x2a3158],
] as const).map((a) => ({
  h: a[0], sun: a[1], sunC: new THREE.Color(a[2]), amb: a[3], hs: new THREE.Color(a[4]), hg: new THREE.Color(a[5]), hor: new THREE.Color(a[6]), mid: new THREE.Color(a[7]), top: new THREE.Color(a[8]),
  fog: new THREE.Color(a[9]), moon: a[10], night: a[11], tint: new THREE.Color(a[12]),
}));
const sm = (t: number) => t * t * (3 - 2 * t), clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x)), ss = (a: number, b: number, x: number) => sm(clamp((x - a) / (b - a), 0, 1));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const K = { sun: 0, amb: 1, moon: 0, night: 0, sunC: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), hor: new THREE.Color(), mid: new THREE.Color(), top: new THREE.Color() };
function sample(h: number) {
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = sm(clamp((h - a.h) / (b.h - a.h), 0, 1));
  K.sun = lerp(a.sun, b.sun, t); K.amb = lerp(a.amb, b.amb, t); K.moon = lerp(a.moon, b.moon, t); K.night = lerp(a.night, b.night, t);
  K.sunC.copy(a.sunC).lerp(b.sunC, t); K.hs.copy(a.hs).lerp(b.hs, t); K.hg.copy(a.hg).lerp(b.hg, t);
  K.hor.copy(a.hor).lerp(b.hor, t); K.mid.copy(a.mid).lerp(b.mid, t); K.top.copy(a.top).lerp(b.top, t);
  DAY.fog.copy(a.fog).lerp(b.fog, t); DAY.tint.copy(a.tint).lerp(b.tint, t);
}

/* ═════════════ 3) PHA TRĂNG THẬT theo ngày ═════════════ */
function moonPhase(d = new Date()) {   // frac: 0 = trăng non, .5 = trăng tròn
  const syn = 29.530588853; let age = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % syn; if (age < 0) age += syn;
  const frac = age / syn; return { frac, illum: (1 - Math.cos(2 * Math.PI * frac)) / 2 };
}
const MOON = moonPhase();
{ const qm = parseFloat(qs.get("moon") ?? ""); if (!isNaN(qm)) { MOON.frac = ((qm % 1) + 1) % 1; MOON.illum = (1 - Math.cos(2 * Math.PI * MOON.frac)) / 2; } }   // ?moon=0.25 (0 = non · .25 = thượng huyền · .5 = rằm · .75 = hạ huyền) để thử

/* ═════════════ 4) THIÊN THỂ: mặt trời · mặt trăng · sao ═════════════ */
const glowTex = (rgb: string) => {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  r.addColorStop(0, `rgba(${rgb},.95)`); r.addColorStop(.22, `rgba(${rgb},.38)`); r.addColorStop(.55, `rgba(${rgb},.1)`); r.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const mkGlow = (rgb: string) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(rgb), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.renderOrder = -9; s.frustumCulled = false; s.visible = false; scene.add(s); return s; };
const sunGlow = mkGlow("255,255,255"), moonGlow = mkGlow("170,195,255");

// Mặt trăng: quả cầu tô sáng theo PHA THẬT (billboard: ánh sáng cố định trong không gian camera), có vài mảng "hố" mờ + ánh đất (earthshine)
const moonMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { uC: { value: new THREE.Color(0xeef2ff) }, uL: { value: new THREE.Vector3(0, 0, 1) }, uO: { value: 0 } },
  vertexShader: "varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: "uniform vec3 uC;uniform vec3 uL;uniform float uO;varying vec3 vN;varying vec3 vP;void main(){" +
    "vec3 n=normalize(vN);float lit=smoothstep(-.03,.16,dot(n,normalize(uL)));" +
    "float cr=sin(vP.x*.9+1.3)*sin(vP.y*.8+.4)*sin(vP.z*1.1);vec3 base=uC*(1.-.16*smoothstep(.1,.8,cr));" +
    "vec3 col=base*(.07+.93*lit);gl_FragColor=vec4(col,uO);gl_FragColor=linearToOutputTexel(gl_FragColor);}",
});
const moonOrb = new THREE.Mesh(new THREE.SphereGeometry(17, 32, 22), moonMat); moonOrb.renderOrder = -8; moonOrb.frustumCulled = false; moonOrb.visible = false; scene.add(moonOrb);

// Sao: điểm trên nửa vòm trời, đi theo camera, xoay chậm theo giờ, nhấp nháy nhẹ
const stars = (() => {
  const N = CFG.stars, pos = new Float32Array(N * 3), col = new Float32Array(N * 3); let sd = 7; const rn = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < N; i++) {
    const u = rn() * Math.PI * 2, y = 0.04 + rn() * 0.96, r = Math.sqrt(1 - y * y), w = 0.55 + rn() * 0.45, t = rn();
    pos.set([Math.cos(u) * r * CFG.skyR, y * CFG.skyR, Math.sin(u) * r * CFG.skyR], i * 3); col.set([w * (0.85 + 0.15 * t), w * 0.95, w], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  p.renderOrder = -9.5; p.frustumCulled = false; p.visible = false; scene.add(p); return p;
})();

const skyU = (sky.material as THREE.ShaderMaterial).uniforms, sunOrbMat = sunOrb.material as THREE.MeshBasicMaterial;
const V_SUN = new THREE.Vector3(), V_MOON = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _c = new THREE.Color(), _w = new THREE.Color(1, 1, 1);
let ownsSky = false, badge: HTMLDivElement | null = null, badgeT = 0, badgeTxt = "", tAcc = 0;

/** Nhường quyền cho cảnh phim (cine3d.ts tự đặt trời / sao / ánh sáng, nhưng lấy gốc từ realLook()): ẩn đồ của mình. */
function yieldToCine() {
  if (!ownsSky) return; ownsSky = false;
  moonOrb.visible = moonGlow.visible = sunGlow.visible = stars.visible = false;   // (vòm trời vẫn ở chế độ uEnc = 1: cảnh phim cũng dùng màu theo giờ thật, xem realLook())
}

/* ═════════════ 5) MỖI KHUNG (gọi trong main.ts, SAU updateCamera, TRƯỚC followSun) ═════════════ */
export function updateDayCycle(dt: number) {
  if (CINE.active) { yieldToCine(); return; }
  ownsSky = true; skyU.uEnc.value = 1; tAcc += dt;
  const h = nowH(), nh = normHour(h); sample(nh);
  DAY.hour = h; DAY.norm = nh; DAY.night = K.night;

  // vị trí mặt trời: cung từ +x (mọc, nh=6) qua đỉnh (nh=12) tới -x (lặn, nh=18); trăng đối diện
  const th = ((nh - 6) / 12) * Math.PI, sinT = Math.sin(th), sunRaw = V_SUN.set(Math.cos(th) * 0.95, sinT * 0.8, 0.4).normalize();
  const thm = th + Math.PI, moonRaw = V_MOON.set(Math.cos(thm) * 0.95, Math.sin(thm) * 0.8, -0.35).normalize();
  DAY.sunElev = sinT;

  // ── ánh sáng: 1 đèn có bóng đổ = nắng + trăng hoà theo cường độ (không giật khi chuyển) ──
  const sunI = K.sun * LIGHT.sun, moonI = K.moon * CFG.moonBase * LIGHT.sun * (0.6 + 0.4 * MOON.illum) * CFG.nightLight, tot = sunI + moonI;
  if (tot > 1e-4) {   // hướng + màu đèn = trung bình có trọng số cường độ của nắng và trăng
    _t1.set(sunRaw.x, Math.max(sunRaw.y, CFG.minLightY), sunRaw.z).normalize().multiplyScalar(sunI);
    _t2.set(moonRaw.x, Math.max(moonRaw.y, CFG.minLightY), moonRaw.z).normalize().multiplyScalar(moonI);
    SUN_DIR.copy(_t1).add(_t2).normalize();
    sun.color.copy(K.sunC).multiplyScalar(sunI / tot); _c.setHex(0xa9c0ff).multiplyScalar(moonI / tot); sun.color.add(_c);
  }
  sun.intensity = tot;
  hemi.intensity = K.amb * LIGHT.ambient * (1 + (CFG.nightLight - 1) * K.night); hemi.color.copy(K.hs); hemi.groundColor.copy(K.hg);
  torch.intensity = LIGHT.torch * (1 + 0.5 * K.night);   // đèn quanh người: ban đêm sáng hơn một chút cho dễ chơi

  // ── vòm trời + sương mù (lúc đang ở dưới nước, water.ts đè màu sương sau bước này) ──
  skyU.hor.value.copy(K.hor); skyU.mid.value.copy(K.mid); skyU.top.value.copy(K.top);
  (scene.background as THREE.Color).copy(DAY.fog); (scene.fog as THREE.FogExp2).color.copy(DAY.fog);

  // ── mặt trời (quả cầu + quầng) ──
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, R = CFG.orbDist;
  const sUp = sinT > -0.06, low = 1 - clamp(sinT, 0, 1);
  sunOrb.visible = sunGlow.visible = sUp;
  if (sUp) {
    sunOrb.position.set(cx + sunRaw.x * R, cy + sunRaw.y * R, cz + sunRaw.z * R); sunOrb.scale.setScalar(1 + 0.45 * low);
    sunOrbMat.color.copy(K.sunC).lerp(_w, 0.35 * (1 - low)).lerp(_c.setHex(0xff9a5a), 0.55 * low * (1 - K.night));
    const fade = ss(-0.06, 0.08, sinT); sunGlow.position.copy(sunOrb.position); const gs = (150 + 160 * low) * (0.9 + 0.1 * Math.sin(tAcc * 0.6)); sunGlow.scale.set(gs, gs, 1);
    sunGlow.material.color.copy(sunOrbMat.color); sunGlow.material.opacity = 0.75 * fade * (0.5 + 0.5 * clamp(K.sun * 1.4, 0, 1));
  }

  // ── mặt trăng + sao ──
  const mUp = Math.sin(thm) > -0.08 && K.moon > 0.02;
  moonOrb.visible = moonGlow.visible = mUp;
  if (mUp) {
    const ph = 2 * Math.PI * MOON.frac, flip = geo.lat != null && geo.lat < 0 ? -1 : 1;   // bán cầu Nam thấy trăng lật ngược
    moonMat.uniforms.uL.value.set(Math.sin(ph) * flip * 0.95, 0.05, -Math.cos(ph)).normalize();
    const fade = ss(-0.08, 0.14, Math.sin(thm)) * clamp(K.moon * 2.2, 0, 1);
    moonOrb.position.set(cx + moonRaw.x * R, cy + moonRaw.y * R, cz + moonRaw.z * R); moonOrb.scale.setScalar(1 + 0.25 * (1 - clamp(Math.sin(thm), 0, 1)));
    moonMat.uniforms.uO.value = fade; moonGlow.position.copy(moonOrb.position); moonGlow.scale.setScalar(120 + 50 * MOON.illum);
    moonGlow.material.opacity = fade * (0.18 + 0.42 * MOON.illum);
  }
  const sOp = ss(0.55, 1, K.night); stars.visible = sOp > 0.01;
  if (stars.visible) { stars.position.set(cx, cy, cz); stars.rotation.y = DAY.hour * 0.26; (stars.material as THREE.PointsMaterial).opacity = sOp * 0.95 * (0.88 + 0.12 * Math.sin(tAcc * 2.7)); }

  updateBadge(dt);
}


/* ═════════════ Ánh sáng GIỜ THẬT cho cảnh phim (cine3d.ts gọi mỗi lần bắt đầu phim) ═════════════ */
export interface RealLook {
  top: number; mid: number; hor: number; fog: number;   // vòm trời + sương (hex hiển thị)
  hemi: number; hemiC: number; sun: number; sunC: number; // ánh sáng môi trường + nắng/trăng (đúng thang LIGHT của game)
  cloud: number; stars: number; day: number;             // màu mây · độ hiện của sao (0..1) · 1 = ban ngày … 0 = đêm
  sunEl: number; orbC: number;                           // độ cao (rad) của mặt trời (hoặc trăng nếu đang đêm) · màu quả cầu sáng
}
export function realLook(): RealLook {
  const nh = normHour(nowH()); sample(nh);
  const sinT = Math.sin(((nh - 6) / 12) * Math.PI), day = 1 - K.night;
  const sunI = K.sun * LIGHT.sun, moonI = K.moon * CFG.moonBase * LIGHT.sun * (0.6 + 0.4 * MOON.illum) * CFG.nightLight, tot = sunI + moonI;
  const sc = new THREE.Color().copy(K.sunC).multiplyScalar(tot > 1e-4 ? sunI / tot : 0).add(new THREE.Color(0xa9c0ff).multiplyScalar(tot > 1e-4 ? moonI / tot : 1));
  const cloud = new THREE.Color(0x2a3558).lerp(new THREE.Color(0xf0f2f8).multiply(DAY.tint), day);
  const el = Math.asin(clamp(Math.abs(sinT) * 0.8, 0, 1));
  return {
    top: K.top.getHex(), mid: K.mid.getHex(), hor: K.hor.getHex(), fog: DAY.fog.getHex(),
    hemi: K.amb * LIGHT.ambient * (1 + (CFG.nightLight - 1) * K.night), hemiC: K.hs.getHex(), sun: tot, sunC: sc.getHex(),
    cloud: cloud.getHex(), stars: ss(0.55, 1, K.night), day, sunEl: el, orbC: new THREE.Color(0xdde6ff).lerp(K.sunC, day).getHex(),
  };
}

/* ═════════════ Đồng hồ nhỏ dưới mini-map ═════════════ */
const emoji = (n: number) => (n < 5.5 || n >= 19.5 ? "🌙" : n < 7 ? "🌅" : n < 10 ? "🌤️" : n < 14 ? "☀️" : n < 17.5 ? "🌤️" : "🌇");
function updateBadge(dt: number) {
  if (!CFG.badge) return;
  if (!badge) {
    const hud = document.getElementById("hud"); if (!hud) return;
    badge = document.createElement("div"); badge.id = "dayclock";
    badge.style.cssText = "position:absolute;left:12px;top:214px;background:#0009;color:#fff;border-radius:8px;padding:3px 10px;font:700 13px system-ui,sans-serif;pointer-events:none;z-index:1";
    hud.appendChild(badge);
  }
  badgeT -= dt; if (badgeT > 0) return; badgeT = 0.5;
  const hh = Math.floor(DAY.hour), mm = Math.floor((DAY.hour - hh) * 60), cc = geo.cc || locale.cc || "";
  const txt = `${emoji(DAY.norm)} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}${cc ? " · " + cc : ""}`;
  if (txt !== badgeTxt) { badgeTxt = txt; badge.textContent = txt; badge.title = geo.tz; }
}

/* ═════════════ Công cụ thử cho dev (console) ═════════════ */
(window as any).DayCycle = {
  info: () => ({ tz: geo.tz, country: geo.cc, lat: geo.lat, lon: geo.lon, hour: nowH(), sunrise: SR, sunset: SS, moonPhase: MOON.frac }),
  setHour(h: number | null, spd = 0) { if (h == null) { ovr = false; frozen = false; speed = 1; resync(); return; } baseH = ((h % 24) + 24) % 24; baseT = performance.now(); ovr = true; speed = spd; frozen = !spd; },
};
