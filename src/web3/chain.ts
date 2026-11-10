import { ctx } from "./context";
import { encrypt8, userDecrypt, publicDecryptPending } from "./fhe";
import { toast } from "../ui/dom";
import { NO_TARGET } from "../config";

let queue: Promise<unknown> = Promise.resolve();
/** Mọi giao dịch đi qua hàng đợi tuần tự (tránh trùng nonce) + báo toast. */
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

export async function createSoloRoom() {
  const r = await tx("Tạo phòng Solo", () => ctx.game.createRoom(true));
  ctx.roomId = parseEvents(r).find((e: any) => e.name === "RoomCreated").args.roomId;
}
export const startGame = () => tx("Chia vai trò (FHE)", () => ctx.game.startGame(ctx.roomId));
export async function fetchMyRole(): Promise<0 | 1> {
  const h = await ctx.game.getRoleHandle(ctx.roomId, ctx.account);
  return Number((await userDecrypt([h]))[h]) as 0 | 1;
}
export async function fetchStatuses(slots: number[]): Promise<number[]> {
  const hs: string[] = await Promise.all(slots.map((i) => ctx.game.getStatusHandle(ctx.roomId, i)));
  const r = await userDecrypt(hs);
  return hs.map((h) => Number(r[h]));
}
export async function secretAct(target: number = NO_TARGET) {
  const e = await encrypt8(target);
  return tx("Hành động (mã hoá)", () => ctx.game.executeSecretKill(ctx.roomId, e.handles[0], e.inputProof));
}
export const completeTask = () => tx("Hoàn thành task (on-chain)", () => ctx.game.completeTask(ctx.roomId));
export const callMeeting = () => tx("Mở họp (on-chain)", () => ctx.game.callMeeting(ctx.roomId));
export const getRoom = () => ctx.game.getRoom(ctx.roomId);
export async function castVote(target: number) {
  const e = await encrypt8(target);
  return tx("Vote kín", () => ctx.game.castShieldedVote(ctx.roomId, e.handles[0], e.inputProof));
}
/** tallyVotes -> public decrypt -> finalizeTally. Trả về receipt của finalize. */
export async function tallyAndFinalize() {
  await tx("Kiểm phiếu", () => ctx.game.tallyVotes(ctx.roomId));
  const d = await publicDecryptPending();
  return tx("Nộp proof giải mã", () => ctx.game.finalizeTally(ctx.roomId, d.abiEncodedClearValues, d.decryptionProof));
}
export async function checkpointOnChain() {
  await tx("Kiểm tra thắng (FHE)", () => ctx.game.requestCheckpoint(ctx.roomId));
  const d = await publicDecryptPending();
  await tx("Nộp proof", () => ctx.game.submitCheckpoint(ctx.roomId, d.abiEncodedClearValues, d.decryptionProof));
}
