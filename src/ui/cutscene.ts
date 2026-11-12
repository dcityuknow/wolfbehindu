import { CUTSCENE } from "../story";
import { cineBegin, cineBeat, cineEnd, BEAT_MIN } from "../world/cine3d";

/**
 * Cảnh mở đầu 3D voxel (hình ảnh nằm ở world/cine3d.ts, vẽ lên chính canvas của game).
 * File này lo lời dẫn gõ từng chữ + điều hướng: click / Space / Enter = tiếp; Esc hoặc nút "Bỏ qua" = kết thúc.
 * Mỗi beat chỉ chuyển tiếp khi lời dẫn đọc xong VÀ hình ảnh đã chạy đủ BEAT_MIN giây.
 */
export function playCutscene() {
  const menu = document.getElementById("menu"), menuDisp = menu ? menu.style.display : "";
  if (menu) menu.style.display = "none";                       // ẩn menu để thấy cảnh 3D phía sau
  const root = document.createElement("div"); root.id = "cine";
  root.innerHTML = `<div id="cineBlur" class="ov3"></div><div id="cineFlash" class="ov3"></div><div id="cineFade" class="ov3"></div><div id="cineLidT"></div><div id="cineLidB"></div>
<div class="cbox"><small id="ctag"></small><p id="ctxt"></p><div id="cdots"></div></div><button id="cskip" class="g">Skip ⏭</button>`;
  document.body.appendChild(root);
  const tag = root.querySelector("#ctag") as HTMLElement, txt = root.querySelector("#ctxt") as HTMLElement, dots = root.querySelector("#cdots") as HTMLElement;
  let beat = 0, li = 0, typing = false, timer = 0, off = false, beatAt = performance.now(), fin: () => void = () => {};
  const done = new Promise<void>((r) => (fin = r));
  cineBegin();
  const stop = () => {
    if (off) return; off = true; clearTimeout(timer); removeEventListener("keydown", key);
    root.classList.add("out"); setTimeout(() => root.remove(), 500);
    cineEnd(); if (menu) menu.style.display = menuDisp; fin();
  };
  const type = (s: string, then: () => void) => {
    typing = true; txt.textContent = ""; let i = 0;
    const step = () => { if (off) return; txt.textContent = s.slice(0, ++i); if (i < s.length) timer = window.setTimeout(step, 24); else { typing = false; timer = window.setTimeout(then, 1700 + s.length * 8); } };
    step();
  };
  const full = (s: string) => { clearTimeout(timer); txt.textContent = s; typing = false; };
  const play = () => {
    const b = CUTSCENE[beat], line = b.lines[li];
    if (li === 0) { cineBeat(beat); beatAt = performance.now(); tag.textContent = b.tag; dots.innerHTML = CUTSCENE.map((_, i) => `<u class="${i === beat ? "a" : ""}"></u>`).join(""); }
    type(line, () => next(false));
  };
  const next = (force: boolean) => {
    if (off) return; const b = CUTSCENE[beat];
    if (li + 1 >= b.lines.length && !force) { // hết lời của beat: chờ hình ảnh chạy đủ thời lượng rồi mới sang beat sau
      const wait = BEAT_MIN[beat] * 1000 - (performance.now() - beatAt);
      if (wait > 50) { timer = window.setTimeout(() => next(true), wait); return; }
    }
    if (++li >= b.lines.length) { li = 0; if (++beat >= CUTSCENE.length) return stop(); }
    play();
  };
  const adv = () => { if (typing) full(CUTSCENE[beat].lines[li]); else { clearTimeout(timer); next(true); } };
  const key = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); adv(); } if (e.code === "Escape") stop(); };
  root.addEventListener("click", (e) => { if ((e.target as HTMLElement).id === "cskip") return stop(); adv(); });
  addEventListener("keydown", key);
  play();
  return { done, stop };
}
