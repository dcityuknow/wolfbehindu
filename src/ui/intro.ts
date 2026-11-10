import { $ } from "./dom";

/**
 * Màn mở đầu cho người mới, 3 bước:  1) Trailer hoạt hình  2) Luật chơi  3) Kết nối ví & vào chơi.
 * Không chạm blockchain cho tới khi người chơi bấm nút ở bước 3.
 */

const SEEN_KEY = "si_intro_seen";
const store = {
  get: () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } },
  set: () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } },
};

/* ───────────── Trailer: 6 cảnh SVG tự chạy ───────────── */

const A = (x: number, y: number, c: string, extra = "", s = 1) =>
  `<g ${extra}><use href="#astro" x="${x}" y="${y}" width="${60 * s}" height="${90 * s}" style="--c:${c}"/></g>`;
const BLUE = "#4da6ff", RED = "#ff4d4d", GREEN = "#4dff88", YEL = "#ffd24d";

const SCENES: { title: string; cap: string; svg: string }[] = [
  {
    title: "Con tàu vũ trụ",
    cap: "Bạn và 3 đồng đội đang ở trên một con tàu vũ trụ. Mọi chuyện bắt đầu bình yên…",
    svg: `<text x="320" y="54" class="t big">🛸 Tàu vũ trụ</text>
      ${[RED, BLUE, GREEN, YEL].map((c, i) => `<g class="walk" style="--d:${i}">${A(110 + i * 120, 168, c, 'class="bob"')}</g>`).join("")}
      <text x="140" y="150" class="t sm" fill="#fff">BẠN</text><path d="M140 156 l-6 -8 h12z" fill="#fff"/>`,
  },
  {
    title: "Nhiệm vụ",
    cap: "Mỗi người làm 3 nhiệm vụ ở các trạm màu cam nhấp nháy (nối dây, nhập mã, bơm oxy). Làm xong cả nhóm là thắng!",
    svg: `<rect x="400" y="150" width="110" height="112" rx="12" fill="#2a2f5c"/>
      <rect x="414" y="164" width="82" height="50" rx="6" class="screen"/>
      <text x="455" y="196" class="t sm" fill="#241500">E · làm task</text>
      ${A(300, 172, BLUE, 'class="bob"')}
      <text x="200" y="60" class="t big">Nhiệm vụ</text>
      ${[0, 1, 2].map((i) => `<rect x="${236 + i * 56}" y="82" width="46" height="18" rx="9" fill="#222"/><rect class="pb" style="--d:${i + 1}" x="${236 + i * 56}" y="82" width="46" height="18" rx="9" fill="#4f8"/>`).join("")}
      <text x="320" y="124" class="t sm">3 nhiệm vụ / người</text>`,
  },
  {
    title: "Một Impostor ẩn mình",
    cap: "Trong 4 người có 1 Impostor — có thể chính là bạn! Vai trò được chia ngẫu nhiên và mã hoá bằng Zama FHE: chỉ bạn thấy vai của mình.",
    svg: `<text x="320" y="48" class="t big">🔐 Vai trò được mã hoá</text>
      ${[BLUE, RED, GREEN, YEL].map((c, i) => `${A(110 + i * 120, 150, c, 'class="bob"')}<text x="${140 + i * 120}" y="140" class="t big q" style="--d:${i}">?</text>`).join("")}
      <g class="pop" style="--d:1.2"><rect x="60" y="64" width="270" height="34" rx="17" fill="#3b4160"/><text x="195" y="86" class="t sm" fill="#5f9">Chỉ bạn thấy: CREWMATE 🧑‍🚀</text></g>
      <text x="140" y="262" class="t sm" fill="#fff">BẠN</text>`,
  },
  {
    title: "Kill & báo cáo",
    cap: "Impostor lén hạ gục người đi lẻ (phím Q, tối đa 1 lần mỗi round). Ai thấy xác bấm E để báo cáo và mở cuộc họp.",
    svg: `<text x="320" y="48" class="t big siren">🚨</text>
      <g class="slide">${A(110, 170, RED, 'class="bob"')}</g>
      <g class="fall">${A(380, 170, BLUE)}</g>
      <rect class="flash" x="0" y="0" width="640" height="300" fill="#f00"/>
      <text x="480" y="200" class="t big stab">🔪</text>`,
  },
  {
    title: "Họp & bỏ phiếu kín",
    cap: "Cả nhóm họp quanh bàn tròn, tranh luận rồi bỏ phiếu. Phiếu được mã hoá on-chain — không ai biết bạn bầu ai. Người nhiều phiếu nhất bị loại.",
    svg: `<ellipse cx="320" cy="214" rx="190" ry="40" fill="#2a2f5c"/>
      ${A(120, 110, BLUE, "", 0.8)}${A(230, 110, GREEN, "", 0.8)}${A(340, 110, YEL, "", 0.8)}
      <g class="eject">${A(450, 110, RED, "", 0.8)}</g>
      <text x="320" y="224" class="t big">🗳🔐</text>
      <text x="150" y="70" class="t sm vote" style="--d:0">✉</text><text x="260" y="70" class="t sm vote" style="--d:1">✉</text><text x="370" y="70" class="t sm vote" style="--d:2">✉</text>
      <text x="320" y="270" class="t sm pop" style="--d:2.4" fill="#5f9">Bị loại: ĐÚNG là Impostor! 🎉</text>`,
  },
  {
    title: "Ai thắng?",
    cap: "Sẵn sàng chưa? Bấm “Luật chơi” để xem điều khiển, hoặc nhảy thẳng vào chơi.",
    svg: `<rect x="40" y="40" width="270" height="210" rx="14" fill="#16306a"/><rect x="330" y="40" width="270" height="210" rx="14" fill="#5a1a1a"/>
      <text x="175" y="78" class="t big" fill="#5f9">🧑‍🚀 CREW THẮNG</text>
      <text x="175" y="130" class="t sm">✔ Bỏ phiếu loại đúng Impostor</text>
      <text x="175" y="160" class="t sm">hoặc</text>
      <text x="175" y="190" class="t sm">✔ Cả nhóm làm xong nhiệm vụ</text>
      <text x="465" y="78" class="t big" fill="#f66">🔪 IMPOSTOR THẮNG</text>
      <text x="465" y="130" class="t sm">✔ Hạ gục đến khi số Crew</text>
      <text x="465" y="160" class="t sm">còn sống ≤ số Impostor</text>
      <text x="465" y="190" class="t sm">(1 Crew + 1 Impostor là đủ)</text>`,
  },
];

