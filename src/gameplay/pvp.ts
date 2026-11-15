import { $, toast, toastHook } from "../ui/dom";
import { connect } from "../web3/wallet";
import { ctx } from "../web3/context";
import * as chain from "../web3/chain";
import * as P from "../web3/pvp";
import { publicDecryptPending } from "../web3/fhe";
import { NO_TARGET, TASKS_PER_PLAYER } from "../config";

/**
 * PvP "encrypted table": 3-7 real players, the CHAIN is the shared world.
 * Roles, kills, votes, task progress (and the cUSDT pot) are FHE ciphertexts; only the right wallet can decrypt its own values.
 * Positions are not shared (there is no netcode): every secret action is an on-chain action, which is exactly what must stay hidden.
 */
const PH = { Lobby: 0, Playing: 1, Voting: 2, Tallying: 3, Finished: 4, Cancelled: 5 };
const PK = { None: 0, Checkpoint: 1, Tally: 2, Death: 3 };
const UNIT = 1_000_000n;   // cUSDT has 6 decimals
const fmt = (v: bigint) => (Number(v) / Number(UNIT)).toLocaleString(undefined, { maximumFractionDigits: 6 });
const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type View = Awaited<ReturnType<typeof P.roomView>>;
const S = {
  inRoom: false, v: null as View | null, slot: -1, role: null as 0 | 1 | null, myStatus: null as number | null, statuses: [] as (number | null)[],
  roles: null as number[] | null, balance: null as bigint | null, winner: false, claimed: false, busy: false, timer: 0 as any, tick: 0,
};
const key = (k: string) => `li_${k}_${ctx.roomId}_${ctx.account}`;
const getN = (k: string) => { try { return Number(localStorage.getItem(key(k)) ?? 0); } catch { return 0; } };
const setN = (k: string, n: number) => { try { localStorage.setItem(key(k), String(n)); } catch { /* ignore */ } };

const body = () => $("#pvpBody");
const log = (m: string) => { const l = document.getElementById("pvlog"); if (l) l.textContent = m + "\n" + l.textContent!.split("\n").slice(0, 7).join("\n"); };

export function initPvp() {
  const root = $("#pvp");
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (b && !b.hasAttribute("disabled")) void run(b.dataset.act!, b);
  });
  const m = /[?&]room=(\d+)/.exec(location.search);
  if (m) { void open(); setTimeout(() => { const i = document.getElementById("pvJoinId") as HTMLInputElement | null; if (i) i.value = m[1]; }, 50); }
}
export async function open() {
  $("#pvp").style.display = "flex"; $("#menu").style.display = "none";
  toastHook.fn = log;
  body().innerHTML = `<h2>👥 Encrypted table (PvP)</h2><p class="dim">Connecting your wallet…</p><pre id="pvlog" class="pvlog"></pre>`;
  try { await connect(); ctx.opGame = null; await home(); } catch (e: any) { body().innerHTML = `<h2>👥 Encrypted table (PvP)</h2><p class="bad">✗ ${esc(String(e.message || e))}</p><button data-act="close" class="g">Back</button><pre id="pvlog" class="pvlog"></pre>`; }
}

/* ───────────────────────────── screens ───────────────────────────── */
async function home() {
  S.inRoom = false; clearInterval(S.timer);
  const staking = P.stakingEnabled();
  body().innerHTML = `
  <h2>👥 Encrypted table (PvP)</h2>
  <p class="dim">3 to 7 players. One of you is a secret <b>spy</b> — dealt by the Zama coprocessor, readable only by its owner. Tasks, kills and votes happen on-chain as ciphertext.</p>
  <div class="rg two">
   <div class="card"><h3>Create a room</h3>
     <button class="big" data-act="create0">Create free room</button>
     ${staking ? `<label class="dim">Entry stake (cUSDT, each player)</label><input id="pvStake" type="number" min="0.000001" step="any" value="1">
     <button class="big" data-act="create1">Create staked room</button>
     <p class="dim">Stakes move as <b>ERC-7984 encrypted transfers</b>: nobody sees balances or the pot. The winning side shares it.</p>
     <button class="g" data-act="bal">Show my cUSDT balance (decrypt)</button> <span id="pvBal"></span>`
       : `<p class="dim">Staking is off on this deployment (no cUSDT address configured).</p>`}
   </div>
   <div class="card"><h3>Join a room</h3>
     <input id="pvJoinId" type="number" min="1" placeholder="Room ID">
     <button class="big" data-act="join">Join room</button>
     <p class="dim">Staked rooms ask you to approve the game as cUSDT operator first.</p>
   </div>
  </div>
  <button data-act="close" class="g">← Back to menu</button><pre id="pvlog" class="pvlog"></pre>`;
}

