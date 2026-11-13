import { ethers } from "ethers";
import { ctx } from "./context";
import { toast } from "../ui/dom";
import { UI } from "../story";

/**
 * Session wallet: a throw-away key kept in this browser. The player funds it once with a little Sepolia ETH and the room is created
 * with it registered as operator (inside the SAME transaction as the game start), so the technical steps (bot turns, bot votes,
 * meeting, tally, proofs) are sent without MetaMask popups. It can never act as the player. Keep only a tiny balance in it.
 * If anything fails we fall back to MetaMask signing.
 */
const KEY = "li_session_key", RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const FUND = "0.03", MIN = ethers.parseEther("0.008");
let pend: { w: ethers.Wallet; provider: ethers.JsonRpcProvider; fund: any } | null = null;

function loadKey(): string {
  try { const k = localStorage.getItem(KEY); if (k) return k; } catch { /* storage blocked */ }
  const k = ethers.Wallet.createRandom().privateKey;
  try { localStorage.setItem(KEY, k); } catch { /* in-memory only */ }
  return k;
}

/** Step 1 (before creating the game): if the session wallet is low, ask for the funding transfer (NOT waited for here).
 *  Returns the address to register as operator, or the zero address if the player declined / it failed. */
export async function prepareOperator(): Promise<string> {
  ctx.opGame = null; pend = null;
  try {
    const provider = new ethers.JsonRpcProvider(RPC), w = new ethers.Wallet(loadKey(), provider);
    toast(UI.opSetup);
    let fund = null;
    if ((await provider.getBalance(w.address)) < MIN) fund = await ctx.signer.sendTransaction({ to: w.address, value: ethers.parseEther(FUND) });
    pend = { w, provider, fund };
    return w.address;
  } catch (e: any) { toast(UI.opFallback + " (" + String(e.shortMessage || e.reason || e.message || "").slice(0, 60) + ")"); return ethers.ZeroAddress; }
}

/** Step 2 (after the game exists on-chain): wait until the session wallet can pay gas, then start using it. */
export async function activateOperator() {
  if (!pend) return;
  const { w, provider, fund } = pend; pend = null;
  try {
    if (fund) { toast(UI.opFunding); await fund.wait(); }
    for (let i = 0; i < 40 && (await provider.getBalance(w.address)) < MIN; i++) await new Promise((r) => setTimeout(r, 1000));   // the public RPC may lag a little
    if ((await provider.getBalance(w.address)) < MIN) throw new Error("session wallet has no gas yet");
    ctx.opGame = ctx.game.connect(w);
    toast(UI.opReady);
  } catch (e: any) { ctx.opGame = null; toast(UI.opFallback + " (" + String(e.shortMessage || e.reason || e.message || "").slice(0, 60) + ")"); }
}
