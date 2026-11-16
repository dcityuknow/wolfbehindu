import { Contract, ZeroHash } from "ethers";
import deployment from "../config/deployment.json";
import { ctx } from "./context";
import { tx, parseEvents } from "./chain";
import { kms, userDecryptAt } from "./fhe";
import { hasVault, vaultAddress, vaultC } from "./modules";

/** PvP + stake helpers. Everything goes through the player's own wallet (no session operator, no bots). */
const FHE_GAS = 12_000_000n;
const TOKEN_ABI = [
  "function isOperator(address holder, address spender) view returns (bool)",
  "function setOperator(address operator, uint48 until)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
  "function symbol() view returns (string)",
];
export const tokenAddress = (): string => (deployment as any).token || "";
const token = () => new Contract(tokenAddress(), TOKEN_ABI, ctx.signer);
export const stakingEnabled = () => /^0x[0-9a-fA-F]{40}$/.test(tokenAddress()) && !/^0x0+$/.test(tokenAddress()) && hasVault();

/** Stakes (and bribes) are pulled by a contract, so the player first approves it as ERC-7984 operator (time-limited, 30 days). */
export async function ensureOperatorFor(spender: string, what = "Approve the vault to move your cUSDT stake") {
  const t = token();
  if (await t.isOperator(ctx.account, spender)) return;
  await tx(what, () => t.setOperator(spender, Math.floor(Date.now() / 1e3) + 30 * 86400));
}
export const ensureOperator = () => ensureOperatorFor(vaultAddress());
/** Your own encrypted cUSDT balance, decrypted locally (only you can). null if staking is off / nothing to read. */
export async function myTokenBalance(): Promise<bigint | null> {
  if (!stakingEnabled()) return null;
  const h: string = await token().confidentialBalanceOf(ctx.account);
  if (h === ZeroHash) return 0n;
  return (await userDecryptAt(tokenAddress(), [h]))[h];
}

/** stake = 0 -> free room. isPublic -> listed in Quick Match. */
export async function createRoom(stake: bigint, isPublic = false): Promise<bigint> {
  if (stake > 0n) await ensureOperator();
  let r: any;
  if (isPublic) r = await tx(stake > 0n ? "Create public staked room (encrypted stake)" : "Create public room", () => ctx.game.createOpenRoom(stake, { gasLimit: FHE_GAS }));
  else if (stake > 0n) r = await tx("Create staked room (encrypted stake)", () => ctx.game.createStakedRoom(stake, { gasLimit: FHE_GAS }));
  else r = await tx("Create room", () => ctx.game.createRoom(false));
  const id = parseEvents(r).find((e: any) => e.name === "RoomCreated").args.roomId as bigint;
  ctx.roomId = id; return id;
}
/** Quick Match: join the fullest public lobby with this exact entry fee (0 = free), or open a new public one. */
export async function quickMatch(stake: bigint): Promise<{ id: bigint; created: boolean }> {
  const o = await ctx.game.getOpenRooms(0, 80);
  let best = -1;
  for (let i = 0; i < o.ids.length; i++) {
    if (BigInt(o.stakes[i]) !== stake) continue;
    const rv = await ctx.game.getPlayers(o.ids[i]);
    if ((rv.wallets as string[]).some((w) => w.toLowerCase() === ctx.account.toLowerCase())) { ctx.roomId = BigInt(o.ids[i]); return { id: ctx.roomId, created: false }; }
    if (best < 0 || Number(o.counts[i]) > Number(o.counts[best])) best = i;
  }
  if (best >= 0) { const id = BigInt(o.ids[best]); await joinRoom(id, stake); return { id, created: false }; }
  return { id: await createRoom(stake, true), created: true };
}
export async function openRooms(): Promise<{ id: bigint; stake: bigint; players: number }[]> {
  const o = await ctx.game.getOpenRooms(0, 80);
  return o.ids.map((id: bigint, i: number) => ({ id: BigInt(id), stake: BigInt(o.stakes[i]), players: Number(o.counts[i]) }));
}
export async function joinRoom(id: bigint, stake: bigint) {
  if (stake > 0n) await ensureOperator();
  await tx(stake > 0n ? "Join room (encrypted stake)" : "Join room", () => ctx.game.joinRoom(id, { gasLimit: FHE_GAS }));
  ctx.roomId = id;
}
export const startRoom = () => tx("Deal encrypted roles (FHE)", () => ctx.game.startGame(ctx.roomId, { gasLimit: FHE_GAS }));
export const cancelRoom = () => tx("Cancel room", () => ctx.game.cancelRoom(ctx.roomId));
export const abortStalled = () => tx("Abort stalled game", () => ctx.game.abortStalled(ctx.roomId));
export const claimRefund = () => tx("Claim refund (encrypted)", () => vaultC().claimRefund(ctx.roomId, { gasLimit: FHE_GAS }));