async function enter(id: bigint) {
  ctx.roomId = id; S.inRoom = true; S.role = null; S.myStatus = null; S.roles = null; S.statuses = [];
  await refresh(); clearInterval(S.timer); S.timer = setInterval(() => void refresh(), 6000);
}

async function refresh() {
  if (S.busy || !S.inRoom) return;
  try {
    S.v = await P.roomView(ctx.roomId);
    S.slot = S.v.wallets.indexOf(ctx.account.toLowerCase());
    if (S.slot < 0 && S.v.phase !== PH.Lobby) throw new Error("You are not a player of this room");
    const v = S.v;
    if (v.phase === PH.Playing || v.phase === PH.Voting || v.phase === PH.Tallying) {
      if (S.role === null && S.slot >= 0) S.role = await chain.fetchMyRole();
      if (S.slot >= 0 && (S.tick++ % 2 === 0 || v.phase === PH.Voting)) await loadStatuses();
    }
    if (v.phase === PH.Finished && v.settled && S.slot >= 0) { S.winner = await P.isWinner(S.slot); S.claimed = await P.hasClaimed(S.slot); }
    if (v.phase === PH.Cancelled && S.slot >= 0) S.claimed = await P.hasClaimed(S.slot);
  } catch (e: any) { toast("✗ " + String(e.shortMessage || e.message || e).slice(0, 90)); }
  render();
}
async function loadStatuses() {
  const v = S.v!;
  try {
    if (v.phase === PH.Voting || v.phase === PH.Tallying) {
      const s = await chain.fetchStatuses(Array.from({ length: v.humanCount }, (_, i) => i));
      S.statuses = s; S.myStatus = s[S.slot];
    } else { S.myStatus = (await chain.fetchStatuses([S.slot]))[0]; }
  } catch { /* not allowed yet / relayer busy: try again next poll */ }
}

const playerList = (v: View, pick?: { name: string; selfToo?: boolean; aliveOnly?: boolean }) =>
  v.wallets.map((w, i) => {
    const me = i === S.slot, out = v.ejected[i], dead = S.statuses[i] === 0;
    const tags = [me ? "you" : "", out ? "out" : dead ? "dead" : ""].filter(Boolean).map((t) => `<em>${t}</em>`).join(" ");
    const dis = pick && ((me && !pick.selfToo) || (pick.aliveOnly && (out || dead)));
    return pick
      ? `<label class="seat${dis ? " off" : ""}"><input type="radio" name="${pick.name}" value="${i}" ${dis ? "disabled" : ""}> <b>Player ${i + 1}</b> <code>${short(w)}</code> ${tags}</label>`
      : `<div class="seat${out || dead ? " off" : ""}"><b>Player ${i + 1}</b> <code>${short(w)}</code> ${tags}</div>`;
  }).join("");
const picked = (name: string): number | null => { const r = document.querySelector<HTMLInputElement>(`input[name=${name}]:checked`); return r ? Number(r.value) : null; };

