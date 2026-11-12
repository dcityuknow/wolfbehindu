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
    title: "Rơi xuống đảo hoang",
    cap: "Biệt đội ALPHA nhảy dù xuống vùng nhiệm vụ mật thì bị bão cuốn đi, đáp xuống một hòn đảo hoang giữa biển. Mất liên lạc, không ai biết họ ở đâu.",
    svg: `<text x="320" y="54" class="t big">🪂 Đảo hoang</text>
      ${[RED, BLUE, GREEN, YEL].map((c, i) => `<g class="walk" style="--d:${i}">${A(110 + i * 120, 168, c, 'class="bob"')}</g>`).join("")}
      <text x="140" y="150" class="t sm" fill="#fff">BẠN</text><path d="M140 156 l-6 -8 h12z" fill="#fff"/>`,
  },
  {
    title: "Nhiệm vụ sinh tồn",
    cap: "Mỗi người làm 3 nhiệm vụ ở các trạm cam nhấp nháy: sửa radio, giải mã bản tin mật, nhóm lửa tín hiệu, lọc nước biển, thu hồi kiện tiếp tế. Làm xong cả nhóm là được cứu!",
    svg: `<rect x="400" y="150" width="110" height="112" rx="12" fill="#5a3a1a"/>
      <rect x="414" y="164" width="82" height="50" rx="6" class="screen"/>
      <text x="455" y="196" class="t sm" fill="#241500">E · nhiệm vụ</text>
      ${A(300, 172, BLUE, 'class="bob"')}
      <text x="200" y="60" class="t big">Sinh tồn</text>
      ${[0, 1, 2].map((i) => `<rect x="${236 + i * 56}" y="82" width="46" height="18" rx="9" fill="#222"/><rect class="pb" style="--d:${i + 1}" x="${236 + i * 56}" y="82" width="46" height="18" rx="9" fill="#4f8"/>`).join("")}
      <text x="320" y="124" class="t sm">3 nhiệm vụ / người</text>`,
  },
  {
    title: "Một gián điệp ẩn mình",
    cap: "Trong 7 người có 1 gián điệp được cài từ trước — có thể chính là bạn! Vai trò chia ngẫu nhiên và mã hoá bằng Zama FHE: chỉ bạn thấy vai của mình.",
    svg: `<text x="320" y="48" class="t big">🔐 Vai trò được mã hoá</text>
      ${[BLUE, RED, GREEN, YEL].map((c, i) => `${A(110 + i * 120, 150, c, 'class="bob"')}<text x="${140 + i * 120}" y="140" class="t big q" style="--d:${i}">?</text>`).join("")}
      <g class="pop" style="--d:1.2"><rect x="60" y="64" width="270" height="34" rx="17" fill="#3b4160"/><text x="195" y="86" class="t sm" fill="#5f9">Chỉ bạn thấy: BIỆT KÍCH 🎖</text></g>
      <text x="140" y="262" class="t sm" fill="#fff">BẠN</text>`,
  },
  {
    title: "Ám sát & báo cáo thi thể",
    cap: "Gián điệp lén ám sát người đi lẻ (phím Q, tối đa 1 lần mỗi lượt). Ai thấy thi thể bấm E để báo cáo và triệu tập họp khẩn.",
    svg: `<text x="320" y="48" class="t big siren">🚨</text>
      <g class="slide">${A(110, 170, RED, 'class="bob"')}</g>
      <g class="fall">${A(380, 170, BLUE)}</g>
      <rect class="flash" x="0" y="0" width="640" height="300" fill="#f00"/>
      <text x="480" y="200" class="t big stab">🔪</text>`,
  },
  {
    title: "Họp quanh lửa trại",
    cap: "Cả đội họp quanh đống lửa, tranh luận rồi bỏ phiếu kín. Phiếu được mã hoá on-chain — không ai biết bạn bỏ cho ai. Người bị nhiều phiếu nhất bị loại khỏi đội.",
    svg: `<ellipse cx="320" cy="214" rx="190" ry="40" fill="#8a5a2e"/>
      ${A(120, 110, BLUE, "", 0.8)}${A(230, 110, GREEN, "", 0.8)}${A(340, 110, YEL, "", 0.8)}
      <g class="eject">${A(450, 110, RED, "", 0.8)}</g>
      <text x="320" y="224" class="t big">🔥🗳</text>
      <text x="150" y="70" class="t sm vote" style="--d:0">✉</text><text x="260" y="70" class="t sm vote" style="--d:1">✉</text><text x="370" y="70" class="t sm vote" style="--d:2">✉</text>
      <text x="320" y="270" class="t sm pop" style="--d:2.4" fill="#5f9">Bị loại: ĐÚNG là gián điệp! 🎯</text>`,
  },
  {
    title: "Ai được sống sót?",
    cap: "Sẵn sàng chưa? Bấm “Luật chơi” để xem điều khiển, hoặc xuất phát ngay. Cutscene mở đầu sẽ phát khi bạn vào game.",
    svg: `<rect x="40" y="40" width="270" height="210" rx="14" fill="#1f3a22"/><rect x="330" y="40" width="270" height="210" rx="14" fill="#5a1a1a"/>
      <text x="175" y="78" class="t big" fill="#5f9">🎖 BIỆT KÍCH THẮNG</text>
      <text x="175" y="130" class="t sm">✔ Bỏ phiếu loại đúng gián điệp</text>
      <text x="175" y="160" class="t sm">hoặc</text>
      <text x="175" y="190" class="t sm">✔ Cả đội làm xong nhiệm vụ</text>
      <text x="465" y="78" class="t big" fill="#f66">🕵 GIÁN ĐIỆP THẮNG</text>
      <text x="465" y="130" class="t sm">✔ Ám sát đến khi số biệt kích</text>
      <text x="465" y="160" class="t sm">còn sống ≤ số gián điệp</text>
      <text x="465" y="190" class="t sm">(1 biệt kích + 1 gián điệp là đủ)</text>`,
  },
];

