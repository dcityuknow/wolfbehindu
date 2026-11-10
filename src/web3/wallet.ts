import { ethers } from "ethers";
import deployment from "../config/deployment.json";
import { ctx } from "./context";
import { toast } from "../ui/dom";

export async function connect() {
  if (!deployment.address) throw new Error("Chưa deploy: chạy npm run deploy");
  if (!window.ethereum) throw new Error("Chưa cài ví MetaMask — cài tại metamask.io rồi tải lại trang");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] }); } catch { /* user tự đổi mạng */ }
  const provider = new ethers.BrowserProvider(window.ethereum);
  if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error("Hãy chuyển MetaMask sang mạng Sepolia rồi thử lại");
  ctx.signer = await provider.getSigner();
  ctx.account = await ctx.signer.getAddress();
  ctx.address = deployment.address;
  ctx.game = new ethers.Contract(deployment.address, deployment.abi, ctx.signer);
  toast("Khởi tạo Zama SDK…");
  const L = window.relayerSDK;
  await L.initSDK();
  ctx.inst = await L.createInstance({ ...L.SepoliaConfig, network: window.ethereum });
}
