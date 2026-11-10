import { $, show, hide } from "../ui/dom";
import { G } from "../state";
import { clearKeys } from "../input";
import type { TaskType } from "../types";

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/** Mở mini-game; gọi onWin() khi hoàn thành. Thêm mini-game mới: thêm 1 nhánh trong `games`. */
export function openMiniGame(type: TaskType, onWin: () => void) {
  const body = $("#mbody");
  show("#mini"); G.mini = true; clearKeys();
  const close = (win: boolean) => { hide("#mini"); G.mini = false; if (win) onWin(); };
  $("#mx").onclick = () => close(false);
  games[type](body, close);
}

const games: Record<TaskType, (b: HTMLElement, close: (w: boolean) => void) => void> = {
  wires(b, close) {
    const cs = shuffle(["#f44", "#4af", "#4f8", "#fd4"]).slice(0, 3), rs = shuffle(cs);
    let pick: string | null = null, n = 0;
    b.innerHTML = '<h3>🔌 Nối dây điện</h3><div id="L"></div><div id="Rr"></div>';
    const mkWire = (c: string, side: "L" | "Rr") => {
      const d = document.createElement("div"); d.className = "wire"; d.style.background = c; d.dataset.c = c;
      d.onclick = () => {
        if (side === "L") { b.querySelectorAll("#L .wire").forEach((x) => x.classList.remove("on")); d.classList.add("on"); pick = c; return; }
        if (pick !== c) return;
        b.querySelectorAll<HTMLElement>(".wire").forEach((x) => { if (x.dataset.c === c) x.classList.add("ok"); });
        pick = null; if (++n === 3) setTimeout(() => close(true), 300);
      };
      b.querySelector("#" + side)!.appendChild(d);
    };
    cs.forEach((c) => mkWire(c, "L")); rs.forEach((c) => mkWire(c, "Rr"));
  },
  code(b, close) {
    const code = String(1000 + Math.floor(Math.random() * 9000)); let v = "";
    b.innerHTML = `<h3>⌨ Nhập mã: <b style="color:#ffd24d">${code}</b></h3><h2 id="cv">----</h2><div id="kp"></div>`;
    for (let d = 0; d < 10; d++) {
      const k = document.createElement("button"); k.textContent = String(d);
      k.onclick = () => {
        v += d; $("#cv").textContent = v.padEnd(4, "-");
        if (v.length === 4) { if (v === code) setTimeout(() => close(true), 200); else { v = ""; $("#cv").textContent = "SAI"; } }
      };
      $("#kp").appendChild(k);
    }
  },
  hold(b, close) {
    let p = 0, iv: number | undefined;
    b.innerHTML = '<h3>💨 Bơm oxy — giữ nút</h3><div class="bar"><i id="bi"></i></div><button id="hb" style="font-size:20px;padding:18px">GIỮ</button>';
    const tick = (d: number) => { clearInterval(iv); iv = window.setInterval(() => { p = Math.max(0, p + d); $("#bi").style.width = p + "%"; if (p >= 100) { clearInterval(iv); close(true); } }, 50); };
    const hb = $("#hb"); hb.onmousedown = () => tick(2); hb.onmouseup = () => tick(-3); hb.onmouseleave = () => tick(-3);
  },
};
