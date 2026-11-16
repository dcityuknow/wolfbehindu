import { ctx } from "../web3/context";
import * as P from "../web3/pvp";
import * as X from "../web3/extras";
import { hasModule, hasStats } from "../web3/modules";
import { sfx } from "../audio";

/** Cards and actions for the PvP table that come from the satellite contracts: table talk, last will, secret task bounty,
 *  bribes, prize-pool reveal and the leaderboard. Each card is hidden when its contract is not deployed. */
type View = Awaited<ReturnType<typeof P.roomView>>;
const UNIT = 1_000_000n;
const fmt = (v: bigint) => (Number(v) / Number(UNIT)).toLocaleString(undefined, { maximumFractionDigits: 6 });
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const me = () => ctx.account.toLowerCase();

export const XS = {
  chat: [] as X.ChatMsg[], seenChat: 0,
  willExists: new Set<number>(), wills: {} as Record<number, { suspect: number; text: string }>, canWill: false,
  bounty: null as null | { assigned: boolean; claimed: boolean }, task: null as number | null,
  offers: [] as X.BribeOffer[], pot: null as bigint | null,
};
export function resetExtras() {
  XS.chat = []; XS.seenChat = 0; XS.willExists = new Set(); XS.wills = {}; XS.canWill = false; XS.bounty = null; XS.task = null; XS.offers = []; XS.pot = null;
}

/** Poll the cheap, signature-free state of every extra (decrypting anything is always an explicit click). */
export async function loadExtras(v: View, slot: number) {
  const jobs: Promise<unknown>[] = [];
  if (hasModule("chat") && v.phase <= 3 && slot >= 0) {
    jobs.push(X.chatHistory().then((m) => { if (XS.seenChat && m.length > XS.seenChat) sfx.tick(); XS.seenChat = m.length; XS.chat = m; }));
  }
  if (hasModule("will") && v.phase >= 1 && v.phase <= 4 && slot >= 0) {
    jobs.push((async () => {
      XS.canWill = v.phase <= 2 && v.ejected[slot] ? Boolean(await ctx.game.isAssassinated(ctx.roomId, slot)) : false;
      for (let i = 0; i < v.humanCount; i++) if (v.ejected[i] && !XS.willExists.has(i) && (await X.willWritten(i))) XS.willExists.add(i);
    })());
  }
  if (hasModule("bounty") && v.stake > 0n && (v.phase === 1 || v.phase === 2) && slot >= 0) jobs.push(X.bountyFlags().then((b) => (XS.bounty = b)));
  if (hasModule("bribe") && P.stakingEnabled() && v.phase >= 1 && v.phase <= 4 && slot >= 0) {
    jobs.push(X.bribeOffers(false).then((o) => { for (const n of o) { const old = XS.offers.find((x) => x.id === n.id); if (old) { n.wanted = old.wanted; n.amount = old.amount; } } XS.offers = o; }));
  }
  await Promise.allSettled(jobs);
}

const others = (v: View, slot: number, withSkip = false) =>
  v.wallets.map((w, i) => (i === slot ? "" : `<option value="${i}">Player ${i + 1} · ${short(w)}</option>`)).join("") + (withSkip ? `<option value="255">Skip (nobody)</option>` : "");

export function chatCard(v: View, slot: number): string {
  if (!hasModule("chat") || slot < 0 || v.phase > 3) return "";
  const log = XS.chat.map((m) => `<div><b>Player ${m.slot + 1}${m.from === me() ? " (you)" : ""}:</b> ${esc(m.text)}</div>`).join("") || `<div class="dim">Nobody has spoken yet.</div>`;
  return `<div class="card"><h3>💬 Table talk</h3><div class="chatlog">${log}</div>
    <input id="pvChat" type="text" maxlength="160" placeholder="Say something to the table…"><button data-act="say">Send</button>
    <p class="dim">Public events, members only. Never put a secret here: roles, votes and wills stay encrypted.</p></div>`;
}

export function willCard(v: View, slot: number): string {
  if (!hasModule("will") || slot < 0) return "";
  let h = "";
  if (XS.canWill && !XS.willExists.has(slot)) {
    h += `<div class="card warn"><h3>🕯 Your last will</h3>
      <p>You were murdered. Name who you think did it and leave a line (32 characters). It is <b>encrypted</b>: only this table can open it.</p>
      <select id="pvWillWho">${others(v, slot)}</select><input id="pvWillText" type="text" maxlength="32" placeholder="It was … I saw …">
      <button class="big" data-act="will">🕯 Seal my will</button></div>`;
  }
  const list = [...XS.willExists].map((i) => {
    const w = XS.wills[i];
    return w
      ? `<div class="will"><b>Last will of Player ${i + 1}</b> — blames <b class="bad">Player ${w.suspect + 1}</b>: “${esc(w.text || "…")}”</div>`
      : `<div class="will">Player ${i + 1} left a sealed will. <button class="g" data-act="readwill:${i}">Open it (decrypt)</button></div>`;
  }).join("");
  if (list) h += `<div class="card"><h3>🕯 Last wills</h3>${list}</div>`;
  return h;
}

