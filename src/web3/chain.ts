import { ctx } from "./context";
import { Contract } from "ethers";
import { emit, txUrl, shortHash } from "./events";
import { encrypt8, encryptMany, userDecrypt, publicDecryptPending, publicDecryptValues } from "./fhe";
import { toast } from "../ui/dom";
import { NAMES } from "../config";
import { showCrypt, wantsFx } from "../ui/cryptFx";
import { NO_TARGET } from "../config";

let queue: Promise<unknown> = Promise.resolve();
/** Nhãn giao dịch → bước (để màn cuối game giải thích từng giao dịch bằng ngôn ngữ người chơi). */
const STEP: Record<string, string> = { "Prove your death (FHE)": "req", "Submit death proof": "submit", "Unlock roles (FHE public decrypt)": "reveal", "Record your death on-chain": "exec" };
/** Every transaction goes through a sequential queue (avoids nonce clashes) + toast. */
export function tx(label: string, fn: () => Promise<any>): Promise<any> {
  const p = queue.then(async () => {
    toast(label + "…"); const step = STEP[label]; if (step) emit({ kind: "tx", step, phase: "go" });
    const fx = wantsFx(label) ? showCrypt(label) : null;   // cyberpunk "FHE at work" overlay for the heavy steps
    try { const r = await (await fn()).wait(); toast("✓ " + label, r?.hash ? { text: shortHash(String(r.hash)), href: txUrl(String(r.hash)) } : undefined); if (step) emit({ kind: "tx", step, phase: "ok", hash: String(r?.hash ?? "") }); return r; }
    catch (e: any) { toast("✗ " + label + ": " + String(e.shortMessage || e.reason || e.message || "").slice(0, 80)); throw e; }
    finally { fx?.(); }
  });
  queue = p.catch(() => {});
  return p;
}
export const parseEvents = (r: any) => r.logs.map((l: any) => { try { return ctx.game.interface.parseLog(l); } catch { return null; } }).filter(Boolean);

/** Contract used for the technical, role-free calls: the session wallet if set up (no popups), otherwise the player wallet. */
const op = () => ctx.opGame ?? ctx.game;
/** Contract used for the player's OWN gameplay actions (secret kill, task, vote). PvP with a registered session wallet: it plays for the player,
 *  so nothing pops up mid-game. Otherwise (solo, or no session wallet) the player's wallet signs, as before. */
export const actGame = () => (ctx.pvpKey && ctx.opGame ? ctx.opGame : ctx.game);
const actAddr = () => (ctx.pvpKey && ctx.opGame ? String(ctx.opGame.runner.address) : ctx.account);

/** Whole solo setup in ONE transaction: room + operator + bots + encrypted roles + start. */
/** FHE gas is not constant (random role shuffle): the wallet's estimate is sometimes too low and the tx reverts with no reason (out of gas).
 *  So we send an explicit, generous gas limit (only the gas actually used is charged) and retry once on a silent revert. */
const FHE_GAS = 15_000_000n;
async function withRetry<T>(label: string, fn: () => Promise<any>): Promise<any> {
  try { return await tx(label, fn); }
  catch (e: any) {
    if (e?.code !== "CALL_EXCEPTION") throw e;   // user rejected / network error: do not retry
    toast("↻ " + label + " reverted (likely gas) — retrying once…");
    return tx(label + " (retry)", fn);
  }
}
export async function createSoloGame(operator: string) {
  const r = await withRetry("Create game & deal roles (FHE)", () => ctx.game.createSoloGame(operator, { gasLimit: FHE_GAS }));
  ctx.roomId = parseEvents(r).find((e: any) => e.name === "RoomCreated").args.roomId;
}
export const startGame = () => withRetry("Assign roles (FHE)", () => ctx.game.startGame(ctx.roomId, { gasLimit: FHE_GAS }));
export async function fetchMyRole(): Promise<0 | 1> {
  const h = await ctx.game.getRoleHandle(ctx.roomId, ctx.account);
  return Number((await userDecrypt([h]))[h]) as 0 | 1;
}
export async function fetchStatuses(slots: number[]): Promise<number[]> {
  const hs: string[] = await Promise.all(slots.map((i) => ctx.game.getStatusHandle(ctx.roomId, i)));
  const r = await userDecrypt(hs);
  return hs.map((h) => Number(r[h]));
}
/** Chạy lượt Bot theo lô (contract giới hạn BOTS_PER_TX Bot/tx để không vượt ngân sách FHE). Tuần tự hoá để không gọi trùng. */
let botLock: Promise<unknown> = Promise.resolve();
const serial = <T,>(f: () => Promise<T>): Promise<T> => (botLock = botLock.then(f, f)) as Promise<T>;
/** The soldiers are NOT wallets: they are slots the contract plays itself (BOTS_PER_TX per tx, to stay inside the FHE budget), so there is nothing
 *  to "sign per bot". What made it slow was waiting for each batch to be mined (~1 block each). Now ALL the batches needed are sent back-to-back
 *  from the session wallet (consecutive nonces, mined in order, often the same block) and awaited together. */
