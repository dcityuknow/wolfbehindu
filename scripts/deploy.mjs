import solc from "solc";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import "dotenv/config";

const SRC = "contracts/SpaceImpostorFHE.sol";
const input = {
  language: "Solidity",
  sources: { [SRC]: { content: fs.readFileSync(SRC, "utf8") } },
  settings: {
    evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const findImport = (p) => {
  try { return { contents: fs.readFileSync(path.join("node_modules", p), "utf8") }; }
  catch { return { error: "Not found: " + p }; }
};
const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errs = (out.errors || []).filter((e) => e.severity === "error");
if (errs.length) { errs.forEach((e) => console.error(e.formattedMessage)); process.exit(1); }
const c = out.contracts[SRC].SpaceImpostorFHE;
console.log("✓ Compiled. Bytecode:", c.evm.bytecode.object.length / 2, "bytes");

if (process.argv.includes("--compile-only")) {
  fs.writeFileSync("web/config.json", JSON.stringify({ address: "", abi: c.abi, chainId: 11155111 }));
  process.exit(0);
}
if (!process.env.PRIVATE_KEY) { console.error("Thiếu PRIVATE_KEY trong .env"); process.exit(1); }
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
console.log("Deploying from", wallet.address);
const factory = new ethers.ContractFactory(c.abi, "0x" + c.evm.bytecode.object, wallet);
const ct = await factory.deploy();
await ct.waitForDeployment();
const address = await ct.getAddress();
fs.writeFileSync("web/config.json", JSON.stringify({ address, abi: c.abi, chainId: 11155111 }));
console.log("✓ Deployed:", address, "→ web/config.json");