export function bountyCard(v: View, slot: number): string {
  if (!hasModule("bounty") || v.stake <= 0n || slot < 0 || !XS.bounty) return "";
  const b = XS.bounty;
  const body = !b.assigned
    ? `<button class="big" data-act="assign">🎲 Draw my secret task</button>`
    : `${XS.task === null ? `<button class="g" data-act="bountytask">🔓 Reveal my task (decrypt)</button>` : `<p>Your secret task: <b>${X.TASK_NAMES[XS.task] ?? "task #" + XS.task}</b></p>`}
       ${b.claimed ? `<p class="ok">✓ Bounty claimed.</p>` : `<button class="big" data-act="bounty">💰 I did it — claim the bounty</button>`}`;
  return `<div class="card"><h3>🎯 Secret task bounty</h3>${body}
    <p class="dim">Bounty = 10% of the entry fee, paid <b>out of the shared pot</b> in the middle of the game. Only an alive commando is paid: if the spy claims they just get 0 and nobody can tell.</p></div>`;
}

export function bribeCard(v: View, slot: number): string {
  if (!hasModule("bribe") || !P.stakingEnabled() || slot < 0) return "";
  const meetingOpen = v.phase === 2 && Date.now() / 1e3 < v.voteDeadline, dead = v.ejected[slot];
  let form = "";
  if (meetingOpen && !dead) {
    form = `<p class="dim">Lock some of your own cUSDT as an <b>encrypted</b> bribe. The target is paid only if their secret ballot matches your wish — checked inside FHE, never revealed. You get the rest back.</p>
      <label class="dim">Who do you bribe?</label><select id="pvBribeTarget">${others(v, slot)}</select>
      <label class="dim">Whom should they vote for?</label><select id="pvBribeWanted">${v.wallets.map((_, i) => `<option value="${i}">Player ${i + 1}</option>`).join("")}<option value="255">Skip (nobody)</option></select>
      <label class="dim">Amount (cUSDT)</label><input id="pvBribeAmt" type="number" min="0.000001" step="any" value="0.1">
      <button class="big r" data-act="bribe">💸 Offer the bribe</button>`;
  }
  const over = (o: X.BribeOffer) => !(v.phase === 2 && v.round === o.round);
  const rows = XS.offers.map((o) => {
    const terms = o.wanted !== undefined ? ` wants <b>${o.wanted === 255 ? "a skip" : "Player " + (o.wanted + 1)}</b> for <b>${fmt(o.amount ?? 0n)} cUSDT</b>` : "";
    if (o.forMe) return `<div class="will">💸 Player ${v.wallets.indexOf(o.briber) + 1} offers you a bribe${terms}.
      ${o.wanted === undefined ? `<button class="g" data-act="revealbribe">Reveal the terms</button>` : ""}
      ${o.claimed ? " ✓ settled" : over(o) ? `<button class="g" data-act="claimbribe:${o.id}">Claim (paid only if you voted as asked)</button>` : " <i>claimable once the vote closes</i>"}</div>`;
    if (o.mine) return `<div class="will">💸 You bribed Player ${v.wallets.indexOf(o.target) + 1}.
      ${o.reclaimed ? " ✓ unpaid part returned" : o.claimed || Date.now() / 1e3 >= o.createdAt + 86400 ? `<button class="g" data-act="reclaim:${o.id}">Take back the unpaid part</button>` : " <i>waiting for the target</i>"}</div>`;
    return "";
  }).join("");
  if (!form && !rows) return "";
  return `<div class="card"><h3>💸 Bribe fund</h3>${form}${rows}</div>`;
}

export function potCard(v: View): string {
  if (v.stake <= 0n || !P.stakingEnabled()) return "";
  return XS.pot === null
    ? `<p class="dim">The prize pool stayed secret during the game (bounties came out of it, too).</p><button class="g" data-act="revealPot">🔓 Reveal the final prize pool</button>`
    : `<p>💰 Final prize pool: <b>${fmt(XS.pot)} cUSDT</b> (after bounties)</p>`;
}

