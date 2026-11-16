import { Contract } from "ethers";
import deployment from "../config/deployment.json";
import { ctx } from "./context";

/** Satellite contracts deployed next to the game (see contracts/): StakeVault, LostIslandStats and the optional modules.
 *  A feature whose contract is missing from deployment.json (not deployed / did not compile) is simply hidden by the UI. */
const D = deployment as any;
export type ModKey = "will" | "bounty" | "bribe" | "chat";

export const hasVault = () => !!D.vault && Array.isArray(D.abis?.vault);
export const hasStats = () => !!D.stats && Array.isArray(D.abis?.stats);
export const hasModule = (k: ModKey) => !!D.modules?.[k] && Array.isArray(D.abis?.[k]);
export const vaultAddress = (): string => D.vault || "";
export const statsAddress = (): string => D.stats || "";
export const moduleAddress = (k: ModKey): string => D.modules?.[k] || "";

const signerOrProvider = () => ctx.signer;
export const vaultC = () => new Contract(D.vault, D.abis.vault, signerOrProvider());
export const statsC = () => new Contract(D.stats, D.abis.stats, signerOrProvider());
export const modC = (k: ModKey) => new Contract(D.modules[k], D.abis[k], signerOrProvider());

/** Encrypt several values in ONE input proof, bound to `contract` (the contract that will call FHE.fromExternal on them). */
export async function encryptFor(contract: string, build: (b: any) => void) {
  const b = ctx.inst.createEncryptedInput(contract, ctx.account);
  build(b);
  return b.encrypt(); // { handles, inputProof }
}

/** A 32-byte line -> 4 x uint64 (8 bytes each, big-endian), the format LastWill stores (encrypted). */
export function packText(s: string): bigint[] {
  const bytes = Array.from(new TextEncoder().encode(s)).slice(0, 32);
  while (bytes.length < 32) bytes.push(0);
  const out: bigint[] = [];
  for (let w = 0; w < 4; w++) { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(bytes[w * 8 + i]); out.push(v); }
  return out;
}
export function unpackText(words: bigint[]): string {
  const bytes: number[] = [];
  for (const w of words) for (let i = 7; i >= 0; i--) bytes.push(Number((w >> BigInt(i * 8)) & 0xffn));
  while (bytes.length && bytes[bytes.length - 1] === 0) bytes.pop();
  return new TextDecoder().decode(new Uint8Array(bytes));
}
