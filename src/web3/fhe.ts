import { t } from "../i18n";
import { ctx } from "./context";
import { toast } from "../ui/dom";
import { emit } from "./events";
import { showCrypt } from "../ui/cryptFx";

/** Mã hoá 1 giá trị uint8 phía client (vote / mục tiêu kill). */
export async function encrypt8(v: number) {
  const b = ctx.inst.createEncryptedInput(ctx.address, ctx.account);
  b.add8(v);
  return b.encrypt(); // { handles, inputProof }
}

type Permit = { kp: any; start: number; days: number; sig: string; exp: number };
const permits = new Map<string, Permit>();

/** User-decrypt: sign ONE EIP-712 permit per contract (cached for a day, also across reloads), then decrypt the handles this wallet is allowed to read (ACL). */
export async function userDecryptAt(contract: string, handles: string[]): Promise<Record<string, bigint>> {
  const key = `li_permit_${ctx.account}_${contract}`;
  let permit = permits.get(key) ?? null;
  if (!permit) { try { const s = localStorage.getItem(key); if (s) permit = JSON.parse(s); } catch { /* ignore */ } }   // reuse today's signature after a reload
  if (!permit || permit.exp < Date.now() / 1e3) {
    const kp = ctx.inst.generateKeypair(), start = Math.floor(Date.now() / 1e3), days = 1;
    const eip = ctx.inst.createEIP712(kp.publicKey, [contract], start, days);
    toast(t("toast.sign"));
    const sig = await ctx.signer.signTypedData(eip.domain, { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification }, eip.message);
    permit = { kp, start, days, sig, exp: Date.now() / 1e3 + 80000 };
    try { localStorage.setItem(key, JSON.stringify(permit)); } catch { /* ignore */ }
  }
  permits.set(key, permit);
  const p = permit;
  return ctx.inst.userDecrypt(handles.map((h) => ({ handle: h, contractAddress: contract })), p.kp.privateKey, p.kp.publicKey, p.sig.replace("0x", ""), [contract], ctx.account, p.start, p.days);
}
/** Decrypt handles owned by the GAME contract. */
export const userDecrypt = (handles: string[]) => userDecryptAt(ctx.address, handles);

/** Giải mã công khai các handle đang chờ trong contract -> { abiEncodedClearValues, decryptionProof }. */
export async function publicDecryptPending() {
  const hs: string[] = await ctx.game.getPendingHandles(ctx.roomId);
  return kms(hs, "death");
}

/** KMS public decrypt, tự thử lại khi relayer báo chưa sẵn sàng (ngay sau tx handle thường chưa kịp đồng bộ) — không bắt người chơi bấm Retry. */
export async function kms(hs: string[], step: string) {
  const done = showCrypt("KMS public decryption");
  try { return await kmsInner(hs, step); } finally { done(); }
}
async function kmsInner(hs: string[], step: string) {
  let last: unknown;
  for (let k = 0; k < 6; k++) {
    toast(k ? `🔑 KMS decrypt — retry ${k}…` : "🔑 KMS decrypting (FHE)…"); emit(k ? { kind: "kms", step, phase: "retry", n: k } : { kind: "kms", step, phase: "go" });
    try { const r = await ctx.inst.publicDecrypt([...hs]); toast("✓ KMS decrypted"); emit({ kind: "kms", step, phase: "ok" }); return r; }
    catch (e) { last = e; await new Promise((res) => setTimeout(res, 2500)); }
  }
  throw last;
}

/** Giải mã công khai một danh sách handle bất kỳ (đã được contract makePubliclyDecryptable) -> mảng số theo đúng thứ tự handle. */
export async function publicDecryptValues(handles: string[]): Promise<number[]> {
  const r = await kms(handles, "roles");
  const { AbiCoder } = await import("ethers");
  return (AbiCoder.defaultAbiCoder().decode(handles.map(() => "uint256"), r.abiEncodedClearValues) as unknown as bigint[]).map(Number);
}
