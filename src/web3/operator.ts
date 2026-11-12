import { ethers } from "ethers";
import { ctx } from "./context";
import { toast } from "../ui/dom";
import { UI } from "../story";

/**
 * Session wallet: a throw-away key kept in this browser. The player funds it once with a little Sepolia ETH and registers it as the
 * room's operator, so the technical steps (bot turns, bot votes, meeting, tally, proofs) are sent without MetaMask popups.
 * It can never act as the player. Keep only a tiny balance in it. If anything fails we silently fall back to MetaMask signing.
 */
const KEY = "li_session_key", RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const FUND = "0.03", MIN = ethers.parseEther("0.008");

function loadKey(): string {
  try { const k = localStorage.getItem(KEY); if (k) return k; } catch { /* storage blocked */ }
  const k = ethers.Wallet.createRandom().privateKey;
  try { localStorage.setItem(KEY, k); } catch { /* in-memory only */ }
  return k;
}

/** Fund the session wallet (1 MetaMask popup, only when its balance is low) and register it as the room operator (1 popup). */
export async function setupOperator() {
  ctx.opGame = null;
  try {
    const provider = new ethers.JsonRpcProvider(RPC), w = new ethers.Wallet(loadKey(), provider);
    toast(UI.opSetup);
    if ((await provider.getBalance(w.address)) < MIN) {
      const t = await ctx.signer.sendTransaction({ to: w.address, value: ethers.parseEther(FUND) });
      toast(UI.opFunding); await t.wait();
      for (let i = 0; i < 20 && (await provider.getBalance(w.address)) < MIN; i++) await new Promise((r) => setTimeout(r, 1500));   // wait until the public RPC sees it
    }
    await (await ctx.game.setOperator(ctx.roomId, w.address)).wait();
    ctx.opGame = ctx.game.connect(w);
    toast(UI.opReady);
  } catch (e: any) {
    ctx.opGame = null;
    toast(UI.opFallback + " (" + String(e.shortMessage || e.reason || e.message || "").slice(0, 60) + ")");
  }
}
