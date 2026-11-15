import { $ } from "./dom";
import { initStage } from "./introStage";
import { t, LANGS, locale, chooseLang, type Lang } from "../i18n";
import "../i18n/packs";

/**
 * Intro screen for new players, 3 steps:  1) Animated trailer  2) Rules  3) Connect wallet & play.
 * Nothing touches the blockchain until the player presses the button in step 3.
 * Mọi chữ lấy từ i18n (src/i18n/packs/*); thanh chọn ngôn ngữ ở góc trên (như game tham khảo).
 */

const SEEN_KEY = "si_intro_seen";
const store = {
  get: () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } },
  set: () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } },
};

/* ───────────── Trailer: 6 cảnh 3D tự chạy (nhân vật thật của game — xem introStage.ts) + chữ đè lên ───────────── */

const scenes = (): { title: string; cap: string; ov: string }[] => [
  { title: t("sc.0.title"), cap: t("sc.0.cap"), ov: `<div class="o-head">${t("sc.0.head")}</div>` },
  {
    title: t("sc.1.title"), cap: t("sc.1.cap"),
    ov: `<div class="o-head">${t("sc.1.head")}</div>
      <div class="o-pills">${[0, 1, 2].map((i) => `<span class="o-pill"><i style="--d:${i + 1}"></i></span>`).join("")}</div>
      <div class="o-sm">${t("sc.1.sm")}</div>`,
  },
  {
    title: t("sc.2.title"), cap: t("sc.2.cap"),
    ov: `<div class="o-head">${t("sc.2.head")}</div>
      <div class="o-banner pop" style="--d:1.2">${t("sc.2.banner")}</div>`,
  },
  { title: t("sc.3.title"), cap: t("sc.3.cap"), ov: `<div class="o-flash"></div><div class="o-head o-siren">🚨</div>` },
  {
    title: t("sc.4.title"), cap: t("sc.4.cap"),
    ov: `<div class="o-head">🔥🗳</div>
      <div class="o-banner pop" style="--d:3.2">${t("sc.4.banner")}</div>`,
  },
  {
    title: t("sc.5.title"), cap: t("sc.5.cap"),
    ov: `<div class="o-win o-g"><b>${t("sc.5.crewT")}</b><span>${t("sc.5.crewA")}</span><span>${t("sc.5.or")}</span><span>${t("sc.5.crewB")}</span></div>
      <div class="o-win o-r"><b>${t("sc.5.spyT")}</b><span>${t("sc.5.spyA")}</span><span>${t("sc.5.spyB")}</span><span>${t("sc.5.spyC")}</span></div>`,
  },
];

const trailerHtml = (S: ReturnType<typeof scenes>) => `
<div class="tv">
 <div class="stage3d"><canvas id="stageCv" aria-label="Game trailer (3D)"></canvas>
  ${S.map((s, i) => `<div class="scene ov" data-i="${i}">${s.ov}</div>`).join("")}
 </div>
 <div class="tbar"><i id="tprog"></i></div>
 <div class="tcap"><b id="ttl"></b><p id="tcap"></p></div>
 <div class="tctl">
  <button id="tprev" class="g">◀</button><button id="tpause" class="g">${t("intro.pause")}</button><button id="tnext" class="g">▶</button>
  <span id="tdots"></span>
 </div>
</div>`;

function trailer(S: ReturnType<typeof scenes>) {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".stage3d .scene"));
  const stage = initStage($("#stageCv") as HTMLCanvasElement, () => $("#menu").style.display !== "none" && ($("#stageCv") as HTMLElement).offsetParent !== null);
  const dots = $("#tdots"); dots.innerHTML = S.map((_, i) => `<u data-i="${i}"></u>`).join("");
  let cur = -1, paused = false, tt = 0; const DUR = 6.5;
  const go = (n: number) => {
    cur = (n + S.length) % S.length; tt = 0;
    els.forEach((s) => s.classList.remove("on"));
    void els[cur].getBoundingClientRect(); // force reflow so the animation restarts from the beginning
    els[cur].classList.add("on");
    stage?.setScene(cur);
    $("#ttl").textContent = `${cur + 1}/${S.length} · ${S[cur].title}`; $("#tcap").textContent = S[cur].cap;
    dots.querySelectorAll("u").forEach((d, i) => d.classList.toggle("a", i === cur));
  };
  $("#tprev").onclick = () => go(cur - 1); $("#tnext").onclick = () => go(cur + 1);
  $("#tpause").onclick = () => { paused = !paused; stage?.pause(paused); $("#tpause").textContent = paused ? t("intro.resume") : t("intro.pause"); };
  dots.onclick = (e) => { const d = (e.target as HTMLElement).closest("u"); if (d) go(+(d as HTMLElement).dataset.i!); };
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1e3; last = now;
    if (paused || document.hidden || ($("#menu").style.display === "none")) return;
    tt += dt; $("#tprog").style.width = Math.min(100, (tt / DUR) * 100) + "%";
    if (tt >= DUR) go(cur + 1);
  }, 100);
  go(0);
}

