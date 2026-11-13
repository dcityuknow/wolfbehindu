import { CUTSCENE } from "../story";
import { cineBegin, cineBeat, cineEnd, BEAT_MIN } from "../world/cine3d";

/**
 * Cảnh mở đầu 3D voxel (hình ảnh ở world/cine3d.ts, lồng tiếng + phụ đề ở voice.ts). KHÔNG có lời dẫn chữ: màn hình chỉ hiện phụ đề lời thoại nhân vật.
 * Mỗi phân cảnh chạy đủ BEAT_MIN giây rồi tự sang phân cảnh sau (tổng 60s). Click / Space / Enter = sang phân cảnh kế; Esc hoặc nút Skip = kết thúc.
 */
export function playCutscene() {
  const menu = document.getElementById("menu"), menuDisp = menu ? menu.style.display : "";
  if (menu) menu.style.display = "none";                       // ẩn menu để thấy cảnh 3D phía sau
  const root = document.createElement("div"); root.id = "cine";
  root.innerHTML = `<div id="cineBlur" class="ov3"></div><div id="cineFlash" class="ov3"></div><div id="cineVig" class="ov3"></div><div id="cineStatic" class="ov3"></div><div id="cineRays" class="ov3"></div><div id="cineAlt"><i>⚠ CRITICAL ALTITUDE</i><b>ALT <span id="cineAltV">150</span> m</b></div><div id="cineFade" class="ov3"></div><div id="cineLidT"></div><div id="cineLidB"></div>
<div id="cineNet"></div><div id="cineSub"></div><button id="cskip" class="g">Skip ⏭</button>`;
  document.body.appendChild(root);
  let beat = 0, timer = 0, off = false, fin: () => void = () => {};
  const done = new Promise<void>((r) => (fin = r));
  cineBegin();
  const stop = () => {
    if (off) return; off = true; clearTimeout(timer); removeEventListener("keydown", key);
    root.classList.add("out"); setTimeout(() => root.remove(), 500);
    cineEnd(); if (menu) menu.style.display = menuDisp; fin();
  };
  const play = () => { cineBeat(beat); timer = window.setTimeout(next, BEAT_MIN[beat] * 1000); };
  const next = () => { if (off) return; clearTimeout(timer); if (++beat >= CUTSCENE.length) return stop(); play(); };
  const key = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); next(); } if (e.code === "Escape") stop(); };
  root.addEventListener("click", (e) => { if ((e.target as HTMLElement).id === "cskip") return stop(); next(); });
  addEventListener("keydown", key);
  play();
  return { done, stop };
}
