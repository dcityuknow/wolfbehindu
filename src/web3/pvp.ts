import { Contract, ZeroHash } from "ethers";
import deployment from "../config/deployment.json";
import { ctx } from "./context";
import { tx, parseEvents } from "./chain";
import { kms, userDecryptAt } from "./fhe";

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
export const stakingEnabled = () => /^0x[0-9a-fA-F]{40}$/.test(tokenAddress()) && !/^0x0+$/.test(tokenAddress());

/** The game contract may only pull stakes after the player approved it as operator on the token (time-limited, 30 days). */
export async function ensureOperator() {
  const t = token();
  if (await t.isOperator(ctx.account, ctx.address)) return;
  await tx("Approve the game to move your cUSDT stake", () => t.setOperator(ctx.address, Math.floor(Date.now() / 1e3) + 30 * 86400));
}
/** Your own encrypted cUSDT balance, decrypted locally (only you can). null if staking is off / nothing to read. */
export async function myTokenBalance(): Promise<bigint | null> {
  if (!stakingEnabled()) return null;
  const h: string = await token().confidentialBalanceOf(ctx.account);
  if (h === ZeroHash) return 0n;
  return (await userDecryptAt(tokenAddress(), [h]))[h];
}

export async function createRoom(stake: bigint): Promise<bigint> {
  const r = stake > 0n
    ? await (await ensureOperator(), tx("Create staked room (encrypted stake)", () => ctx.game.createStakedRoom(stake, { gasLimit: FHE_GAS })))
    : await tx("Create room", () => ctx.game.createRoom(false));
  const id = parseEvents(r).find((e: any) => e.name === "RoomCreated").args.roomId as bigint;
  ctx.roomId = id; return id;
}
export async function joinRoom(id: bigint, stake: bigint) {
  if (stake > 0n) await ensureOperator();
  await tx(stake > 0n ? "Join room (encrypted stake)" : "Join room", () => ctx.game.joinRoom(id, { gasLimit: FHE_GAS }));
  ctx.roomId = id;
}
export const startRoom = () => tx("Deal encrypted roles (FHE)", () => ctx.game.startGame(ctx.roomId, { gasLimit: FHE_GAS }));
export const cancelRoom = () => tx("Cancel room", () => ctx.game.cancelRoom(ctx.roomId));
export const abortStalled = () => tx("Abort stalled game", () => ctx.game.abortStalled(ctx.roomId));
export const claimRefund = () => tx("Claim refund (encrypted)", () => ctx.game.claimRefund(ctx.roomId, { gasLimit: FHE_GAS }));

export async function roomView(id: bigint) {
  const [r, p, s] = await Promise.all([ctx.game.getRoom(id), ctx.game.getPlayers(id), ctx.game.getStakeInfo(id)]);
  return {
    host: String(r.host).toLowerCase(), isSolo: Boolean(r.isSolo), phase: Number(r.phase), winner: Number(r.winner), pendingKind: Number(r.pendingKind),
    humanCount: Number(r.humanCount), totalSlots: Number(r.totalSlots), round: Number(r.round), voteDeadline: Number(r.voteDeadline), votesCast: Number(r.votesCast),
    wallets: (p.wallets as string[]).map((w) => w.toLowerCase()), ejected: p.ejected as boolean[],
    stake: BigInt(s.stake), settled: Boolean(s.settled), winnersCount: Number(s.winnersCount),
  };
}
export const isWinner = (slot: number): Promise<boolean> => ctx.game.isWinner(ctx.roomId, slot);
export const hasClaimed = (slot: number): Promise<boolean> => ctx.game.hasClaimed(ctx.roomId, slot);

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
/** Staked room: send the KMS-signed roles to the contract, which verifies them and fixes the winning side. */
export async function settleStake(n: number) {
  const d = await decryptRoles(n);
  return tx("Settle stakes (verified on-chain)", () => ctx.game.settleStake(ctx.roomId, d.abi, d.proof, { gasLimit: FHE_GAS }));
}
export const claimPayout = () => tx("Claim your share of the pot (encrypted)", () => ctx.game.claimPayout(ctx.roomId, { gasLimit: FHE_GAS }));