/* ───────────── Rules (used both in the menu and in game) ───────────── */

export const rulesHtml = () => `
<div class="rg">
 ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<div class="card"><h3>${t(`rules.${n}.h`)}</h3>${t(`rules.${n}.b`)}</div>`).join("\n ")}
</div>`;


/* ───────────── Step 3: wallet explanation + environment check ───────────── */

const connectHtml = () => `
<div class="rg two">
 <div class="card"><h3>${t("conn.why.h")}</h3>${t("conn.why.b")}</div>
 <div class="card"><h3>${t("conn.chk.h")}</h3>
  <p id="chk1">…</p><p id="chk2">…</p>
  <p class="dim">${t("conn.tip")}</p>
  <button id="bPlay" class="big">${t("conn.play")}</button>
  <button id="bPvp" class="big g">👥 Multiplayer table (PvP) · optional cUSDT stake</button>
  <div id="mlog"></div></div>
</div>`;


async function checkEnv() {
  const eth = (window as any).ethereum, c1 = $("#chk1"), c2 = $("#chk2");
  if (!eth) { c1.innerHTML = t("chk.none"); c2.textContent = ""; return; }
  c1.textContent = t("chk.ok");
  try {
    const id = await eth.request({ method: "eth_chainId" });
    c2.textContent = id === "0xaa36a7" ? t("chk.sep") : t("chk.notsep");
  } catch { c2.textContent = t("chk.later"); }
}

/* ───────────── Thanh chọn ngôn ngữ (bấm → lưu → tải lại; lính đại diện đổi theo quốc gia) ───────────── */

const langBar = () => `<div id="lg" title="${t("intro.lang")}">${LANGS.map(([c, n, f]) => `<button class="lb${c === locale.lang ? " on" : ""}" data-l="${c}">${f} ${n}</button>`).join("")}</div>`;

/* ───────────── Navigation frame ───────────── */

export function initIntro(onPlay: () => void, onPvp?: () => void) {
  const ob = $("#ob"), S = scenes();
  ob.innerHTML = `
  <div id="obTop"><span class="logo">🪂 Lost Island</span>
   <nav id="obSteps"><b data-s="0">${t("intro.step0")}</b><b data-s="1">${t("intro.step1")}</b><b data-s="2">${t("intro.step2")}</b></nav></div>
  ${langBar()}
  <section data-s="0">${trailerHtml(S)}</section>
  <section data-s="1"><h2>${t("intro.rulesH")}</h2>${rulesHtml()}</section>
  <section data-s="2"><h2>${t("intro.playH")}</h2>${connectHtml()}</section>
  <div id="obNav"><button id="obBack" class="g">${t("intro.back")}</button><button id="obNext">${t("intro.next0")}</button></div>`;

  ob.querySelector("#lg")!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".lb"); if (b) chooseLang(b.dataset.l as Lang); });

  let step = 0;
  const set = (n: number) => {
    step = Math.max(0, Math.min(2, n));
    try { sessionStorage.setItem("si_stepnow", String(step)); } catch { /* bỏ qua */ }
    ob.querySelectorAll<HTMLElement>("section").forEach((s) => (s.style.display = +s.dataset.s! === step ? "block" : "none"));
    ob.querySelectorAll<HTMLElement>("#obSteps b").forEach((b) => b.classList.toggle("a", +b.dataset.s! === step));
    $("#obBack").style.visibility = step === 0 ? "hidden" : "visible";
    $("#obNext").style.display = step === 2 ? "none" : "";
    $("#obNext").textContent = step === 0 ? t("intro.next0") : t("intro.next1");
    if (step === 2) { store.set(); void checkEnv(); }
    ob.scrollTop = 0;
  };
  ob.querySelector("#obSteps")!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("b"); if (b) set(+b.dataset.s!); });
  $("#obBack").onclick = () => set(step - 1); $("#obNext").onclick = () => set(step + 1);
  $("#bPlay").onclick = onPlay;
  $("#bPvp").onclick = () => onPvp?.();
  trailer(S);
  // sau khi đổi ngôn ngữ (tải lại trang) thì quay lại đúng bước đang xem; lần sau: nhảy thẳng tới bước 3 (bấm “1 · Intro” để xem lại)
  let back = -1; try { back = Number(sessionStorage.getItem("si_step") ?? -1); sessionStorage.removeItem("si_step"); } catch { /* bỏ qua */ }
  set(back >= 0 && back <= 2 ? back : store.get() ? 2 : 0);
}

/** The ❓ button in game: shows the rules again (the game does not pause). */
export function initHowTo() {
  $("#howto").innerHTML = `<div class="pn wide"><h2>${t("howto.h")}</h2>${rulesHtml()}<button id="hx" class="g">${t("howto.close")}</button></div>`;
  $("#bHelp").onclick = () => ($("#howto").style.display = "flex");
  $("#hx").onclick = () => ($("#howto").style.display = "none");
}