const trailerHtml = () => `
<svg width="0" height="0" style="position:absolute"><defs>
 <symbol id="astro" viewBox="0 0 60 90">
  <rect x="13" y="62" width="14" height="24" rx="6" fill="var(--c)"/><rect x="33" y="62" width="14" height="24" rx="6" fill="var(--c)"/>
  <rect x="13" y="62" width="14" height="24" rx="6" fill="#000" opacity=".25"/><rect x="33" y="62" width="14" height="24" rx="6" fill="#000" opacity=".25"/>
  <rect x="7" y="34" width="46" height="36" rx="14" fill="var(--c)"/><rect x="21" y="46" width="18" height="12" rx="3" fill="#000" opacity=".25"/>
  <circle cx="30" cy="26" r="22" fill="#e8ecff"/><ellipse cx="32" cy="27" rx="15" ry="11" fill="#0b1230"/>
  <ellipse cx="27" cy="23" rx="5" ry="2.6" fill="#fff" opacity=".7"/>
 </symbol></defs></svg>
<div class="tv">
 <svg viewBox="0 0 640 300" class="stage" role="img" aria-label="Trailer giới thiệu game">
  <rect width="640" height="300" fill="#070a24"/>
  ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 97) % 640}" cy="${(i * 53) % 230}" r="${1 + (i % 3) * 0.5}" fill="#fff" opacity="${0.25 + (i % 4) * 0.15}"/>`).join("")}
  <rect y="262" width="640" height="38" fill="#151c4a"/><rect y="260" width="640" height="3" fill="#34407a"/>
  ${SCENES.map((s, i) => `<g class="scene" data-i="${i}">${s.svg}</g>`).join("")}
 </svg>
 <div class="tbar"><i id="tprog"></i></div>
 <div class="tcap"><b id="ttl"></b><p id="tcap"></p></div>
 <div class="tctl">
  <button id="tprev" class="g">◀</button><button id="tpause" class="g">⏸ Tạm dừng</button><button id="tnext" class="g">▶</button>
  <span id="tdots"></span>
 </div>