export async function roomView(id: bigint) {
  const [r, p, s, x] = await Promise.all([ctx.game.getRoom(id), ctx.game.getPlayers(id), ctx.game.getStakeInfo(id), ctx.game.getRoomExtra(id)]);
  return {
    host: String(r.host).toLowerCase(), isSolo: Boolean(r.isSolo), phase: Number(r.phase), winner: Number(r.winner), pendingKind: Number(r.pendingKind),
    humanCount: Number(r.humanCount), totalSlots: Number(r.totalSlots), round: Number(r.round), voteDeadline: Number(r.voteDeadline), votesCast: Number(r.votesCast),
    wallets: (p.wallets as string[]).map((w) => w.toLowerCase()), ejected: p.ejected as boolean[],
    stake: BigInt(s.stake), settled: Boolean(s.settled), winnersCount: Number(s.winnersCount), isPublic: Boolean(x.isPublic), createdAt: Number(x.createdAt),
  };
}
export const isWinner = (slot: number): Promise<boolean> => ctx.game.isWinner(ctx.roomId, slot);
export const hasClaimed = (_slot?: number): Promise<boolean> => vaultC().claimed(ctx.roomId, ctx.account);

/** Game over: unlock all roles (KMS public decryption) so anybody can audit the deal. Returns roles per slot (1 = spy). */
export async function revealRoles(n: number): Promise<number[]> {
  await tx("Unlock roles (FHE public decrypt)", () => ctx.game.revealRoles(ctx.roomId));
  return (await decryptRoles(n)).roles;
}
async function decryptRoles(n: number) {
  const hs: string[] = await Promise.all(Array.from({ length: n }, (_, i) => ctx.game.getRoleHandleOf(ctx.roomId, i)));
  const r = await kms(hs, "roles");
  const roles = (r.abiEncodedClearValues.slice(2).match(/.{64}/g) ?? []).map((w: string) => Number(BigInt("0x" + w)));
  return { roles, abi: r.abiEncodedClearValues as string, proof: r.decryptionProof as string };
}
/** Finished PvP room (free or staked): send the KMS-signed roles to the contract, which verifies them, fixes the winning side
 *  and reports the game to the leaderboard. */
export async function settleRoom(n: number) {
  const d = await decryptRoles(n);
  return tx("Settle game (verified on-chain)", () => ctx.game.settleRoom(ctx.roomId, d.abi, d.proof, { gasLimit: FHE_GAS }));
}
export const claimPayout = () => tx("Claim your share of the pot (encrypted)", () => vaultC().claimPayout(ctx.roomId, { gasLimit: FHE_GAS }));
/** Anyone, after the game: make the final prize pool public and read it (it stays secret during the game). Returns base units. */
export async function revealPot(): Promise<bigint> {
  await tx("Reveal the prize pool (FHE public decrypt)", () => vaultC().revealPot(ctx.roomId));
  const h: string = await vaultC().getPotHandle(ctx.roomId);
  const r = await kms([h], "pot");
  return BigInt("0x" + String(r.abiEncodedClearValues).slice(2, 66));
}
