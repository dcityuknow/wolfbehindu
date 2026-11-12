import { ethers } from "ethers";
import deployment from "../config/deployment.json";
import { ctx } from "./context";
import { toast } from "../ui/dom";

export async function connect() {
  if (!deployment.address) throw new Error("Contract not deployed: run npm run deploy");
  if (!window.ethereum) throw new Error("MetaMask is not installed — get it at metamask.io and reload the page");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] }); } catch { /* user tự đổi mạng */ }
  const provider = new ethers.BrowserProvider(window.ethereum);
  if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error("Please switch MetaMask to the Sepolia network and try again");
  ctx.signer = await provider.getSigner();
  ctx.account = await ctx.signer.getAddress();
  ctx.address = deployment.address;
  ctx.game = new ethers.Contract(deployment.address, deployment.abi, ctx.signer);
  toast("Initializing Zama SDK…");
  const L = window.relayerSDK;
  await L.initSDK();
  ctx.inst = await L.createInstance({ ...L.SepoliaConfig, network: window.ethereum });
}