</div>`;

function trailer() {
  const scenes = Array.from(document.querySelectorAll<SVGGElement>(".scene"));
  const dots = $("#tdots"); dots.innerHTML = SCENES.map((_, i) => `<u data-i="${i}"></u>`).join("");
  let cur = -1, paused = false, t = 0; const DUR = 6.5;
  const go = (n: number) => {
    cur = (n + SCENES.length) % SCENES.length; t = 0;
    scenes.forEach((s, i) => s.classList.remove("on"));
    void scenes[cur].getBoundingClientRect(); // ép reflow để animation chạy lại từ đầu
    scenes[cur].classList.add("on");
    $("#ttl").textContent = `${cur + 1}/${SCENES.length} · ${SCENES[cur].title}`; $("#tcap").textContent = SCENES[cur].cap;
    dots.querySelectorAll("u").forEach((d, i) => d.classList.toggle("a", i === cur));
  };
  $("#tprev").onclick = () => go(cur - 1); $("#tnext").onclick = () => go(cur + 1);
  $("#tpause").onclick = () => { paused = !paused; $("#tpause").textContent = paused ? "▶ Phát" : "⏸ Tạm dừng"; };
  dots.onclick = (e) => { const d = (e.target as HTMLElement).closest("u"); if (d) go(+(d as HTMLElement).dataset.i!); };
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1e3; last = now;
    if (paused || document.hidden || ($("#menu").style.display === "none")) return;
    t += dt; $("#tprog").style.width = Math.min(100, (t / DUR) * 100) + "%";
    if (t >= DUR) go(cur + 1);
  }, 100);
  go(0);
}

/* ───────────── Luật chơi (dùng cả ở menu lẫn trong game) ───────────── */

export const rulesHtml = () => `
<div class="rg">
 <div class="card"><h3>🎯 Mục tiêu</h3>
  <p>Bạn chơi cùng <b>3 Bot</b>. Trong 4 người có <b>1 Impostor</b> (ngẫu nhiên, có thể là bạn).</p>
  <p><b style="color:#5f9">Crew thắng</b> nếu loại đúng Impostor <i>hoặc</i> cả nhóm làm xong nhiệm vụ.<br>
  <b style="color:#f66">Impostor thắng</b> khi số Crew còn sống ≤ số Impostor.</p></div>
 <div class="card"><h3>🧑‍🚀 Nếu bạn là Crew</h3>
  <p>1. Tìm <b style="color:#fa3">trạm cam nhấp nháy</b>, đứng gần và bấm <kbd>E</kbd> để làm mini-game (3 nhiệm vụ).<br>
  2. Thấy xác chết? Đến gần bấm <kbd>E</kbd> để báo cáo.<br>
  3. Trong cuộc họp, đọc chat và bỏ phiếu loại người bạn nghi (hoặc Skip).</p></div>
 <div class="card"><h3>🔪 Nếu bạn là Impostor</h3>
  <p>Rình lúc ai đó đi lẻ, đến gần (&lt; 2.2m) rồi bấm <kbd>Q</kbd> để kill — <b>1 lần mỗi round</b>.<br>
  Bấm <kbd>E</kbd> ở lỗ thông gió để chui vent đi tắt. Giả vờ làm nhiệm vụ, rồi đổ lỗi cho người khác khi họp.</p></div>
 <div class="card"><h3>🎮 Điều khiển</h3>
  <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> di chuyển theo hướng nhìn · <b>chuột</b> xoay camera (click vào màn hình để khoá chuột)<br><kbd>V</kbd> đổi góc nhìn: thứ 3 / thứ 1 / từ trên xuống · lăn chuột để zoom<br>
  <kbd>Space</kbd> nhảy · <kbd>E</kbd> tương tác (nhiệm vụ / báo xác / vent / họp khẩn ở bàn tròn giữa map)<br>
  <kbd>Q</kbd> kill (chỉ Impostor)</p>
  <p class="dim">Tầm nhìn có giới hạn: bạn chỉ thấy người nằm trong vùng sáng, không bị tường chắn.</p></div>
 <div class="card"><h3>🔁 Một vòng chơi (round)</h3>
  <p>Đi lại & làm nhiệm vụ → có xác hoặc ai đó bấm họp → <b>họp & bỏ phiếu kín</b> → 1 người bị loại (hoặc không ai) → round mới, cho đến khi có bên thắng.<br>
  Nút <b>🏁 Kiểm tra thắng</b> (góc phải dưới) hỏi hợp đồng xem đã có bên thắng chưa.</p></div>
 <div class="card"><h3>🔐 Vì sao dùng blockchain?</h3>
  <p>Vai trò, mục tiêu kill, phiếu bầu và tiến độ nhiệm vụ nằm <b>mã hoá</b> trên Sepolia (Zama FHE): ngay cả người xem giao dịch cũng không biết ai là Impostor. Chỉ vị trí di chuyển và chat chạy trên máy bạn.</p></div>