const trailerHtml = () => `
<svg width="0" height="0" style="position:absolute"><defs>
 <symbol id="astro" viewBox="0 0 60 90">
  <rect x="13" y="62" width="14" height="24" rx="6" fill="#2c3320"/><rect x="33" y="62" width="14" height="24" rx="6" fill="#2c3320"/>
  <rect x="7" y="34" width="46" height="36" rx="14" fill="#4b5a2c"/><rect x="7" y="40" width="14" height="12" rx="3" fill="var(--c)"/><rect x="21" y="52" width="18" height="10" rx="3" fill="#000" opacity=".25"/>
  <circle cx="30" cy="28" r="17" fill="#e0b48a"/><path d="M10 26 a20 18 0 0 1 40 0 z" fill="#5a6b34"/><rect x="8" y="24" width="44" height="6" rx="3" fill="#46552a"/>
  <rect x="22" y="31" width="4" height="4" rx="2" fill="#222"/><rect x="34" y="31" width="4" height="4" rx="2" fill="#222"/>
 </symbol></defs></svg>
<div class="tv">
 <svg viewBox="0 0 640 300" class="stage" role="img" aria-label="Trailer giới thiệu game">
  <defs><linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16294a"/><stop offset="1" stop-color="#e59a62"/></linearGradient></defs><rect width="640" height="300" fill="url(#tsky)"/><circle cx="540" cy="215" r="26" fill="#ffe9a8"/><rect y="236" width="640" height="26" fill="#2aa6c8"/>
  <rect y="262" width="640" height="38" fill="#cfb87c"/><rect y="260" width="640" height="3" fill="#efe0aa"/>
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
 <div class="card"><h3>🎯 Bối cảnh & mục tiêu</h3>
  <p>Biệt đội ALPHA bị bão cuốn khỏi vùng nhảy dù và mắc kẹt trên đảo hoang, mất liên lạc. Bạn chơi cùng <b>6 đồng đội Bot</b>. Trong 7 người có <b>1 gián điệp</b> (ngẫu nhiên, có thể là bạn).</p>
  <p><b style="color:#5f9">Biệt kích thắng</b> nếu loại đúng gián điệp <i>hoặc</i> cả đội làm xong nhiệm vụ sinh tồn.<br>
  <b style="color:#f66">Gián điệp thắng</b> khi số biệt kích còn sống ≤ số gián điệp.</p></div>
 <div class="card"><h3>🎖 Nếu bạn là Biệt kích</h3>
  <p>1. Tìm <b style="color:#fa3">trạm cam nhấp nháy</b>, đứng gần và bấm <kbd>E</kbd> để làm nhiệm vụ: 📻 sửa radio · 🔐 giải mã bản tin · 🔥 nhóm lửa tín hiệu · 💧 lọc nước · 📦 thu hồi kiện tiếp tế (mỗi người làm 3).<br>
  2. Thấy thi thể? Đến gần bấm <kbd>E</kbd> để báo cáo.<br>
  3. Họp quanh lửa trại: đọc chat, đối chiếu lời khai rồi bỏ phiếu loại người bạn nghi (hoặc bỏ qua).</p></div>
 <div class="card"><h3>🕵 Nếu bạn là Gián điệp</h3>
  <p>Rình lúc ai đó đi lẻ, đến gần (&lt; 2.2m) rồi bấm <kbd>Q</kbd> để ám sát — <b>1 lần mỗi lượt</b>.<br>
  Bấm <kbd>E</kbd> ở hang bí mật (hố đá có đốm sáng xanh) để chui sang hang khác. Làm nhiệm vụ giả để giữ vỏ bọc, rồi đổ lỗi cho người khác khi họp.</p></div>
 <div class="card"><h3>🎮 Điều khiển</h3>
  <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> di chuyển theo hướng nhìn · <b>chuột</b> xoay camera (click vào màn hình để khoá chuột)<br><kbd>V</kbd> đổi góc nhìn: thứ 3 / thứ 1 / từ trên xuống · lăn chuột để zoom<br>
  <kbd>Space</kbd> nhảy · <kbd>E</kbd> tương tác (nhiệm vụ / báo thi thể / hang bí mật / họp khẩn ở lửa trại giữa đảo)<br>
  <kbd>Q</kbd> ám sát (chỉ gián điệp)<br><b>Súng:</b> <kbd>Chuột trái</kbd> bắn · <kbd>Chuột phải</kbd> ngắm · <kbd>R</kbd> nạp đạn · <kbd>G</kbd> ném lựu đạn · <kbd>1</kbd>–<kbd>4</kbd> đổi súng (lăn chuột ở góc 1/từ trên)<br>Bắn trúng đồng đội: họ <b>hét lên, chất vấn và chĩa súng lại</b>. Bắn nhầm lần nữa là bị <b>gán gián điệp — cả đội bắn bạn</b>. Chỉ <b>gián điệp</b> hạ gục thật (1 lần/lượt, dùng chung với <kbd>Q</kbd>).</p>
  <p class="dim">Tầm nhìn có giới hạn: bạn chỉ thấy người trong vùng sáng và không bị đá, nhà, bụi rậm che. Không ai đi xuống biển được.</p></div>
 <div class="card"><h3>🔁 Một lượt chơi</h3>
  <p>Đi lại & làm nhiệm vụ → có thi thể hoặc ai đó triệu tập họp → <b>họp & bỏ phiếu kín</b> → 1 người bị loại khỏi đội (hoặc không ai) → lượt mới, cho đến khi có bên thắng.<br>
  Nút <b>🏁 Kiểm tra chiến dịch</b> (góc phải dưới) hỏi hợp đồng xem đã có bên thắng chưa.</p></div>
 <div class="card"><h3>🔐 Vì sao dùng blockchain?</h3>
  <p>Vai trò, mục tiêu ám sát, phiếu bầu và tiến độ nhiệm vụ nằm <b>mã hoá</b> trên Sepolia (Zama FHE): ngay cả người xem giao dịch cũng không biết ai là gián điệp. Chỉ vị trí di chuyển và chat chạy trên máy bạn.</p></div>
</div>`;