function render() {
  const v = S.v; if (!v) return;
  const link = `${location.origin}${location.pathname}?room=${ctx.roomId}`;
  const stakeTxt = v.stake > 0n ? `💰 stake <b>${fmt(v.stake)} cUSDT</b> per player (encrypted transfers)` : "free room";
  let main = "";
  const pending = v.pendingKind !== PK.None
    ? `<div class="card warn"><h3>A decryption proof is waiting</h3><p>The KMS has to sign a public value before the game can go on. Anyone can submit it.</p><button class="big" data-act="finishPending">Fetch KMS proof &amp; submit</button></div>` : "";

  if (v.phase === PH.Lobby) {
    const isHost = v.wallets[0] === ctx.account.toLowerCase(), can = v.humanCount >= 3;
    main = `<div class="card"><h3>Lobby · ${v.humanCount}/7 players</h3>${playerList(v)}
      <p class="dim">Share this link: <input readonly value="${esc(link)}" onclick="this.select()"></p>
      ${isHost ? `<button class="big" data-act="start" ${can ? "" : "disabled"}>${can ? "Start the game (deal encrypted roles)" : "Need at least 3 players"}</button>
        ${v.stake > 0n ? `<button class="g" data-act="cancel">Cancel room (refunds)</button>` : ""}` : `<p class="dim">Waiting for the host to start…</p>`}
      ${v.stake > 0n && !isHost ? `<button class="g" data-act="cancel">Cancel (only after 24h)</button>` : ""}</div>`;
  } else if (v.phase === PH.Playing) {
    const dead = S.myStatus === 0, tasks = getN("tasks"), acted = getN("acted") >= v.round;
    main = `<div class="rg two">
      <div class="card"><h3>Round ${v.round}</h3>
        <p>Your secret role: ${S.role === null ? `<i>decrypting…</i>` : S.role === 1 ? `<b class="bad">🕵️ SPY</b> — nobody else can see this` : `<b class="ok">🪖 Commando</b> — nobody else can see this`}</p>
        <p>Your status: ${S.myStatus === null ? "…" : dead ? `<b class="bad">☠ dead</b> (only you can see it until a meeting)` : `<b class="ok">alive</b>`}</p>
        <button class="big" data-act="task" ${tasks >= TASKS_PER_PLAYER ? "disabled" : ""}>🔧 Do a task (${tasks}/${TASKS_PER_PLAYER})</button>
        <p class="dim">Everyone, spy included, does the same 3 tasks. Only commandos advance the encrypted progress.</p></div>
      <div class="card"><h3>Secret action <small>(once per round)</small></h3>
        <p class="dim">EVERY player sends this. If you are the spy it kills the target; if not, it does nothing. The chain cannot tell which — so sending it never exposes you.</p>
        ${playerList(v, { name: "tgt", aliveOnly: false })}
        <button class="big r" data-act="act" ${acted ? "disabled" : ""}>${acted ? "Already sent this round" : "🔐 Send encrypted action"}</button></div>
      <div class="card"><h3>Table</h3>${playerList(v)}
        <button data-act="meeting">🚨 Call a meeting</button><button class="g" data-act="check">🏁 Check mission</button>
        ${dead ? `<button class="r" data-act="death">☠ Prove my death (KMS)</button>` : ""}</div></div>${pending}`;
  } else if (v.phase === PH.Voting) {
    const over = Date.now() / 1e3 >= v.voteDeadline, voted = getN("voted") >= v.round, ready = over || v.votesCast >= v.humanCount;
    main = `<div class="card"><h3>🗳 Secret vote · ${v.votesCast}/${v.humanCount} voted ${over ? "· time is up" : `· ${Math.max(0, v.voteDeadline - Math.floor(Date.now() / 1e3))}s left`}</h3>
      <p class="dim">Alive/dead is now readable by the room. Your ballot is encrypted: nobody — not even validators — sees who you vote for. Dead players' ballots weigh 0.</p>
      ${playerList(v, { name: "vote", selfToo: true, aliveOnly: true })}
      <button class="big" data-act="vote" ${voted || S.myStatus === 0 ? "disabled" : ""}>${voted ? "Vote sent" : S.myStatus === 0 ? "Dead players cannot vote" : "🔐 Cast encrypted vote"}</button>
      <button class="g" data-act="skip" ${voted || S.myStatus === 0 ? "disabled" : ""}>Skip (nobody ejected)</button>
      <button class="big" data-act="tally" ${ready ? "" : "disabled"}>Close vote &amp; count (FHE → KMS proof)</button></div>${pending}`;
  } else if (v.phase === PH.Tallying) {
    main = `<div class="card"><h3>Counting…</h3><p>The encrypted tally is waiting for its KMS-signed result.</p><button class="big" data-act="finishPending">Fetch KMS proof &amp; submit</button></div>`;
  } else if (v.phase === PH.Finished) {
    const crewWon = v.winner === 1, stakeOn = v.stake > 0n;
    main = `<div class="card"><h3>${crewWon ? "🪖 Commandos win" : v.winner === 2 ? "🕵️ The spy wins" : "Game over"}</h3>
      <p>The winner was decided by <b>KMS-signed</b> decryptions checked by the contract. Unlock every role to audit the deal:</p>
      <button class="big" data-act="reveal">🔓 Unlock all roles</button>
      ${S.roles ? `<div>${v.wallets.map((w, i) => `<div class="seat"><b>Player ${i + 1}</b> <code>${short(w)}</code> ${S.roles![i] === 1 ? `<b class="bad">🕵️ SPY</b>` : "🪖"}</div>`).join("")}</div>` : ""}
      ${stakeOn ? `<hr><h3>💰 Pot</h3>${!v.settled ? `<p>Step 1: verify roles on-chain and fix the winners.</p><button class="big" data-act="settle">Settle stakes</button>`
        : S.winner ? (S.claimed ? `<p class="ok">✓ You claimed your share (encrypted transfer).</p>` : `<p class="ok">You are on the winning side (${v.winnersCount} winners).</p><button class="big" data-act="payout">Claim my share</button>`)
        : `<p class="dim">Settled: ${v.winnersCount} winner(s). You were not one of them.</p>`}
        <button class="g" data-act="bal">Show my cUSDT balance</button> <span id="pvBal"></span>` : ""}</div>`;
  } else if (v.phase === PH.Cancelled) {
    main = `<div class="card"><h3>Room cancelled</h3>${S.claimed ? `<p class="ok">✓ Refund claimed.</p>` : `<button class="big" data-act="refund">Claim my refund (exactly what I paid)</button>`}
      <button class="g" data-act="bal">Show my cUSDT balance</button> <span id="pvBal"></span></div>`;
  }
  const stalled = v.stake > 0n && [PH.Playing, PH.Voting, PH.Tallying].includes(v.phase);
  const keepLog = document.getElementById("pvlog")?.textContent ?? "";
  const keepVote = picked("vote"), keepTgt = picked("tgt");
  body().innerHTML = `<h2>👥 Room #${ctx.roomId} <small>${stakeTxt}</small></h2>${main}
    ${stalled ? `<button class="g" data-act="abort">Abort stalled game (after 2 days) &amp; refund</button>` : ""}
    <button class="g" data-act="leave">← Leave table</button><pre id="pvlog" class="pvlog">${esc(keepLog)}</pre>`;
  for (const [n, val] of [["vote", keepVote], ["tgt", keepTgt]] as const) if (val !== null) { const r = document.querySelector<HTMLInputElement>(`input[name=${n}][value="${val}"]`); if (r) r.checked = true; }
}