</div>`;

/* ───────────── Bước 3: giải thích ví + kiểm tra môi trường ───────────── */

const connectHtml = () => `
<div class="rg two">
 <div class="card"><h3>🔗 Tại sao cần kết nối ví?</h3>
  <p>Game chạy trên <b>Sepolia</b> — mạng <b>thử nghiệm</b> của Ethereum. Ví (MetaMask) là “tài khoản” để ký các hành động: tạo phòng, làm nhiệm vụ, kill, bỏ phiếu.</p>
  <ul><li>💸 <b>Không dùng tiền thật.</b> Chỉ cần ETH Sepolia (miễn phí, tìm “Sepolia faucet”).</li>
  <li>⛽ Mỗi hành động tốn một chút gas ETH test; một ván cần khoảng <b>10–20 lần xác nhận</b> trong MetaMask.</li>
  <li>✍️ Một chữ ký không tốn gas để <b>giải mã vai trò</b> của bạn (chỉ bạn thấy được).</li>
  <li>🔑 Game <b>không bao giờ</b> hỏi seed phrase / khoá riêng của bạn.</li></ul></div>
 <div class="card"><h3>✅ Kiểm tra nhanh</h3>
  <p id="chk1">…</p><p id="chk2">…</p>
  <p class="dim">Mẹo: dùng ví riêng cho test, không dùng ví chứa tiền thật.</p>
  <button id="bPlay" class="big">🔗 Kết nối ví & Chơi Solo (1 + 3 Bot)</button>
  <div id="mlog"></div></div>
</div>`;

async function checkEnv() {
  const eth = (window as any).ethereum, c1 = $("#chk1"), c2 = $("#chk2");
  if (!eth) { c1.innerHTML = '❌ Chưa thấy ví. Cài <a href="https://metamask.io/download" target="_blank" rel="noopener">MetaMask</a> rồi tải lại trang.'; c2.textContent = ""; return; }
  c1.textContent = "✅ Đã phát hiện ví trên trình duyệt.";
  try {
    const id = await eth.request({ method: "eth_chainId" });
    c2.textContent = id === "0xaa36a7" ? "✅ Đang ở mạng Sepolia." : "⚠️ Chưa ở mạng Sepolia — game sẽ xin bạn chuyển mạng khi bấm Chơi.";
  } catch { c2.textContent = "ℹ️ Sẽ kiểm tra mạng khi bạn bấm Chơi."; }
}

/* ───────────── Khung điều hướng ───────────── */

export function initIntro(onPlay: () => void) {
  const ob = $("#ob");
  ob.innerHTML = `
  <div id="obTop"><span class="logo">🚀 Space Impostor</span>
   <nav id="obSteps"><b data-s="0">1 · Giới thiệu</b><b data-s="1">2 · Luật chơi</b><b data-s="2">3 · Vào chơi</b></nav></div>
  <section data-s="0">${trailerHtml()}</section>
  <section data-s="1"><h2>Luật chơi trong 1 phút</h2>${rulesHtml()}</section>
  <section data-s="2"><h2>Sẵn sàng vào game</h2>${connectHtml()}</section>
  <div id="obNav"><button id="obBack" class="g">← Quay lại</button><button id="obNext">Tiếp theo →</button></div>`;

  let step = 0;
  const set = (n: number) => {
    step = Math.max(0, Math.min(2, n));
    ob.querySelectorAll<HTMLElement>("section").forEach((s) => (s.style.display = +s.dataset.s! === step ? "block" : "none"));
    ob.querySelectorAll<HTMLElement>("#obSteps b").forEach((b) => b.classList.toggle("a", +b.dataset.s! === step));
    $("#obBack").style.visibility = step === 0 ? "hidden" : "visible";
    $("#obNext").style.display = step === 2 ? "none" : "";
    $("#obNext").textContent = step === 0 ? "Xem luật chơi →" : "Tôi đã hiểu, tiếp →";
    if (step === 2) { store.set(); void checkEnv(); }
    ob.scrollTop = 0;
  };
  ob.querySelector("#obSteps")!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("b"); if (b) set(+b.dataset.s!); });
  $("#obBack").onclick = () => set(step - 1); $("#obNext").onclick = () => set(step + 1);
  $("#bPlay").onclick = onPlay;
  trailer();
  set(store.get() ? 2 : 0); // lần sau vào thẳng bước 3 (vẫn bấm “1 · Giới thiệu” để xem lại)
}

/** Nút ❓ trong game: hiện lại luật chơi (game không tạm dừng). */
export function initHowTo() {
  $("#howto").innerHTML = `<div class="pn wide"><h2>❓ Cách chơi</h2>${rulesHtml()}<button id="hx" class="g">Đóng (game vẫn chạy)</button></div>`;
  $("#bHelp").onclick = () => ($("#howto").style.display = "flex");
  $("#hx").onclick = () => ($("#howto").style.display = "none");
}
