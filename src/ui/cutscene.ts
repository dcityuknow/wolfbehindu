import { t } from "../i18n";
import { CUTSCENE } from "../story";
import { cineBegin, cineBeat, cineEnd, cineDeploy, cineRetry, cineBlocked, cineDead, cineRemain } from "../world/cine3d";

/**
 * Cảnh mở đầu 3D voxel (hình ảnh ở world/cine3d.ts, lồng tiếng + phụ đề ở voice.ts). KHÔNG có lời dẫn chữ: màn hình chỉ hiện phụ đề lời thoại nhân vật.
 * Mỗi phân cảnh chạy đủ BEAT_MIN giây rồi tự sang phân cảnh sau (tổng ≈ 90s + EXT; phân cảnh 0 trong khoang dài 45s, 11 lính). Click / Space / Enter = sang phân cảnh kế; Esc hoặc nút Skip = kết thúc.
 */
export function playCutscene() {
  const menu = document.getElementById("menu"), menuDisp = menu ? menu.style.display : "";
  if (menu) menu.style.display = "none";                       // ẩn menu để thấy cảnh 3D phía sau
  const root = document.createElement("div"); root.id = "cine";
  root.innerHTML = `<div id="cineBlur" class="ov3"></div><div id="cineFlash" class="ov3"></div><div id="cineVig" class="ov3"></div><div id="cineStatic" class="ov3"></div><div id="cineRays" class="ov3"></div><div id="cineKey"><b>E</b><i><span class="a">${t("cine.key")}</span><span class="b">${t("cine.keyOk")}</span></i><u><s id="cineKeyBar"></s></u></div><div id="cineAlt"><i>${t("cine.alt")}</i><b>${t("cine.altL")} <span id="cineAltV">150</span> m</b></div><div id="cineFade" class="ov3"></div><div id="cineLidT"></div><div id="cineLidB"></div>
<div id="cineTag"></div><div id="cineNet"></div><div id="cineSub"></div><button id="cskip" class="g">${t("cine.skip")}</button>
<div id="cineDead"><div><h2>☠ ${t("cine.dead")}</h2><p>${t("cine.dead2")}</p><button id="cretry" class="g">${t("cine.retry")}</button></div></div>`;
  document.body.appendChild(root);
  let beat = 0, timer = 0, off = false, fin: () => void = () => {};
  const done = new Promise<void>((r) => (fin = r));
  cineBegin();
  const stop = () => {
    if (off) return; off = true; clearTimeout(timer); removeEventListener("keydown", key);
    root.classList.add("out"); setTimeout(() => root.remove(), 500);
    cineEnd(); if (menu) menu.style.display = menuDisp; fin();
  };
  // Hết giờ phân cảnh (tính theo đồng hồ cảnh 3D) thì tự sang cảnh sau — trừ khi đang ở đoạn bấm E / màn chết của cảnh nhảy dù (cineBlocked)
  const arm = () => { clearTimeout(timer); timer = window.setTimeout(tick, 200); };
  const tick = () => { if (off) return; if (cineRemain() <= 0.01 && !cineBlocked()) return next(); arm(); };
  const play = () => { cineBeat(beat); arm(); };
  const next = () => { if (off || cineBlocked()) return; clearTimeout(timer); if (++beat >= CUTSCENE.length) return stop(); play(); };
  const key = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === "KeyE") { e.preventDefault(); if (cineDead()) cineRetry(); else cineDeploy(); return; }   // E = bung dù (hoặc nhảy lại khi đã chết)
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); if (cineDead()) cineRetry(); else next(); }
    if (e.code === "Escape") stop();
  };
  root.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (el.id === "cskip") return stop();
    if (el.closest("#cineKey")) { cineDeploy(); return; }   // chạm vào nút E trên màn hình cảm ứng
    if (el.closest("#cretry")) { cineRetry(); return; }
    next();
  });
  addEventListener("keydown", key);
  play();
  return { done, stop };
}
