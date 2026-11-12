import { ctx } from "./context";
import { encrypt8, userDecrypt, publicDecryptPending } from "./fhe";
import { toast } from "../ui/dom";
import { NO_TARGET } from "../config";

let queue: Promise<unknown> = Promise.resolve();
/** Every transaction goes through a sequential queue (avoids nonce clashes) + toast. */
export function tx(label: string, fn: () => Promise<any>): Promise<any> {
  const p = queue.then(async () => {
    toast(label + "…");
    try { const r = await (await fn()).wait(); toast("✓ " + label); return r; }
    catch (e: any) { toast("✗ " + label + ": " + String(e.shortMessage || e.reason || e.message || "").slice(0, 80)); throw e; }
  });
  queue = p.catch(() => {});
  return p;
}
export const parseEvents = (r: any) => r.logs.map((l: any) => { try { return ctx.game.interface.parseLog(l); } catch { return null; } }).filter(Boolean);

/** Contract used for the technical, role-free calls: the session wallet if set up (no popups), otherwise the player wallet. */
const op = () => ctx.opGame ?? ctx.game;

export async function createSoloRoom() {
  const r = await tx("Create solo room", () => ctx.game.createRoom(true));
  ctx.roomId = parseEvents(r).find((e: any) => e.name === "RoomCreated").args.roomId;
}
export const startGame = () => tx("Assign roles (FHE)", () => ctx.game.startGame(ctx.roomId));
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
export const botsCatchUp = () => serial(async () => {
  for (let k = 0; k < 8; k++) {
    const n = Number(await ctx.game.pendingBotTurns(ctx.roomId)); if (!n) return;
    await tx(`Bots acting (${n} left)`, () => op().runBotTurns(ctx.roomId));
  }
});
export const botsVote = () => serial(async () => {
  for (let k = 0; k < 8; k++) {
    const n = Number(await ctx.game.pendingBotVotes(ctx.roomId)); if (!n) return;
    await tx(`Bots voting (${n} left)`, () => op().runBotVotes(ctx.roomId));
  }
});
export async function secretAct(target: number = NO_TARGET) {
  await botsCatchUp();
  const e = await encrypt8(target);
  return tx("Action (encrypted)", () => ctx.game.executeSecretKill(ctx.roomId, e.handles[0], e.inputProof));
}
export const completeTask = () => tx("Complete task (on-chain)", () => ctx.game.completeTask(ctx.roomId));
export const callMeeting = async () => { await botsCatchUp(); return tx("Open meeting (on-chain)", () => op().callMeeting(ctx.roomId)); };
export const getRoom = () => ctx.game.getRoom(ctx.roomId);
export async function castVote(target: number) {
  const e = await encrypt8(target);
  return tx("Secret vote", () => ctx.game.castShieldedVote(ctx.roomId, e.handles[0], e.inputProof));
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
export const reportExecution = () => tx("Record your death on-chain", () => ctx.game.reportExecution(ctx.roomId));
/** Friendly fire: you shot a squadmate dead. Records it on-chain so the victim stays dead until the game ends. */
export const reportFriendlyKill = (victim: number) => tx("Record teammate's death on-chain", () => ctx.game.reportFriendlyKill(ctx.roomId, victim));
