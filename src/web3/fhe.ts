import { ctx } from "./context";
import { toast } from "../ui/dom";

/** Mã hoá 1 giá trị uint8 phía client (vote / mục tiêu kill). */
export async function encrypt8(v: number) {
  const b = ctx.inst.createEncryptedInput(ctx.address, ctx.account);
  b.add8(v);
  return b.encrypt(); // { handles, inputProof }
}

let permit: { kp: any; start: number; days: number; sig: string; exp: number } | null = null;

/** User-decrypt: ký EIP-712 một lần (cache 1 ngày) rồi giải mã các handle mà ví này được ACL cho phép. */
const PKEY = () => `li_permit_${ctx.account}_${ctx.address}`;
export async function userDecrypt(handles: string[]): Promise<Record<string, bigint>> {
  if (!permit) { try { const s = localStorage.getItem(PKEY()); if (s) permit = JSON.parse(s); } catch { /* ignore */ } }   // reuse today's signature after a reload
  if (!permit || permit.exp < Date.now() / 1e3) {
    const kp = ctx.inst.generateKeypair(), start = Math.floor(Date.now() / 1e3), days = 1;
    const eip = ctx.inst.createEIP712(kp.publicKey, [ctx.address], start, days);
    toast("✍ Sign EIP-712 to decrypt (no gas)…");
    const sig = await ctx.signer.signTypedData(eip.domain, { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification }, eip.message);
    permit = { kp, start, days, sig, exp: Date.now() / 1e3 + 80000 };
    try { localStorage.setItem(PKEY(), JSON.stringify(permit)); } catch { /* ignore */ }
  }
  const p = permit;
  return ctx.inst.userDecrypt(handles.map((h) => ({ handle: h, contractAddress: ctx.address })), p.kp.privateKey, p.kp.publicKey, p.sig.replace("0x", ""), [ctx.address], ctx.account, p.start, p.days);
}

/** Giải mã công khai các handle đang chờ trong contract -> { abiEncodedClearValues, decryptionProof }. */
export async function publicDecryptPending() {
  const hs: string[] = await ctx.game.getPendingHandles(ctx.roomId);
  return ctx.inst.publicDecrypt([...hs]);
}