async function sendBatches(n: number, label: (left: number) => string, send: () => Promise<any>) {
  const per = Math.max(1, Number(await ctx.game.BOTS_PER_TX().catch(() => 3)));
  const batches = Math.min(8, Math.ceil(n / per));
  await tx(label(n), async () => {
    const sent: any[] = [];
    for (let b = 0; b < batches; b++) sent.push(await send());          // broadcast only; the nonce goes up by one each time
    return { wait: async () => { const rs = await Promise.all(sent.map((t) => t.wait())); return rs[rs.length - 1]; } };
  });
}
export const botsCatchUp = () => serial(async () => {
  for (let k = 0; k < 3; k++) {   // normally one round is enough; the loop re-checks in case a batch was skipped
    const n = Number(await ctx.game.pendingBotTurns(ctx.roomId)); if (!n) return;
    await sendBatches(n, (left) => `🪖 AI soldiers take their turn on-chain (tasks / hidden moves) — ${left} to move`, () => op().runBotTurns(ctx.roomId));
  }
});
/** Phiếu của Bot theo diễn biến cuộc họp (debate.ts → lockBallots): plan[slot] = ô Bot đó bỏ cho (NO_TARGET = bỏ phiếu trắng). null = để contract tự random như cũ. */
let botPlan: number[] | null = null;
export const setBotPlan = (p: number[] | null) => { botPlan = p; };
/** Contract đang chạy có hàm castBotVote không? (hợp đồng cũ chưa deploy lại thì không có -> Bot vote random như trước.) */
let biasedOk: boolean | null = null, biasedFor = "";
async function canBiasedVotes() {
  if (biasedFor === ctx.address && biasedOk !== null) return biasedOk;
  biasedFor = ctx.address; biasedOk = false;
  try {
    const f = ctx.game.interface.getFunction("castBotVote"); if (!f) return false;
    const code = await ctx.game.runner.provider.getCode(ctx.address);
    biasedOk = code.toLowerCase().includes(f.selector.slice(2).toLowerCase());
  } catch { biasedOk = false; }
  return biasedOk;
}
/** Bot bỏ phiếu đúng như đã cãi nhau ở đống lửa: mỗi Bot một phiếu MÃ HOÁ (mã hoá cả 10 phiếu trong MỘT input proof, gửi mỗi Bot một tx), vẫn không ai thấy ai bỏ cho ai. */
async function botsVoteAsDebated(plan: number[]) {
  const total = Number(await ctx.game.pendingBotVotes(ctx.roomId)); if (!total) return;
  const room = await getRoom(), humans = Number(room.humanCount), slots = Number(room.totalSlots);
  if (total !== slots - humans) return;   // some bots already voted (an earlier attempt was cut short): the random fill below finishes the job
  const bots: number[] = []; for (let b = humans; b < slots; b++) bots.push(b);
  const me = ctx.opGame ? String(ctx.opGame.runner.address) : ctx.account;   // the input proof is bound to the address that SENDS the tx
  const e = await encryptMany(bots.map((b) => plan[b] ?? NO_TARGET), me);
  const w = ctx.opGame!.runner, base = await w.provider!.getTransactionCount(me, "pending");
  await tx(`🪖 AI soldiers vote the way they argued — ${total} ballots`, async () => {
    // all 10 are simulated + signed + broadcast IN PARALLEL with fixed consecutive nonces (sequential awaits cost ~2-3 s of FHE gas estimation each)
    const sent = await Promise.all(bots.map((b, k) => op().castBotVote(ctx.roomId, b, e.handles[k], e.inputProof, { nonce: base + k })));
    return { wait: async () => { const rs = await Promise.all(sent.map((t: any) => t.wait())); return rs[rs.length - 1]; } };
  });
}
export const botsVote = () => serial(async () => {
  if (botPlan && ctx.opGame && (await canBiasedVotes())) {   // only with the session wallet: otherwise it would be 10 wallet popups
    try { await botsVoteAsDebated(botPlan); } catch (e: any) { toast("↻ Bot ballots: falling back to random (" + String(e.shortMessage || e.reason || e.message || "").slice(0, 60) + ")"); }
  }
  for (let k = 0; k < 3; k++) {   // anything still unvoted (no plan / old contract / a failed batch) is filled by the contract's encrypted randomness, as before
    const n = Number(await ctx.game.pendingBotVotes(ctx.roomId)); if (!n) return;
    await sendBatches(n, (left) => `🪖 AI soldiers cast their secret votes — ${left} to vote`, () => op().runBotVotes(ctx.roomId));
  }
});
export async function secretAct(target: number = NO_TARGET) {
  await botsCatchUp();
  const e = await encrypt8(target, actAddr());
  return tx("Action (encrypted)", () => actGame().executeSecretKill(ctx.roomId, e.handles[0], e.inputProof));
}
export const completeTask = () => tx("Complete task (on-chain)", () => actGame().completeTask(ctx.roomId));
export const callMeeting = async () => { await botsCatchUp(); return tx("Open meeting (on-chain)", () => op().callMeeting(ctx.roomId)); };
export const getRoom = () => ctx.game.getRoom(ctx.roomId);
export async function castVote(target: number) {
  const e = await encrypt8(target, actAddr());
  return tx("Secret vote", () => actGame().castShieldedVote(ctx.roomId, e.handles[0], e.inputProof));
}
/** tallyVotes -> public decrypt -> finalizeTally. Trả về receipt của finalize. */
export async function tallyAndFinalize() {
  await botsVote();
  await tx("Tally votes", () => op().tallyVotes(ctx.roomId));
  const d = await publicDecryptPending();
  return tx("Submit decryption proof", () => op().finalizeTally(ctx.roomId, d.abiEncodedClearValues, d.decryptionProof));
}
export async function checkpointOnChain() {
  await botsCatchUp();
  await tx("Check victory (FHE)", () => op().requestCheckpoint(ctx.roomId));
  const d = await publicDecryptPending();
  await tx("Submit proof", () => op().submitCheckpoint(ctx.roomId, d.abiEncodedClearValues, d.decryptionProof));
}
/** Friendly-fire ending: the squad executed you. Writes your death to the contract and finishes the game on-chain. Returns the receipt. */
export const reportExecution = () => tx("Record your death on-chain", () => op().reportExecution(ctx.roomId));   // session wallet: no popup
/** Friendly fire: you shot a squadmate dead. Records it on-chain so the victim stays dead until the game ends. */
export async function reportFriendlyKill(victim: number) {
  // Anyone who dies is written to the chain AT ONCE, signed by the session wallet (no wallet popup); the radio shows the tx link.
  const who = NAMES[victim] ?? "#" + victim;
  toast(`☠ ${who} died — writing it on-chain (auto-signed)…`);
  return tx(`☠ ${who}: death recorded on-chain`, () => op().reportFriendlyKill(ctx.roomId, victim));
}

