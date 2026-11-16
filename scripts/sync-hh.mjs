// The Hardhat test project (hh/) compiles its own copy of the contracts. Run before the tests so that copy is always current.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dst = path.join(root, "hh", "contracts");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(root, "contracts"), dst, { recursive: true });
console.log("✓ hh/contracts synced from contracts/");
