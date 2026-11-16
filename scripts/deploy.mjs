import solc from "solc";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import "dotenv/config";
import { srcHash } from "./srchash.mjs";

/** Confidential USDT (ERC-7984) on Sepolia, from the official Zama protocol registry (CONFIDENTIAL_USDT_MOCK).
 *  Override with STAKE_TOKEN in .env. Use 0x000...000 to disable staking (no vault, bounties or bribes). Always re-check it against
 *  https://github.com/zama-ai/protocol-registry/blob/main/testnet.md before deploying. */
const DEFAULT_CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491";
const hash = srcHash();

// ── what gets compiled ──
// CORE must compile: the game, its StakeVault escrow and the leaderboard. Compiled together; any error stops the deploy.
const CORE = [
  ["contracts/SpaceImpostorFHE.sol", "SpaceImpostorFHE"],
  ["contracts/stake/StakeVault.sol", "StakeVault"],
  ["contracts/stats/LostIslandStats.sol", "LostIslandStats"],
];
// OPTIONAL modules are compiled one by one: if one fails the game still deploys (without that feature) and says so.
const OPTIONAL = [
  ["contracts/modules/LastWill.sol", "LastWill", "will"],
  ["contracts/modules/BountyBoard.sol", "BountyBoard", "bounty"],
  ["contracts/modules/BribeEscrow.sol", "BribeEscrow", "bribe"],
  ["contracts/modules/RoomChat.sol", "RoomChat", "chat"],
];

const findImport = (p) => {
  for (const f of [p, path.join("node_modules", p)]) { try { return { contents: fs.readFileSync(f, "utf8") }; } catch { /* next */ } }
  return { error: "Not found: " + p };
};
function compile(entries) {
  const sources = {};
  for (const [file] of entries) sources[file] = { content: fs.readFileSync(file, "utf8") };
  const input = {
    language: "Solidity", sources,
    settings: { evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
  const errs = (out.errors || []).filter((e) => e.severity === "error");
  if (errs.length) return { errs };
  const res = {};
  for (const [file, name] of entries) { const c = out.contracts[file][name]; res[name] = { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }; }
  return { res };
}

console.log("⚙ Compiling core contracts (game, StakeVault, leaderboard)…");
const core = compile(CORE);
if (core.errs) { core.errs.forEach((e) => console.error(e.formattedMessage)); process.exit(1); }
for (const [, name] of CORE) console.log(`  ✓ ${name}: ${(core.res[name].bytecode.length - 2) / 2} bytes${name === "SpaceImpostorFHE" && (core.res[name].bytecode.length - 2) / 2 > 24576 ? "  ⚠ over the 24,576-byte limit!" : ""}`);
const mods = {};   // key -> { name, abi, bytecode }
for (const [file, name, key] of OPTIONAL) {
  const r = compile([[file, name]]);
  if (r.errs) { console.warn(`  ⚠ ${name} did not compile: that feature is disabled.\n${r.errs.map((e) => "    " + e.formattedMessage.split("\n")[0]).join("\n")}`); continue; }
  mods[key] = { name, ...r.res[name] };
  console.log(`  ✓ ${name}: ${(r.res[name].bytecode.length - 2) / 2} bytes`);
}

const abis = { vault: core.res.StakeVault.abi, stats: core.res.LostIslandStats.abi };
for (const [k, m] of Object.entries(mods)) abis[k] = m.abi;
const empty = { address: "", token: "", vault: "", stats: "", modules: {}, abi: core.res.SpaceImpostorFHE.abi, abis, chainId: 11155111, srcHash: hash };

if (process.argv.includes("--compile-only")) {
  fs.writeFileSync("src/config/deployment.json", JSON.stringify(empty));
  console.log("✓ Compiled (nothing deployed).");
  process.exit(0);
}
if (process.env.PRIVATE_KEY) process.env.PRIVATE_KEY = process.env.PRIVATE_KEY.trim().replace(/^["']|["']$/g, "").replace(/^(?!0x)/, "0x");
if (!process.env.PRIVATE_KEY) { console.error("Missing PRIVATE_KEY in .env"); process.exit(1); }
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
console.log("Deploying from", wallet.address);
const token = (process.env.STAKE_TOKEN || DEFAULT_CUSDT).trim();
if (!ethers.isAddress(token)) { console.error("STAKE_TOKEN is not a valid address"); process.exit(1); }
const staking = token.toLowerCase() !== ethers.ZeroAddress;
console.log("Stake token (cUSDT):", staking ? token : "none (staking disabled)");

const deployable = Object.keys(mods).filter((k) => staking || (k !== "bounty" && k !== "bribe")).length;
const STEPS = 2 + (staking ? 1 : 0) + deployable + 2 + (staking ? 1 : 0);
let step = 0;
const bar = (label) => { step++; const w = 24, f = Math.round((step / STEPS) * w); console.log(`[${"█".repeat(f)}${"░".repeat(w - f)}] ${String(Math.round((step / STEPS) * 100)).padStart(3)}%  ${label}`); };
async function deploy(label, abi, bytecode, ...args) {
  const c = await new ethers.ContractFactory(abi, bytecode, wallet).deploy(...args);
  await c.waitForDeployment();
  const a = await c.getAddress(); bar(`${label} → ${a}`);
  return { c, a };
}
const send = async (label, p) => { const tx = await p; await tx.wait(); bar(label); };

const stats = await deploy("LostIslandStats", core.res.LostIslandStats.abi, core.res.LostIslandStats.bytecode);
const vault = staking ? await deploy("StakeVault", core.res.StakeVault.abi, core.res.StakeVault.bytecode, token) : null;
const game = await deploy("SpaceImpostorFHE", core.res.SpaceImpostorFHE.abi, core.res.SpaceImpostorFHE.bytecode);

const addr = {};
const inst = {};
const dep = async (key, ...args) => { if (!mods[key]) return; const r = await deploy(mods[key].name, mods[key].abi, mods[key].bytecode, ...args); addr[key] = r.a; inst[key] = r.c; };
await dep("will", game.a);
await dep("chat", game.a);
if (staking) { await dep("bounty", game.a, vault.a); await dep("bribe", game.a, token); }

// ── wiring (each contract only accepts one wiring call, from this deployer) ──
const hookModules = ["bounty", "bribe"].map((k) => addr[k]).filter(Boolean);       // may call the game's FHE hooks
await send("game.configure(vault, stats, modules)", game.c.configure(vault ? vault.a : ethers.ZeroAddress, stats.a, hookModules));
await send("stats.wire(game, vault)", stats.c.wire(game.a, vault ? vault.a : ethers.ZeroAddress));
if (vault) await send("vault.wire(game, stats, modules)", vault.c.wire(game.a, stats.a, [addr.bounty].filter(Boolean)));

fs.writeFileSync("src/config/deployment.json", JSON.stringify({
  ...empty, address: game.a, token: staking ? token : "", vault: vault ? vault.a : "", stats: stats.a, modules: addr,
}));
console.log("✓ Deployed. Game:", game.a, "→ src/config/deployment.json");
