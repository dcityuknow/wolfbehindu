/** Kênh sự kiện tiến trình on-chain (giao dịch + KMS) — màn giải mã cuối game đăng ký để ghi từng bước lên khung radio. */
export type ChainEv = { kind: "tx" | "kms"; step: string; phase: "go" | "ok" | "retry"; hash?: string; n?: number };
export const chainEv: { fn: ((e: ChainEv) => void) | null } = { fn: null };
export const emit = (e: ChainEv) => { try { chainEv.fn?.(e); } catch { /* UI không được làm hỏng luồng chain */ } };
/** Trang giao dịch trên Sepolia (mở tab mới khi bấm). */
export const txUrl = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
export const shortHash = (h: string) => (h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : h);
