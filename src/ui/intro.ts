import { $ } from "./dom";

/**
 * Intro screen for new players, 3 steps:  1) Animated trailer  2) Rules  3) Connect wallet & play.
 * Nothing touches the blockchain until the player presses the button in step 3.
 */

const SEEN_KEY = "si_intro_seen";
const store = {
  get: () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } },
  set: () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } },
};

/* ───────────── Trailer: 6 self-playing SVG scenes ───────────── */

const A = (x: number, y: number, c: string, extra = "", s = 1) =>
  `<g ${extra}><use href="#astro" x="${x}" y="${y}" width="${60 * s}" height="${90 * s}" style="--c:${c}"/></g>`;
const BLUE = "#4da6ff", RED = "#ff4d4d", GREEN = "#4dff88", YEL = "#ffd24d";

const SCENES: { title: string; cap: string; svg: string }[] = [
  {
    title: "Stranded on a desert island",
    cap: "ALPHA Squad parachutes toward a secret mission zone, but a storm sweeps them away and drops them on a desert island in the middle of the sea. Contact lost — nobody knows where they are.",
    svg: `<text x="320" y="54" class="t big">🪂 Desert island</text>
      ${[RED, BLUE, GREEN, YEL].map((c, i) => `<g class="walk" style="--d:${i}">${A(110 + i * 120, 168, c, 'class="bob"')}</g>`).join("")}
      <text x="140" y="150" class="t sm" fill="#fff">YOU</text><path d="M140 156 l-6 -8 h12z" fill="#fff"/>`,
  },
  {
    title: "Survival tasks",
    cap: "Everyone completes 3 tasks at the blinking orange stations: repair the radio, decrypt the secret message, light the signal fire, purify sea water, recover the supply crate. Finish them as a team and you are rescued!",
    svg: `<rect x="400" y="150" width="110" height="112" rx="12" fill="#5a3a1a"/>
      <rect x="414" y="164" width="82" height="50" rx="6" class="screen"/>
      <text x="455" y="196" class="t sm" fill="#241500">E · task</text>
      ${A(300, 172, BLUE, 'class="bob"')}
      <text x="200" y="60" class="t big">Survival</text>
      ${[0, 1, 2].map((i) => `<rect x="${236 + i * 56}" y="82" width="46" height="18" rx="9" fill="#222"/><rect class="pb" style="--d:${i + 1}" x="${236 + i * 56}" y="82" width="46" height="18" rx="9" fill="#4f8"/>`).join("")}
      <text x="320" y="124" class="t sm">3 tasks / person</text>`,
  },
  {
    title: "A hidden spy",
    cap: "One of the 7 is a spy planted in advance — it could be you! Roles are assigned randomly and encrypted with Zama FHE: only you can see your own role.",
    svg: `<text x="320" y="48" class="t big">🔐 Roles are encrypted</text>
      ${[BLUE, RED, GREEN, YEL].map((c, i) => `${A(110 + i * 120, 150, c, 'class="bob"')}<text x="${140 + i * 120}" y="140" class="t big q" style="--d:${i}">?</text>`).join("")}
      <g class="pop" style="--d:1.2"><rect x="60" y="64" width="270" height="34" rx="17" fill="#3b4160"/><text x="195" y="86" class="t sm" fill="#5f9">Only you see: COMMANDO 🎖</text></g>
      <text x="140" y="262" class="t sm" fill="#fff">YOU</text>`,
  },
  {
    title: "Assassination & body reports",
    cap: "The spy secretly assassinates anyone who wanders off alone (Q key, at most once per round). Whoever finds a body must run to the campfire and sit down (E) to call the meeting; everyone then has 30 s to reach the fire — whoever does not show up is branded the spy.",
    svg: `<text x="320" y="48" class="t big siren">🚨</text>
      <g class="slide">${A(110, 170, RED, 'class="bob"')}</g>
      <g class="fall">${A(380, 170, BLUE)}</g>
      <rect class="flash" x="0" y="0" width="640" height="300" fill="#f00"/>
      <text x="480" y="200" class="t big stab">🔪</text>`,
  },
  {
    title: "Meeting around the campfire",
    cap: "The squad gathers around the fire, argues, then votes in secret. Votes are encrypted on-chain — nobody knows who you voted for. The player with the most votes is ejected.",
    svg: `<ellipse cx="320" cy="214" rx="190" ry="40" fill="#8a5a2e"/>
      ${A(120, 110, BLUE, "", 0.8)}${A(230, 110, GREEN, "", 0.8)}${A(340, 110, YEL, "", 0.8)}
      <g class="eject">${A(450, 110, RED, "", 0.8)}</g>
      <text x="320" y="224" class="t big">🔥🗳</text>
      <text x="150" y="70" class="t sm vote" style="--d:0">✉</text><text x="260" y="70" class="t sm vote" style="--d:1">✉</text><text x="370" y="70" class="t sm vote" style="--d:2">✉</text>
      <text x="320" y="270" class="t sm pop" style="--d:2.4" fill="#5f9">Ejected: it WAS the spy! 🎯</text>`,
  },
  {
    title: "Who survives?",
    cap: "Ready? Open “Rules” to see the controls, or jump right in. The opening cutscene plays when you enter the game.",
    svg: `<rect x="40" y="40" width="270" height="210" rx="14" fill="#1f3a22"/><rect x="330" y="40" width="270" height="210" rx="14" fill="#5a1a1a"/>
      <text x="175" y="78" class="t big" fill="#5f9">🎖 COMMANDOS WIN</text>
      <text x="175" y="130" class="t sm">✔ Vote out the real spy</text>
      <text x="175" y="160" class="t sm">or</text>
      <text x="175" y="190" class="t sm">✔ The squad finishes its tasks</text>
      <text x="465" y="78" class="t big" fill="#f66">🕵 THE SPY WINS</text>
      <text x="465" y="130" class="t sm">✔ Assassinate until living commandos</text>
      <text x="465" y="160" class="t sm">≤ number of living spies</text>
      <text x="465" y="190" class="t sm">(1 commando + 1 spy is enough)</text>`,
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
 <svg viewBox="0 0 640 300" class="stage" role="img" aria-label="Game trailer">
  <defs><linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16294a"/><stop offset="1" stop-color="#e59a62"/></linearGradient></defs><rect width="640" height="300" fill="url(#tsky)"/><circle cx="540" cy="215" r="26" fill="#ffe9a8"/><rect y="236" width="640" height="26" fill="#2aa6c8"/>
  <rect y="262" width="640" height="38" fill="#cfb87c"/><rect y="260" width="640" height="3" fill="#efe0aa"/>
  ${SCENES.map((s, i) => `<g class="scene" data-i="${i}">${s.svg}</g>`).join("")}
 </svg>
 <div class="tbar"><i id="tprog"></i></div>
 <div class="tcap"><b id="ttl"></b><p id="tcap"></p></div>
 <div class="tctl">
  <button id="tprev" class="g">◀</button><button id="tpause" class="g">⏸ Pause</button><button id="tnext" class="g">▶</button>
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
    void scenes[cur].getBoundingClientRect(); // force reflow so the animation restarts from the beginning
    scenes[cur].classList.add("on");
    $("#ttl").textContent = `${cur + 1}/${SCENES.length} · ${SCENES[cur].title}`; $("#tcap").textContent = SCENES[cur].cap;
    dots.querySelectorAll("u").forEach((d, i) => d.classList.toggle("a", i === cur));
  };
  $("#tprev").onclick = () => go(cur - 1); $("#tnext").onclick = () => go(cur + 1);
  $("#tpause").onclick = () => { paused = !paused; $("#tpause").textContent = paused ? "▶ Play" : "⏸ Pause"; };
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

/* ───────────── Rules (used both in the menu and in game) ───────────── */

export const rulesHtml = () => `
<div class="rg">
 <div class="card"><h3>🎯 Story & goal</h3>
  <p>ALPHA Squad was blown off its drop zone by a storm and is stranded on a desert island with no contact. You play alongside <b>6 Bot squadmates</b>. Among the 7 of you is <b>1 spy</b> (random — it may be you).</p>
  <p><b style="color:#5f9">Commandos win</b> by ejecting the real spy <i>or</i> by finishing every survival task.<br>
  <b style="color:#f66">The spy wins</b> when living commandos ≤ living spies.</p></div>
 <div class="card"><h3>🎖 If you are a Commando</h3>
  <p>1. Find a <b style="color:#fa3">blinking orange station</b>, stand close and press <kbd>E</kbd> to do a task: 📻 repair the radio · 🔐 decrypt the message · 🔥 light the signal fire · 💧 purify water · 📦 recover the supply crate (3 per person).<br>
  2. Found a body? Run to the campfire and press <kbd>E</kbd> to sit down — that calls the meeting. Everyone has <b>30 s</b> to reach the fire and sit; anyone who stays away is branded the spy.<br>
  3. At the campfire meeting: read the chat, compare stories, then vote out whoever you suspect (or skip).</p></div>
 <div class="card"><h3>🕵 If you are the Spy</h3>
  <p>Wait for someone to wander off alone, get close (&lt; 2.2 m) and press <kbd>Q</kbd> to assassinate — <b>once per round</b>.<br>
  Press <kbd>E</kbd> at a secret burrow (rock hole with a green glow) to pop out of another one. Fake tasks to keep your cover, then shift the blame during meetings.</p></div>
 <div class="card"><h3>🎮 Controls</h3>
  <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move in the direction you look · <b>mouse</b> rotates the camera (click the screen to lock the mouse)<br><kbd>V</kbd> change view: 3rd person / 1st person / top-down · scroll to zoom<br>
  <kbd>Space</kbd> jump · <kbd>E</kbd> interact (tasks / secret burrow / sit at the central campfire to call or join a meeting)<br>
  <kbd>Q</kbd> assassinate (spy only)<br><b>Guns:</b> <kbd>Left click</kbd> shoot · <kbd>Right click</kbd> aim · <kbd>R</kbd> reload · <kbd>G</kbd> throw grenade · <kbd>1</kbd>–<kbd>4</kbd> switch weapon (scroll wheel in 1st person / top-down)</p>
  <p class="dim">Vision is limited: you only see players inside the lit area and not hidden behind rocks, buildings or bushes. Nobody can walk into the sea.</p></div>
 <div class="card"><h3>💥 Friendly fire is REAL</h3>
  <p>Shoot a teammate until they <b>drop</b> and they are <b>dead for good</b> — recorded on the contract, no reviving. Only squadmates who actually <b>SEE you do it</b> (close enough, facing you, no wall between) will yell <b>“WHY YOU SHOT ME??”</b> and <b>aim back at you</b>. Everyone else just runs over to the victim and asks what happened — <b>no witness, no accusation</b>. A witnessed shot <b>again</b> and the squad marks you as the spy and <b>opens fire</b>; the spy's real kills are exposed the same way if someone sees them.<br>
  If they gun you down, your death is <b>recorded on the smart contract</b> and the game ends <b>immediately</b> — even though the real spy was never found. Only the <b>spy</b> can truly kill (once per round, shared with <kbd>Q</kbd>). Think before you pull the trigger.</p></div>
 <div class="card"><h3>🔁 One round</h3>
  <p>Roam & do tasks → a body is found or someone calls a meeting → <b>meeting & secret vote</b> → 1 player is ejected (or nobody) → new round, until one side wins.<br>
  The <b>🏁 Check mission</b> button (bottom right) asks the contract whether anyone has won yet.</p></div>
 <div class="card"><h3>🔐 Why blockchain?</h3>
  <p>Roles, assassination targets, votes and task progress are <b>encrypted</b> on Sepolia (Zama FHE): even someone watching the transactions cannot tell who the spy is. Deaths — including being executed by your squad — are written to the contract. Only movement and chat run on your machine.</p></div>
</div>`;


/* ───────────── Step 3: wallet explanation + environment check ───────────── */

const connectHtml = () => `
<div class="rg two">
 <div class="card"><h3>🔗 Why connect a wallet?</h3>
  <p>The game runs on <b>Sepolia</b> — Ethereum's <b>test network</b>. Your wallet (MetaMask) is the “account” that signs your actions: create the room, do tasks, assassinate, vote.</p>
  <ul><li>💸 <b>No real money.</b> You only need Sepolia ETH (free — search “Sepolia faucet”).</li>
  <li>🔑 A throw-away <b>session wallet</b> is created in your browser and funded once with ~0.03 test-ETH. Starting a game is <b>one</b> transaction. It signs the bots\u2019 actions (bot turns, bot votes, tally) so MetaMask only asks you for <b>your own</b> actions. It can never act as you.</li>
  <li>⛽ Your own actions (tasks, kills, votes, deaths) still cost a little test-ETH gas and need your confirmation.</li>
  <li>✍️ One gas-free signature lets you <b>decrypt your role</b> (only you can see it).</li>
  <li>🔑 The game <b>never</b> asks for your seed phrase / private key.</li></ul></div>
 <div class="card"><h3>✅ Quick check</h3>
  <p id="chk1">…</p><p id="chk2">…</p>
  <p class="dim">Tip: use a separate wallet for testing, never one that holds real funds.</p>
  <button id="bPlay" class="big">🔗 Connect wallet & Deploy (you + 6 Bot squadmates)</button>
  <div id="mlog"></div></div>
</div>`;


async function checkEnv() {
  const eth = (window as any).ethereum, c1 = $("#chk1"), c2 = $("#chk2");
  if (!eth) { c1.innerHTML = '❌ No wallet found. Install <a href="https://metamask.io/download" target="_blank" rel="noopener">MetaMask</a> and reload the page.'; c2.textContent = ""; return; }
  c1.textContent = "✅ Wallet detected in your browser.";
  try {
    const id = await eth.request({ method: "eth_chainId" });
    c2.textContent = id === "0xaa36a7" ? "✅ You are on the Sepolia network." : "⚠️ Not on Sepolia yet — the game will ask you to switch networks when you press Play.";
  } catch { c2.textContent = "ℹ️ The network will be checked when you press Play."; }
}

/* ───────────── Navigation frame ───────────── */

export function initIntro(onPlay: () => void) {
  const ob = $("#ob");
  ob.innerHTML = `
  <div id="obTop"><span class="logo">🪂 Lost Island</span>
   <nav id="obSteps"><b data-s="0">1 · Intro</b><b data-s="1">2 · Rules</b><b data-s="2">3 · Play</b></nav></div>
  <section data-s="0">${trailerHtml()}</section>
  <section data-s="1"><h2>The rules in 1 minute</h2>${rulesHtml()}</section>
  <section data-s="2"><h2>Ready to play</h2>${connectHtml()}</section>
  <div id="obNav"><button id="obBack" class="g">← Back</button><button id="obNext">Next →</button></div>`;

  let step = 0;
  const set = (n: number) => {
    step = Math.max(0, Math.min(2, n));
    ob.querySelectorAll<HTMLElement>("section").forEach((s) => (s.style.display = +s.dataset.s! === step ? "block" : "none"));
    ob.querySelectorAll<HTMLElement>("#obSteps b").forEach((b) => b.classList.toggle("a", +b.dataset.s! === step));
    $("#obBack").style.visibility = step === 0 ? "hidden" : "visible";
    $("#obNext").style.display = step === 2 ? "none" : "";
    $("#obNext").textContent = step === 0 ? "See the rules →" : "Got it, next →";
    if (step === 2) { store.set(); void checkEnv(); }
    ob.scrollTop = 0;
  };
  ob.querySelector("#obSteps")!.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("b"); if (b) set(+b.dataset.s!); });
  $("#obBack").onclick = () => set(step - 1); $("#obNext").onclick = () => set(step + 1);
  $("#bPlay").onclick = onPlay;
  trailer();
  set(store.get() ? 2 : 0); // next time, jump straight to step 3 (click “1 · Intro” to watch again)
}

/** The ❓ button in game: shows the rules again (the game does not pause). */
export function initHowTo() {
  $("#howto").innerHTML = `<div class="pn wide"><h2>❓ How to play</h2>${rulesHtml()}<button id="hx" class="g">Close (game keeps running)</button></div>`;
  $("#bHelp").onclick = () => ($("#howto").style.display = "flex");
  $("#hx").onclick = () => ($("#howto").style.display = "none");
}
