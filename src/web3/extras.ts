import { ctx } from "./context";
import { tx } from "./chain";
import { kms, userDecryptAt } from "./fhe";
import { ensureOperatorFor } from "./pvp";
import { encryptFor, hasModule, hasStats, modC, moduleAddress, packText, statsAddress, statsC, unpackText } from "./modules";

/** Calls to the satellite contracts: LastWill, BountyBoard, BribeEscrow, RoomChat and LostIslandStats. */
const GAS = 6_000_000n;
const word = (abi: string, i: number) => BigInt("0x" + abi.slice(2 + i * 64, 2 + (i + 1) * 64));

// ───────────────────────────── chat ─────────────────────────────
export type ChatMsg = { slot: number; from: string; text: string; block: number };
export const say = (text: string) => tx("Say it at the table", () => modC("chat").say(ctx.roomId, text));
export async function chatHistory(): Promise<ChatMsg[]> {
  if (!hasModule("chat")) return [];
  const c = modC("chat"), head = await ctx.signer.provider.getBlockNumber();
  const evs = await c.queryFilter(c.filters.Message(ctx.roomId), Math.max(0, head - 30000), head);
  return evs.slice(-40).map((e: any) => ({ slot: Number(e.args.slotId), from: String(e.args.from).toLowerCase(), text: String(e.args.text), block: e.blockNumber }));
}

// ───────────────────────────── last will ─────────────────────────────
/** A murdered player writes: who they blame (slot) + a line of up to 32 bytes. Both encrypted; only the room can read them. */
export async function writeWill(suspectSlot: number, text: string) {
  const a = moduleAddress("will");
  const e = await encryptFor(a, (b) => { b.add8(suspectSlot); for (const w of packText(text)) b.add64(w); });
  return tx("Seal your last will (encrypted)", () => modC("will").writeWill(ctx.roomId, e.handles[0], e.handles[1], e.handles[2], e.handles[3], e.handles[4], e.inputProof, { gasLimit: GAS }));
}
/** Reads (and decrypts, if you are in the room) the will of `slot`. null if none was written. */
export async function readWill(slot: number): Promise<{ suspect: number; text: string } | null> {
  const w = await modC("will").readWill(ctx.roomId, slot);
  if (!w.written) return null;
  const hs: string[] = [w.suspect, ...(w.text as string[])];
  const d = await userDecryptAt(moduleAddress("will"), hs);
  return { suspect: Number(d[hs[0]]), text: unpackText(hs.slice(1).map((h) => BigInt(d[h]))) };
}
export const willWritten = async (slot: number): Promise<boolean> => (await modC("will").readWill(ctx.roomId, slot)).written;

// ───────────────────────────── secret task bounty ─────────────────────────────
export const TASK_NAMES = ["Fix the antenna", "Light the signal fire", "Refill the water barrel", "Check the east cliff", "Gather driftwood", "Calibrate the compass"];
/** Cheap, no signature needed: did I draw a task / claim already? */
export async function bountyFlags() {
  const c = modC("bounty");
  const [assigned, claimed] = await Promise.all([c.assigned(ctx.roomId, ctx.account), c.claimedBy(ctx.roomId, ctx.account)]);
  return { assigned: Boolean(assigned), claimed: Boolean(claimed) };
}
/** Decrypts MY secret task kind (asks for the one-day EIP-712 permit the first time). */
export async function bountyTask(): Promise<number> {
  const h: string = await modC("bounty").taskHandle(ctx.roomId, ctx.account);
  return Number((await userDecryptAt(moduleAddress("bounty"), [h]))[h]);
}
export const assignTask = () => tx("Draw a secret task (FHE random)", () => modC("bounty").assignTask(ctx.roomId, { gasLimit: GAS }));
export const claimBounty = () => tx("Claim the bounty (encrypted)", () => modC("bounty").claimBounty(ctx.roomId, { gasLimit: 12_000_000n }));

