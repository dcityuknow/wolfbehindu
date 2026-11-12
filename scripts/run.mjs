// Một lệnh chạy tất cả:  npm start   (hoặc bấm đúp CHAY.bat)
// 1) cài thư viện (có % tiến độ)  2) deploy contract nếu chưa có / contract đã đổi  3) mở game (vite).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { spawn } from "child_process";

const win = process.platform === "win32";
const npm = win ? "npm.cmd" : "npm";
if (Number(process.versions.node.split(".")[0]) < 18) { console.error("Cần Node.js 18 trở lên (https://nodejs.org)."); process.exit(1); }

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
  console.log("⬇ Tải thư viện (npm install) — lần đầu có thể mất vài phút…");
  const child = spawn(npm, ["install", "--no-audit", "--no-fund", "--loglevel=error"], { stdio: ["ignore", "ignore", "inherit"], shell: win });
  const iv = setInterval(() => bar(Math.min(0.99, count() / total), "Thư viện"), 400);
  const code = await new Promise((r) => child.on("close", r));
  clearInterval(iv);
  if (code !== 0) { console.error(`\n✗ npm install lỗi (mã ${code}). Kiểm tra mạng rồi chạy lại.`); process.exit(1); }
  bar(1, "Thư viện"); console.log("\n✓ Đã cài xong thư viện");
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
  if (k0 && k0.bad !== undefined) console.log(`\n⚠ Tìm thấy PRIVATE_KEY trong .env nhưng không hợp lệ (dài ${k0.bad} ký tự, cần 64 ký tự hex, có thể có 0x ở đầu).`);
  else if (!fs.existsSync(".env")) console.log(`\n⚠ Không thấy file .env trong thư mục ${process.cwd()}`);
  else console.log("\n⚠ File .env có nhưng không có dòng PRIVATE_KEY=…");
  console.log("Cần một ví TEST (có ít Sepolia ETH) để deploy contract mới lên Sepolia.");
  console.log("Chỉ dùng ví test, không dùng ví thật. Khoá chỉ lưu trong file .env trên máy bạn (đã nằm trong .gitignore).");
  let k = await ask("Dán PRIVATE_KEY (0x…): ");
  k = k.replace(/^["']|["']$/g, "").trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(k)) { console.error("✗ Khoá không hợp lệ (cần 64 ký tự hex)."); process.exit(1); }
  if (!k.startsWith("0x")) k = "0x" + k;
  const cur = readEnv();
  fs.writeFileSync(".env", cur.replace(/^\s*(?:export\s+)?PRIVATE_KEY\s*=.*$/gm, "").trim() + (cur.trim() ? "\n" : "") + `PRIVATE_KEY=${k}\n`);
}

async function deployIfNeeded() {
  const dep = JSON.parse(fs.readFileSync("src/config/deployment.json", "utf8"));
  const hash = crypto.createHash("sha256").update(fs.readFileSync("contracts/SpaceImpostorFHE.sol", "utf8")).digest("hex").slice(0, 16);
  if (dep.address && dep.srcHash === hash) { console.log(`✓ Contract đã deploy: ${dep.address}`); return; }
  console.log(dep.address ? "↻ Contract đã thay đổi — cần deploy lại." : "→ Chưa có contract — deploy lên Sepolia.");
  await ensureKey();
  console.log("⛓ Compile + deploy… (vài chục giây)");
  const code = await exec("node", ["scripts/deploy.mjs"], { env: { ...process.env, PRIVATE_KEY: keyFromEnv() } });
  if (code !== 0) { console.error("✗ Deploy lỗi. Kiểm tra ví có đủ Sepolia ETH và mạng ổn định, rồi chạy lại."); process.exit(1); }
}

await install();
await deployIfNeeded();
console.log("\n▶ Mở game tại http://localhost:3000 (cần MetaMask, mạng Sepolia). Tắt: Ctrl+C\n");
await exec(npm, ["run", "dev", "--", "--open"]);
