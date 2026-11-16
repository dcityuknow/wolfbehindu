/** Cyberpunk "FHE at work" overlay: falling hex ciphertext + a glitching headline while the chain deals the roles, decrypts or settles.
 *  It never blocks clicks (pointer-events: none) and only appears if the step takes longer than a blink, so quick transactions do not flash it. */
const FX_LABEL = /Create game|Deal encrypted|Assign roles|Unlock roles|Settle game|Reveal the prize|Seal your last|Tally votes|Check victory|Submit decryption|KMS/i;
/** The overlay belongs to the PvP table only: in solo mode the same transactions run behind the intro cutscene / the 3D game, which it must never cover. */
const pvpOpen = () => { const el = document.getElementById("pvp"); return !!el && getComputedStyle(el).display !== "none"; };
export const wantsFx = (label: string) => FX_LABEL.test(label);

const HEAD = (l: string) =>
  /Deal|Assign|Create game/i.test(l) ? ["ENCRYPTING ROLES", "the coprocessor draws the spy in ciphertext"]
  : /Unlock|KMS|Reveal/i.test(l) ? ["DECRYPTING", "the KMS signs the public values"]
  : /Tally|Check|Submit/i.test(l) ? ["COUNTING IN FHE", "no ballot is ever read in clear"]
  : /Seal/i.test(l) ? ["SEALING YOUR WILL", "only the table can open it"]
  : ["FHE COMPUTING", "ciphertext in · ciphertext out"];
const LINES = ["euint8 role[i] ← FHE.select(eq(impIdx,i),1,0)", "FHE.allow(role, wallet)", "status ← FHE.select(hit, 0, status)", "FHE.makePubliclyDecryptable(v)", "FHE.checkSignatures(handles, proof)", "ebool tied ← or(and(tied,¬gt), eqPos)", "randEuint8(128) → rem n", "counts[i] ← add(counts[i], select(valid, w, 0))"];

let el: HTMLDivElement | null = null, cv: HTMLCanvasElement | null = null, raf = 0, open = 0, showT: any = 0, hideT: any = 0, lineT: any = 0;

function build() {
  el = document.createElement("div"); el.id = "cryptfx";
  el.innerHTML = `<canvas></canvas><div class="t"></div><div class="s"></div><pre class="l"></pre>`;
  document.body.appendChild(el); cv = el.querySelector("canvas");
}
function rain() {
  if (!cv || !el) return;
  const c = cv.getContext("2d")!; const w = (cv.width = innerWidth), h = (cv.height = innerHeight);
  const cols = Math.ceil(w / 16), drops = Array.from({ length: cols }, () => Math.random() * -40);
  const draw = () => {
    c.fillStyle = "rgba(2,6,16,.14)"; c.fillRect(0, 0, w, h); c.font = "14px ui-monospace,Consolas,monospace";
    for (let i = 0; i < cols; i++) {
      const ch = "0123456789abcdef"[(Math.random() * 16) | 0]; c.fillStyle = Math.random() < 0.06 ? "#ff2bd6" : "#13f0c0"; c.fillText(ch, i * 16, drops[i] * 16);
      if (drops[i] * 16 > h && Math.random() > 0.97) drops[i] = 0; drops[i] += 0.6 + (i % 5) * 0.12;
    }
    raf = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(raf); draw();
}
function present(label: string) {
  if (!el) build();
  const [t, s] = HEAD(label);
  el!.querySelector(".t")!.textContent = t; el!.querySelector(".s")!.textContent = s;
  clearTimeout(hideT); el!.classList.add("on"); rain();
  const pre = el!.querySelector(".l") as HTMLElement; let k = 0; clearInterval(lineT);
  lineT = setInterval(() => { pre.textContent = (LINES[k++ % LINES.length] + "\n" + pre.textContent!.split("\n").slice(0, 3).join("\n")); }, 380);
}
function dismiss() {
  clearInterval(lineT); if (!el) return; el.classList.remove("on");
  hideT = setTimeout(() => { cancelAnimationFrame(raf); el?.remove(); el = null; cv = null; }, 400);
}

/** Show the overlay for `label` (after 350 ms). Returns the function that ends it (call it in a finally). */
export function showCrypt(label: string): () => void {
  open++; clearTimeout(showT);
  showT = setTimeout(() => { if (open > 0 && pvpOpen()) present(label); }, 350);
  let done = false;
  return () => { if (done) return; done = true; open = Math.max(0, open - 1); if (open === 0) { clearTimeout(showT); dismiss(); } };
}
