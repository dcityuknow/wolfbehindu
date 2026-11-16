import { $ } from "./dom";
import { clipHtml, mountClips } from "./ruleStage";
import { walletDiagram } from "./walletDiagram";
import { t, LANGS, locale, chooseLang, type Lang } from "../i18n";
import "../i18n/packs";

/**
 * Intro screen for new players, 2 steps:  1) Intro & rules (one page: every rule card has a short clip made with the game's real 3D characters)  2) Connect wallet & play.
 * Nothing touches the blockchain until the player presses the button in step 3.
 * Mọi chữ lấy từ i18n (src/i18n/packs/*); thanh chọn ngôn ngữ ở góc trên (như game tham khảo).
 */

const SEEN_KEY = "si_intro_seen";
const store = {
  get: () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } },
  set: () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } },
};

/* ───────────── Rules (used both in the menu and in game) ───────────── */

export const rulesHtml = () => `
<div class="rg one">
 ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<div class="card">${clipHtml(n)}<div class="txt"><h3>${t(`rules.${n}.h`)}</h3>${t(`rules.${n}.b`)}</div></div>`).join("\n ")}
</div>`;


/* ───────────── Step 3: wallet explanation + environment check ───────────── */

const connectHtml = () => `
<div class="rg wal">
 ${walletDiagram()}
 <div class="card"><h3>${t("conn.chk.h")}</h3>
  <p id="chk1">…</p><p id="chk2">…</p>
  <p class="dim">${t("conn.tip")}</p>
  <button id="bPlay" class="big">${t("conn.play")}</button>
  <button id="bPvp" class="big g">${t("conn.pvp")}</button>
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

const stripNum = (s: string) => s.replace(/^\s*\d+\s*[·.\-:]\s*/, "");

export function initIntro(onPlay: () => void, onPvp?: () => void) {
  const ob = $("#ob");
  ob.innerHTML = `
  <div id="obTop"><span class="logo">🪂 Lost Island</span>
   <nav id="obSteps"><b data-s="0">1 · ${stripNum(t("intro.step0"))} &amp; ${stripNum(t("intro.step1"))}</b><b data-s="1">2 · ${stripNum(t("intro.step2"))}</b></nav></div>
  ${langBar()}
  <section data-s="0"><h2>${t("intro.rulesH")}</h2>${rulesHtml()}</section>
  <section data-s="1"><h2>${t("intro.playH")}</h2>${connectHtml()}</section>
  <div id="obNav"><button id="obBack" class="g">${t("intro.back")}</button><button id="obNext">${t("intro.next1")}</button></div>`;

  ob.querySelector("#lg")!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>(".lb"); if (b) chooseLang(b.dataset.l as Lang); });

  let step = 0;
  const set = (n: number) => {
    step = Math.max(0, Math.min(1, n));
    try { sessionStorage.setItem("si_stepnow", String(step)); } catch { /* bỏ qua */ }
    ob.querySelectorAll<HTMLElement>("section").forEach((s) => (s.style.display = +s.dataset.s! === step ? "block" : "none"));
    ob.querySelectorAll<HTMLElement>("#obSteps b").forEach((b) => b.classList.toggle("a", +b.dataset.s! === step));
    $("#obBack").style.visibility = step === 0 ? "hidden" : "visible";
    $("#obNext").style.display = step === 1 ? "none" : "";
    if (step === 1) { store.set(); void checkEnv(); }
    ob.scrollTop = 0;
  };
  ob.querySelector("#obSteps")!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("b"); if (b) set(+b.dataset.s!); });
  $("#obBack").onclick = () => set(step - 1); $("#obNext").onclick = () => set(step + 1);
  $("#bPlay").onclick = onPlay;
  $("#bPvp").onclick = () => onPvp?.();
  mountClips(ob);
  // sau khi đổi ngôn ngữ (tải lại trang) thì quay lại đúng bước đang xem; lần sau: nhảy thẳng tới bước chơi (bấm “1 · …” để xem lại luật)
  let back = -1; try { back = Number(sessionStorage.getItem("si_step") ?? -1); sessionStorage.removeItem("si_step"); } catch { /* bỏ qua */ }
  set(back >= 0 && back <= 1 ? back : store.get() ? 1 : 0);
}

/** The ❓ button in game: shows the rules again (the game does not pause). */
export function initHowTo() {
  $("#howto").innerHTML = `<div class="pn wide"><h2>${t("howto.h")}</h2>${rulesHtml()}<button id="hx" class="g">${t("howto.close")}</button></div>`;
  mountClips($("#howto"));
  $("#bHelp").onclick = () => ($("#howto").style.display = "flex");
  $("#hx").onclick = () => ($("#howto").style.display = "none");
}