// ───────────────────────────── bribes ─────────────────────────────
export type BribeOffer = { id: number; briber: string; target: string; claimed: boolean; reclaimed: boolean; round: number; mine: boolean; forMe: boolean; wanted?: number; amount?: bigint; createdAt: number };
/** Offer `amount` (base units) to `target` if they vote for `wantedSlot`. Both values are encrypted. */
export async function offerBribe(target: string, wantedSlot: number, amount: bigint) {
  const a = moduleAddress("bribe");
  await ensureOperatorFor(a, "Approve the escrow to hold your bribe");
  const e = await encryptFor(a, (b) => { b.add8(wantedSlot); b.add64(amount); });
  return tx("Offer a bribe (encrypted escrow)", () => modC("bribe").offerBribe(ctx.roomId, target, e.handles[0], e.handles[1], e.inputProof, { gasLimit: 12_000_000n }));
}
export async function bribeOffers(decrypt: boolean): Promise<BribeOffer[]> {
  const c = modC("bribe"), n = Number(await c.offerCount(ctx.roomId)), me = ctx.account.toLowerCase(), out: BribeOffer[] = [];
  for (let i = 0; i < n; i++) {
    const o = await c.offerInfo(ctx.roomId, i);
    const x: BribeOffer = { id: i, briber: String(o.briber).toLowerCase(), target: String(o.target).toLowerCase(), claimed: Boolean(o.claimed), reclaimed: Boolean(o.reclaimed), round: Number(o.round), createdAt: Number(o.createdAt), mine: false, forMe: false };
    x.mine = x.briber === me; x.forMe = x.target === me;
    if (decrypt && (x.forMe || x.mine) && !x.reclaimed) {
      try { const d = await userDecryptAt(moduleAddress("bribe"), [o.wantedHandle, o.remainingHandle]); x.wanted = Number(d[o.wantedHandle]); x.amount = BigInt(d[o.remainingHandle]); } catch { /* not allowed / busy */ }
    }
    out.push(x);
  }
  return out;
}
export const claimBribe = (id: number) => tx("Claim the bribe (paid only if you voted as asked)", () => modC("bribe").claimBribe(ctx.roomId, id, { gasLimit: 12_000_000n }));
export const reclaimBribe = (id: number) => tx("Take back the unpaid part of the bribe", () => modC("bribe").reclaim(ctx.roomId, id, { gasLimit: 12_000_000n }));

// ───────────────────────────── leaderboard ─────────────────────────────
export type Row = { wallet: string; games: number; crewGames: number; crewWins: number; impGames: number; impWins: number; stakedWins: number; earnings: bigint | null };
export async function leaderboard(): Promise<Row[]> {
  if (!hasStats()) return [];
  const c = statsC(), total = Number(await c.playersCount());
  if (!total) return [];
  const p = await c.page(0, Math.min(total, 200));
  const rows: Row[] = (p.wallets as string[]).map((w, i) => {
    const r = p.records[i];
    return { wallet: w.toLowerCase(), games: Number(r.games), crewGames: Number(r.crewGames), crewWins: Number(r.crewWins), impGames: Number(r.impGames), impWins: Number(r.impWins), stakedWins: Number(r.stakedWins), earnings: null };
  });
  const zero = "0x" + "0".repeat(64), pub: { i: number; h: string }[] = [];
  (p.earnings as string[]).forEach((h, i) => { if (h && h !== zero) pub.push({ i, h }); });
  if (pub.length) {
    try {
      const r = await kms(pub.map((x) => x.h), "board");
      pub.forEach((x, k) => { rows[x.i].earnings = word(String(r.abiEncodedClearValues), k); });
    } catch { /* KMS busy: the board still shows the win counters */ }
  }
  return rows;
}
export const publishEarnings = () => tx("Publish my winnings on the board (opt-in)", () => statsC().publishEarnings());
export async function myEarnings(): Promise<bigint | null> {
  if (!hasStats()) return null;
  const h: string = await statsC().earningsHandle(ctx.account);
  if (/^0x0+$/.test(h)) return 0n;
  return BigInt((await userDecryptAt(statsAddress(), [h]))[h]);
}
