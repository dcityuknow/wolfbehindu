import { $, show, hide } from "../ui/dom";
import { G } from "../state";
import { clearKeys } from "../input";
import type { TaskType } from "../types";
import { TASKS } from "../story";

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
  /* 📻 Sửa radio: nối dây cùng màu */
  radio(b, close) {
    const cs = shuffle(["#f44", "#4af", "#4f8", "#fd4"]).slice(0, 3), rs = shuffle(cs);
    let pick: string | null = null, n = 0;
    b.innerHTML = head("radio") + '<div id="L"></div><div id="Rr"></div>';
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
  /* 🔐 Giải mã bản tin: nhớ mã 3 giây rồi nhập */
  decode(b, close) {
    const code = String(1000 + Math.floor(Math.random() * 9000)); let v = "", locked = true;
    b.innerHTML = head("decode") + '<h2 id="cv" style="color:#ffd24d">' + code + '</h2><div id="kp"></div>';
    const cv = $("#cv"), hideCode = (ms: number) => { locked = true; cv.style.color = "#ffd24d"; cv.textContent = code; setTimeout(() => { cv.style.color = ""; cv.textContent = "----"; locked = false; v = ""; }, ms); };
    hideCode(3000);
    for (let d = 0; d < 10; d++) {
      const k = document.createElement("button"); k.textContent = String(d);
      k.onclick = () => {
        if (locked) return;
        v += d; cv.textContent = v.padEnd(4, "-");
        if (v.length === 4) { if (v === code) { locked = true; setTimeout(() => close(true), 200); } else { cv.textContent = "WRONG — look again"; setTimeout(() => hideCode(1500), 500); } }
      };
      $("#kp").appendChild(k);
    }
  },
  /* 🔥 Nhóm lửa tín hiệu: giữ nút thổi lửa, buông là lửa yếu đi */
  fire(b, close) {
    let p = 0, iv: number | undefined;
    b.innerHTML = head("fire") + '<div class="bar"><i id="bi" style="background:#ff8a2a"></i></div><button id="hb" style="font-size:20px;padding:18px">🔥 BLOW</button>';
    const tick = (d: number) => { clearInterval(iv); iv = window.setInterval(() => { p = Math.max(0, p + d); $("#bi").style.width = p + "%"; if (p >= 100) { clearInterval(iv); close(true); } else if ($("#mini").style.display === "none") clearInterval(iv); }, 50); };
    const hb = $("#hb"); hb.onmousedown = () => tick(2); hb.onmouseup = () => tick(-3); hb.onmouseleave = () => tick(-3);
  },
  /* 💧 Máy lọc nước: bật van theo thứ tự 1→5 */
  water(b, close) {
    let next = 1;
    b.innerHTML = head("water") + '<div id="vg"></div><p id="vs" class="dim">Next valve: 1</p>';
    shuffle([1, 2, 3, 4, 5]).forEach((n) => {
      const k = document.createElement("button"); k.className = "valve"; k.textContent = String(n);
      k.onclick = () => {
        if (n !== next) { next = 1; b.querySelectorAll(".valve").forEach((x) => x.classList.remove("ok")); $("#vs").textContent = "Wrong order! Start again from valve 1"; return; }
        k.classList.add("ok"); next++; $("#vs").textContent = next > 5 ? "Water is flowing!" : "Next valve: " + next;
        if (next > 5) setTimeout(() => close(true), 350);
      };
      $("#vg").appendChild(k);
    });
  },
  /* 📦 Thu hồi kiện tiếp tế: cắt dây dù khi vạch chạy vào vùng xanh (3 lần liên tiếp) */
  supply(b, close) {
    let pos = 0, dir = 1, hits = 0, zs = 30 + Math.random() * 40; const zw = 18;
    b.innerHTML = head("supply") + '<div class="tb"><i id="zn"></i><u id="mk"></u></div><button id="cut" style="font-size:20px;padding:14px">✂ CUT!</button><p id="hs">0/3</p>';
    const place = () => { $("#zn").style.left = zs + "%"; $("#zn").style.width = zw + "%"; }; place();
    const iv = window.setInterval(() => {
      if ($("#mini").style.display === "none") return clearInterval(iv);
      pos += dir * (1.5 + hits * 0.5); if (pos >= 100 || pos <= 0) { dir = -dir; pos = Math.max(0, Math.min(100, pos)); } $("#mk").style.left = pos + "%";
    }, 16);
    $("#cut").onclick = () => {
      if (pos >= zs && pos <= zs + zw) { hits++; zs = 15 + Math.random() * 60; place(); } else hits = 0;
      $("#hs").textContent = hits + "/3"; if (hits >= 3) { clearInterval(iv); close(true); }
    };
  },
};
const head = (t: TaskType) => `<h3>${TASKS[t].icon} ${TASKS[t].name}</h3><p class="dim">${TASKS[t].hint}</p>`;
