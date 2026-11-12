// Một lệnh chạy tất cả:  npm start   (hoặc bấm đúp CHAY.bat)
// 1) cài thư viện (có % tiến độ)  2) deploy contract nếu chưa có / contract đã đổi  3) mở game (vite).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { spawn } from "child_process";

const win = process.platform === "win32";
const npm = win ? "npm.cmd" : "npm";
if (Number(process.versions.node.split(".")[0]) < 18) { console.error("Node.js 18 or newer is required (https://nodejs.org)."); process.exit(1); }

const bar = (p, label) => {
  const w = 30, f = Math.round(Math.max(0, Math.min(1, p)) * w);
  process.stdout.write(`\r${label} [${"█".repeat(f)}${"░".repeat(w - f)}] ${String(Math.round(p * 100)).padStart(3)}%   `);
};
const exec = (cmd, args, opts = {}) => new Promise((res) => spawn(cmd, args, { stdio: "inherit", shell: win, ...opts }).on("close", res));

async function install() {
  const ok = ["three", "vite", "solc", "ethers", "typescript"].every((d) => fs.existsSync(path.join("node_modules", d)));
  if (ok) return;
  let total = 60;
  try { total = Object.keys(JSON.parse(fs.readFileSync("package-lock.json", "utf8")).packages || {}).filter((k) => /^node_modules\/(@[^/]+\/)?[^/]+$/.test(k)).length || 60; } catch { /* dùng ước lượng */ }
  const count = () => {
    try { let n = 0; for (const d of fs.readdirSync("node_modules")) { if (d.startsWith(".")) continue; n += d.startsWith("@") ? fs.readdirSync(path.join("node_modules", d)).length : 1; } return n; } catch { return 0; }
  };
  console.log("⬇ Installing packages (npm install) — the first run may take a few minutes…");
  const child = spawn(npm, ["install", "--no-audit", "--no-fund", "--loglevel=error"], { stdio: ["ignore", "ignore", "inherit"], shell: win });
  const iv = setInterval(() => bar(Math.min(0.99, count() / total), "Packages"), 400);
  const code = await new Promise((r) => child.on("close", r));
  clearInterval(iv);
  if (code !== 0) { console.error(`\n✗ npm install failed (code ${code}). Check your network and run again.`); process.exit(1); }
  bar(1, "Packages"); console.log("\n✓ Packages installed");
}

const readEnv = () => (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "");
const ask = (q) => new Promise((r) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a.trim()); }); });
/** Đọc PRIVATE_KEY trong .env một cách "dễ tính": chấp nhận dấu nháy, khoảng trắng, BOM, thiếu 0x, chú thích cuối dòng. */
function keyFromEnv() {
  for (const raw of readEnv().replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?PRIVATE_KEY\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim();
    return /^(0x)?[0-9a-fA-F]{64}$/.test(v) ? (v.startsWith("0x") ? v : "0x" + v) : { bad: v.length };
  }
  return null;
}
async function ensureKey() {
  const k0 = keyFromEnv();
  if (typeof k0 === "string") return;
  if (k0 && k0.bad !== undefined) console.log(`\n⚠ Found PRIVATE_KEY in .env but it is invalid (${k0.bad} characters long; 64 hex characters needed, optionally prefixed with 0x).`);
  else if (!fs.existsSync(".env")) console.log(`\n⚠ No .env file found in ${process.cwd()}`);
  else console.log("\n⚠ The .env file exists but has no PRIVATE_KEY=… line");
  console.log("A TEST wallet (with a little Sepolia ETH) is needed to deploy the new contract to Sepolia.");
  console.log("Use a test wallet only, never a real one. The key is stored only in the .env file on your machine (already in .gitignore).");
  let k = await ask("Paste PRIVATE_KEY (0x…): ");
  k = k.replace(/^["']|["']$/g, "").trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(k)) { console.error("✗ Invalid key (64 hex characters needed)."); process.exit(1); }
  if (!k.startsWith("0x")) k = "0x" + k;
  const cur = readEnv();
  fs.writeFileSync(".env", cur.replace(/^\s*(?:export\s+)?PRIVATE_KEY\s*=.*$/gm, "").trim() + (cur.trim() ? "\n" : "") + `PRIVATE_KEY=${k}\n`);
}

async function deployIfNeeded() {
  const dep = JSON.parse(fs.readFileSync("src/config/deployment.json", "utf8"));
  const hash = crypto.createHash("sha256").update(fs.readFileSync("contracts/SpaceImpostorFHE.sol", "utf8")).digest("hex").slice(0, 16);
  if (dep.address && dep.srcHash === hash) { console.log(`✓ Contract already deployed: ${dep.address}`); return; }
  console.log(dep.address ? "↻ Contract changed — it must be redeployed." : "→ No contract yet — deploying to Sepolia.");
  await ensureKey();
  console.log("⛓ Compile + deploy… (a few dozen seconds)");
  const code = await exec("node", ["scripts/deploy.mjs"], { env: { ...process.env, PRIVATE_KEY: keyFromEnv() } });
  if (code !== 0) { console.error("✗ Deploy failed. Make sure the wallet has enough Sepolia ETH and your network is stable, then run again."); process.exit(1); }
}

await install();
await deployIfNeeded();
console.log("\n▶ Open the game at http://localhost:3000 (MetaMask on Sepolia required). Stop: Ctrl+C\n");
await exec(npm, ["run", "dev", "--", "--open"]);