/** Runs a click on one of the cards above. Returns false when `act` is not one of theirs. */
export async function extraAct(act: string, v: View | null, slot: number): Promise<boolean> {
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
  if (act === "say") { const t = val("pvChat").trim(); if (!t) throw new Error("Type a message first"); await X.say(t); const i = document.getElementById("pvChat") as HTMLInputElement | null; if (i) i.value = ""; return true; }
  if (act === "will") {
    const t = val("pvWillText").trim(); if (!t) throw new Error("Write a line for your will");
    await X.writeWill(Number(val("pvWillWho")), t); sfx.will(); XS.willExists.add(slot); return true;
  }
  if (act.startsWith("readwill:")) { const i = Number(act.slice(9)); const w = await X.readWill(i); if (w) { XS.wills[i] = w; sfx.will(); } return true; }
  if (act === "assign") { await X.assignTask(); return true; }
  if (act === "bountytask") { XS.task = await X.bountyTask(); return true; }
  if (act === "bounty") { await X.claimBounty(); sfx.coin(); return true; }
  if (act === "bribe") {
    if (!v) return true;
    const ti = Number(val("pvBribeTarget")), want = Number(val("pvBribeWanted")), amt = BigInt(Math.round(Number(val("pvBribeAmt")) * Number(UNIT)));
    if (!Number.isFinite(ti) || !v.wallets[ti]) throw new Error("Pick who to bribe");
    if (amt <= 0n) throw new Error("Enter an amount above 0");
    await X.offerBribe(v.wallets[ti], want, amt); sfx.coin(); return true;
  }
  if (act === "revealbribe") { XS.offers = await X.bribeOffers(true); return true; }
  if (act.startsWith("claimbribe:")) { await X.claimBribe(Number(act.slice(11))); sfx.coin(); XS.offers = await X.bribeOffers(false); return true; }
  if (act.startsWith("reclaim:")) { await X.reclaimBribe(Number(act.slice(8))); XS.offers = await X.bribeOffers(false); return true; }
  if (act === "revealPot") { XS.pot = await P.revealPot(); sfx.coin(); return true; }
  if (act === "publish") { await X.publishEarnings(); return true; }
  return false;
}

/** Leaderboard screen body: great detectives (crew wins), night assassins (spy wins) and the cUSDT winners who published their total. */
export async function boardHtml(): Promise<string> {
  if (!hasStats()) return `<p class="dim">The leaderboard contract is not deployed on this build.</p>`;
  const rows = await X.leaderboard();
  const who = (w: string) => `<code>${short(w)}</code>${w === me() ? " <em>you</em>" : ""}`;
  const table = (title: string, head: string, items: { w: string; a: string; b: string }[]) =>
    `<div class="card"><h3>${title}</h3>${items.length
      ? `<table class="board"><tr><th>#</th><th>Wallet</th><th>${head}</th><th>Games</th></tr>${items.map((r, i) => `<tr><td>${i + 1}</td><td>${who(r.w)}</td><td><b>${r.a}</b></td><td>${r.b}</td></tr>`).join("")}</table>`
      : `<p class="dim">Nobody yet. Settle a finished game to enter the board.</p>`}</div>`;
  const det = rows.filter((r) => r.crewWins > 0).sort((a, b) => b.crewWins - a.crewWins || a.crewGames - b.crewGames).slice(0, 10).map((r) => ({ w: r.wallet, a: String(r.crewWins), b: String(r.crewGames) }));
  const ass = rows.filter((r) => r.impWins > 0).sort((a, b) => b.impWins - a.impWins || a.impGames - b.impGames).slice(0, 10).map((r) => ({ w: r.wallet, a: String(r.impWins), b: String(r.impGames) }));
  const ern = rows.filter((r) => r.earnings !== null).sort((a, b) => (b.earnings! > a.earnings! ? 1 : b.earnings! < a.earnings! ? -1 : 0)).slice(0, 10).map((r) => ({ w: r.wallet, a: fmt(r.earnings!) + " cUSDT", b: String(r.games) }));
  return `<div class="rg">${table("🕵️ Great detectives <small>(crew wins)</small>", "Wins", det)}${table("🔪 Night assassins <small>(spy wins)</small>", "Wins", ass)}${table("💰 cUSDT winners <small>(published by the player)</small>", "Won", ern)}</div>
    <p class="dim">Win counters come from roles the contract verified with KMS signatures. Winnings are encrypted: a wallet only shows up in the cUSDT board if its owner publishes its total.</p>
    <button class="g" data-act="publish">📣 Publish my winnings</button> <button class="g" data-act="mine">🔓 Show my winnings (decrypt)</button> <span id="pvMine"></span>`;
}
export async function myWinnings(): Promise<string> { const e = await X.myEarnings(); return e === null ? "n/a" : `${fmt(e)} cUSDT`; }