/* ───────────── Bước 3: giải thích ví + kiểm tra môi trường ───────────── */

const connectHtml = () => `
<div class="rg two">
 <div class="card"><h3>🔗 Tại sao cần kết nối ví?</h3>
  <p>Game chạy trên <b>Sepolia</b> — mạng <b>thử nghiệm</b> của Ethereum. Ví (MetaMask) là “tài khoản” để ký các hành động: tạo phòng, làm nhiệm vụ, ám sát, bỏ phiếu.</p>
  <ul><li>💸 <b>Không dùng tiền thật.</b> Chỉ cần ETH Sepolia (miễn phí, tìm “Sepolia faucet”).</li>
  <li>⛽ Mỗi hành động tốn một chút gas ETH test; một ván cần khoảng <b>10–20 lần xác nhận</b> trong MetaMask.</li>
  <li>✍️ Một chữ ký không tốn gas để <b>giải mã vai trò</b> của bạn (chỉ bạn thấy được).</li>
  <li>🔑 Game <b>không bao giờ</b> hỏi seed phrase / khoá riêng của bạn.</li></ul></div>
 <div class="card"><h3>✅ Kiểm tra nhanh</h3>
  <p id="chk1">…</p><p id="chk2">…</p>
  <p class="dim">Mẹo: dùng ví riêng cho test, không dùng ví chứa tiền thật.</p>
  <button id="bPlay" class="big">🔗 Kết nối ví & Xuất phát (1 + 6 đồng đội Bot)</button>
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
  <div id="obTop"><span class="logo">🪂 Lost Island</span>
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