/* ───────────────────────────── actions ───────────────────────────── */
async function run(act: string, btn: HTMLElement) {
  if (act === "close") { $("#pvp").style.display = "none"; $("#menu").style.display = "flex"; clearInterval(S.timer); return; }
  if (act === "leave") { await home(); return; }
  if (S.busy) return;
  S.busy = true; btn.setAttribute("disabled", "");
  try {
    const v = S.v;
    switch (act) {
      case "create0": S.busy = false; await enter(await P.createRoom(0n)); S.busy = true; break;
      case "create1": {
        const st = BigInt(Math.round(Number((document.getElementById("pvStake") as HTMLInputElement).value) * Number(UNIT)));
        if (st <= 0n) throw new Error("Enter a stake above 0");
        S.busy = false; await enter(await P.createRoom(st)); S.busy = true; break;
      }
      case "join": {
        const id = BigInt((document.getElementById("pvJoinId") as HTMLInputElement).value || "0"); if (id <= 0n) throw new Error("Enter a room ID");
        const rv = await P.roomView(id); if (!rv.host || /^0x0+$/.test(rv.host)) throw new Error("No such room");
        if (!rv.wallets.includes(ctx.account.toLowerCase())) await P.joinRoom(id, rv.stake); else ctx.roomId = id;
        S.busy = false; await enter(id); S.busy = true; break;
      }
      case "bal": { const b = await P.myTokenBalance(); const el = document.getElementById("pvBal"); if (el) el.textContent = b === null ? "n/a" : `${fmt(b)} cUSDT`; S.balance = b; break; }
      case "start": await P.startRoom(); break;
      case "cancel": await P.cancelRoom(); break;
      case "abort": await P.abortStalled(); break;
      case "refund": await P.claimRefund(); S.claimed = true; break;
      case "task": await chain.completeTask(); setN("tasks", getN("tasks") + 1); break;
      case "act": {
        const t = picked("tgt"); if (t === null) throw new Error("Pick a target (it only matters if you are the spy)");
        await chain.secretAct(t); setN("acted", v!.round); break;
      }
      case "meeting": await chain.callMeeting(); break;
      case "check": await chain.checkpointOnChain(); break;
      case "death": await chain.proveDeath(); break;
      case "vote": { const t = picked("vote"); if (t === null) throw new Error("Pick who to vote for, or Skip"); await chain.castVote(t); setN("voted", v!.round); break; }
      case "skip": await chain.castVote(NO_TARGET); setN("voted", v!.round); break;
      case "tally": await chain.tallyAndFinalize(); break;
      case "finishPending": await finishPending(v!); break;
      case "reveal": S.roles = await P.revealRoles(v!.totalSlots); break;
      case "settle": await P.settleStake(v!.totalSlots); break;
      case "payout": await P.claimPayout(); S.claimed = true; break;
    }
  } catch (e: any) { toast("✗ " + String(e.shortMessage || e.reason || e.message || e).slice(0, 110)); }
  S.busy = false; await refresh();
}

/** Someone started a decryption (checkpoint / tally / death proof): fetch the KMS signatures and submit them. */
async function finishPending(v: View) {
  const d = await publicDecryptPending();
  const a = d.abiEncodedClearValues, p = d.decryptionProof;
  if (v.pendingKind === PK.Checkpoint) await chain.tx("Submit proof", () => ctx.game.submitCheckpoint(ctx.roomId, a, p));
  else if (v.pendingKind === PK.Tally) await chain.tx("Submit decryption proof", () => ctx.game.finalizeTally(ctx.roomId, a, p));
  else if (v.pendingKind === PK.Death) await chain.tx("Submit death proof", () => ctx.game.submitDeathProof(ctx.roomId, a, p));
}