/** Game over -> UNLOCK every role (bots included): contract makes them publicly decryptable, then the KMS decrypts them. Returns role per slot (1 = spy, 0 = commando).
 *  Needs the contract with `revealRoles` (npm start redeploys automatically when the .sol changed). */
const REVEAL_ABI = ["function revealRoles(uint256) returns (bytes32[])", "function getRoleHandleOf(uint256,uint8) view returns (bytes32)", "function requestDeathProof(uint256)", "function submitDeathProof(uint256,bytes,bytes)"];
export async function revealAllRoles(n: number): Promise<number[]> {
  const c = new Contract(ctx.address, REVEAL_ABI, ctx.signer);
  const handles = Promise.all(Array.from({ length: n }, (_, i) => c.getRoleHandleOf(ctx.roomId, i)));   // đọc handle song song với tx (handle có sẵn từ trước, chỉ chưa giải mã được)
  await tx("Unlock roles (FHE public decrypt)", () => c.revealRoles(ctx.roomId));
  return publicDecryptValues((await handles) as string[]);
}

/** VERIFIABLE assassination: the contract makes YOUR encrypted status public, the KMS decrypts + signs it, the contract checks the signatures
 *  and only then ends the game. Nothing here is taken on the client's word. */
export async function proveDeath() {
  await tx("Prove your death (FHE)", () => new Contract(ctx.address, REVEAL_ABI, ctx.opGame?.runner ?? ctx.signer).requestDeathProof(ctx.roomId));   // session wallet when available: no popup
  const d = await publicDecryptPending();
  const c = new Contract(ctx.address, REVEAL_ABI, ctx.opGame?.runner ?? ctx.signer);
  return tx("Submit death proof", () => c.submitDeathProof(ctx.roomId, d.abiEncodedClearValues, d.decryptionProof));
}
