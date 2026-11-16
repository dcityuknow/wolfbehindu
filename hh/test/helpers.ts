import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const GAS = { gasLimit: 15_000_000 };
export enum Phase { Lobby, Playing, Voting, Tallying, Finished, Cancelled }
export enum Winner { None, Crewmates, Impostors, FriendlyFire }
export const NO_TARGET = 255;

/** Deploys the whole system exactly like scripts/deploy.mjs: stats, vault (only with a token), game, the modules, then the one-shot wiring. */
export async function deployAll(withToken = true) {
  const signers = await ethers.getSigners();
  const F = async (name: string, ...args: any[]) => { const c: any = await (await ethers.getContractFactory(name)).deploy(...args); await c.waitForDeployment(); return c; };
  const token: any = withToken ? await F("MockCUSDT") : null;
  const stats = await F("LostIslandStats");
  const vault: any = withToken ? await F("StakeVault", await token.getAddress()) : null;
  const game = await F("SpaceImpostorFHE");
  const ga = await game.getAddress();
  const will = await F("LastWill", ga), chat = await F("RoomChat", ga);
  const bounty: any = withToken ? await F("BountyBoard", ga, await vault.getAddress()) : null;
  const bribe: any = withToken ? await F("BribeEscrow", ga, await token.getAddress()) : null;
  const va = vault ? await vault.getAddress() : ethers.ZeroAddress;
  const hooks = [bounty, bribe].filter(Boolean);
  await (await game.configure(va, await stats.getAddress(), await Promise.all(hooks.map((x: any) => x.getAddress())))).wait();
  await (await stats.wire(ga, va)).wait();
  if (vault) await (await vault.wire(ga, await stats.getAddress(), bounty ? [await bounty.getAddress()] : [])).wait();
  return { game, token, vault, stats, will, chat, bounty, bribe, signers };
}

/** Encrypt values for ANY contract (the proof is bound to that contract + the user). */
export async function encFor(contract: string, user: HardhatEthersSigner, build: (b: any) => void) {
  const b = fhevm.createEncryptedInput(contract, user.address); build(b);
  return b.encrypt();
}

/** Encrypt one uint8 for `user` -> call args [handle, proof]. */
export async function enc8(game: any, user: HardhatEthersSigner, v: number) {
  const e = await fhevm.createEncryptedInput(await game.getAddress(), user.address).add8(v).encrypt();
  return [e.handles[0], e.inputProof] as const;
}

/** A player decrypts their OWN role (0 = crew, 1 = spy). */
export async function myRole(game: any, roomId: bigint | number, user: HardhatEthersSigner): Promise<number> {
  const h = await game.getRoleHandle(roomId, user.address);
  return Number(await fhevm.userDecryptEuint(FhevmType.euint8, h, await game.getAddress(), user));
}

/** Test-only audit: read EVERY slot's role with the mock debugger (never possible on a real network before the game ends). */
export async function allRoles(game: any, roomId: bigint | number, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Number(await fhevm.debugger.decryptEuint(FhevmType.euint8, await game.getRoleHandleOf(roomId, i))));
  return out;
}

export async function newPvpRoom(game: any, players: HardhatEthersSigner[]) {
  await game.connect(players[0]).createRoom(false);
  const roomId: bigint = await game.roomCount();
  for (const p of players.slice(1)) await game.connect(p).joinRoom(roomId);
  await game.connect(players[0]).startGame(roomId, GAS);
  return roomId;
}

/** Splits a started PvP room into [spy, ...crew] by letting each player decrypt their own role. */
export async function splitRoles(game: any, roomId: bigint, players: HardhatEthersSigner[]) {
  const roles: number[] = [];
  for (const p of players) roles.push(await myRole(game, roomId, p));   // sequential: the mock coprocessor cursor is not re-entrant
  const spyIdx = roles.indexOf(1);
  return { spy: players[spyIdx], spyIdx, crew: players.filter((_, i) => i !== spyIdx), roles };
}

/** requestX -> KMS public decryption (mock) -> submitX. */
export async function publicDecryptPending(game: any, roomId: bigint) {
  const hs: string[] = await game.getPendingHandles(roomId);
  return fhevm.publicDecrypt(hs);
}

export async function checkpoint(game: any, roomId: bigint, by: HardhatEthersSigner) {
  await game.connect(by).requestCheckpoint(roomId, GAS);
  const d = await publicDecryptPending(game, roomId);
  await game.connect(by).submitCheckpoint(roomId, d.abiEncodedClearValues, d.decryptionProof);
}

export async function tally(game: any, roomId: bigint, by: HardhatEthersSigner) {
  await game.connect(by).tallyVotes(roomId, GAS);
  const d = await publicDecryptPending(game, roomId);
  return game.connect(by).finalizeTally(roomId, d.abiEncodedClearValues, d.decryptionProof);
}

export async function revealAndDecrypt(game: any, roomId: bigint, by: HardhatEthersSigner, n: number) {
  await game.connect(by).revealRoles(roomId);
  const hs: string[] = await Promise.all(Array.from({ length: n }, (_, i) => game.getRoleHandleOf(roomId, i)));
  return fhevm.publicDecrypt(hs);
}

/** Decrypt a confidential-token balance as `user`. */
export async function balanceOf(token: any, user: HardhatEthersSigner): Promise<bigint> {
  const h = await token.confidentialBalanceOf(user.address);
  if (h === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, h, await token.getAddress(), user);
}
