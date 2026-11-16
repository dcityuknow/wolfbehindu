import { t } from "../i18n";

/**
 * Sơ đồ động "Vì sao cần kết nối ví?" thay cho đoạn chữ dài:
 *   Bạn ─(việc của bạn: nhiệm vụ · giết · bỏ phiếu)→ MetaMask ✋ xác nhận ─┐
 *   Bạn ─(lượt của Bot)→ Ví phiên dùng 1 lần (tự ký) ───────────────────────┴→ Sepolia (mạng thử nghiệm + mã hoá FHE)
 *   Sepolia ─(giải mã vai trò: 1 chữ ký, 0 gas)→ Bạn
 * Gói dữ liệu chạy dọc từng đường (SVG animateMotion). Chữ lấy từ i18n "wd.*"; 3 thẻ trấn an nằm dưới sơ đồ.
 */
const PA = "M190 205 C245 205 245 110 300 110 L520 110 C575 110 575 205 620 205";     // việc của bạn → MetaMask → chuỗi
const PB = "M190 255 C245 255 245 350 300 350 L520 350 C575 350 575 255 620 255";     // lượt của Bot → ví phiên → chuỗi
const PE = "M620 230 L190 230";                                                          // giải mã vai trò: chuỗi → bạn
// chữ dài (RU/UK/BN…) tự co lại cho vừa khung
const fit = (s: string, w: number, fs: number) => (s.length * fs * 0.56 > w - 14 ? ` textLength="${w - 14}" lengthAdjust="spacingAndGlyphs"` : "");
const node = (x: number, y: number, w: number, h: number, c: string, ico: string, l1: string, l2: string, l3 = "") =>
  `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="#131a48" stroke="${c}" stroke-width="2.5"/>` +
  `<text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" font-size="30">${ico}</text>` +
  `<text x="${x + w / 2}" y="${y + 64}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff"${fit(l1, w, 16)}>${l1}</text>` +
  `<text x="${x + w / 2}" y="${y + 84}" text-anchor="middle" font-size="12.5" fill="#b9c3ff"${fit(l2, w, 12.5)}>${l2}</text>` +
  (l3 ? `<text x="${x + w / 2}" y="${y + 102}" text-anchor="middle" font-size="12.5" fill="#b9c3ff"${fit(l3, w, 12.5)}>${l3}</text>` : "") + `</g>`;
const pk = (path: string, c: string, dur: string, begin: string) =>
  `<circle r="7" fill="${c}" stroke="#fff" stroke-width="1.5"><animateMotion dur="${dur}" begin="${begin}" repeatCount="indefinite" path="${path}"/></circle>`;
const pill = (ico: string, s: string) => `<div class="wdp"><span>${ico}</span><b>${s}</b></div>`;

export const walletDiagram = () => `
<div class="card wd"><h3>${t("conn.why.h")}</h3>
<svg viewBox="0 0 810 450" role="img" aria-label="${t("conn.why.h")}">
 <defs>
  <marker id="wa1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ffd24d"/></marker>
  <marker id="wa2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#6ab0ff"/></marker>
  <marker id="wa3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c77dff"/></marker>
 </defs>
 <path class="flow" d="${PA}" fill="none" stroke="#ffd24d" stroke-width="3" marker-end="url(#wa1)"/>
 <path class="flow" d="${PB}" fill="none" stroke="#6ab0ff" stroke-width="3" marker-end="url(#wa2)"/>
 <path class="flow rev" d="${PE}" fill="none" stroke="#c77dff" stroke-width="3" stroke-dasharray="3 6" marker-end="url(#wa3)"/>
 ${pk(PA, "#ffd24d", "3.4s", "0s")}${pk(PA, "#ffd24d", "3.4s", "1.7s")}${pk(PB, "#6ab0ff", "3.4s", "0.6s")}${pk(PB, "#6ab0ff", "3.4s", "2.3s")}${pk(PE, "#c77dff", "2.6s", "0.4s")}
 ${node(10, 165, 180, 130, "#7f8fe0", "🎮", t("wd.you"), t("wd.you2"))}
 ${node(300, 50, 220, 120, "#ffd24d", "🦊", t("wd.mm"), t("wd.mm2"), t("wd.confirm"))}
 ${node(300, 290, 220, 120, "#6ab0ff", "🔑", t("wd.sess"), t("wd.sess2"), t("wd.sess3"))}
 ${node(620, 165, 180, 130, "#5fe39a", "🔗", t("wd.chain"), t("wd.chain2"), t("wd.chain3"))}
 <text x="410" y="26" text-anchor="middle" font-size="15" font-weight="700" fill="#ffd24d">${t("wd.a")}</text>
 <text x="410" y="43" text-anchor="middle" font-size="12.5" fill="#ffe9a0">${t("wd.a2")}</text>
 <text x="410" y="428" text-anchor="middle" font-size="15" font-weight="700" fill="#8fc4ff">${t("wd.c")}</text>
 <text x="410" y="445" text-anchor="middle" font-size="12.5" fill="#bcdcff">${t("wd.c2")}</text>
 <text x="405" y="216" text-anchor="middle" font-size="14" font-weight="700" fill="#e2b6ff">${t("wd.e")}</text>
 <text x="405" y="252" text-anchor="middle" font-size="12.5" fill="#d9b8f5">${t("wd.e2")}</text>
</svg>
<div class="wdps">${pill("💸", t("wd.p1"))}${pill("🚫", t("wd.p2"))}${pill("⛽", t("wd.p3"))}</div></div>`;
