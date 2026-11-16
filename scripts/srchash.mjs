// Hash of every contract source (contracts/**/*.sol, except the test-only mocks). run.mjs and deploy.mjs use it to know
// whether the deployed contracts are still the current ones (otherwise `npm start` redeploys).
import fs from "fs";
import path from "path";
import crypto from "crypto";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "mocks") walk(p, out); }
    else if (e.name.endsWith(".sol")) out.push(p);
  }
  return out;
}
export function srcHash(root = "contracts") {
  const h = crypto.createHash("sha256");
  for (const f of walk(root).sort()) { h.update(f.split(path.sep).join("/")); h.update(fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n")); }
  return h.digest("hex").slice(0, 16);
}
export const listSources = (root = "contracts") => walk(root).map((f) => f.split(path.sep).join("/")).sort();
