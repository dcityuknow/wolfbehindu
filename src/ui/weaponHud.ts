import { $ } from "./dom";
import { GUNS } from "../config";
import { W } from "../weaponState";
import { G } from "../state";

/** HUD vũ khí (góc dưới trái): thanh chọn súng 1-4, tên súng, đạn trong băng / dự trữ, lựu đạn, thanh nạp đạn + dấu hiệu trúng đạn giữa màn hình. */
const hud = $("#hud");
const wp = document.createElement("div"); wp.id = "wp";
wp.innerHTML = `<div id="wpSlots">${GUNS.map((g, i) => `<u data-i="${i}"><b>${i + 1}</b>${g.icon}</u>`).join("")}</div>
<div id="wpHp"><i></i></div><div id="wpName"></div><div id="wpAmmo"><b id="wpMag"></b><span id="wpRes"></span></div><div id="wpGren"></div>
<div id="wpRel"><i></i></div><div id="wpKeys">Left click: shoot · Right click: aim · R: reload · G: grenade · 1-4: switch weapon</div>`;
hud.appendChild(wp);
const hit = document.createElement("div"); hit.id = "hit"; hit.innerHTML = "<i></i><i></i><i></i><i></i>"; hud.appendChild(hit);
const el = { name: $("#wpName"), mag: $("#wpMag"), res: $("#wpRes"), gren: $("#wpGren"), rel: $("#wpRel"), hp: $("#wpHp i"), bar: $("#wpRel i"), slots: [...wp.querySelectorAll<HTMLElement>("#wpSlots u")] };
let last = "";

export function updateWeaponHud() {
  const show = G.phase === "play" && !G.ghost && !G.mini, d = show ? "block" : "none";
  if (wp.style.display !== d) wp.style.display = d;
  if (!show) return;
  const g = GUNS[W.cur], key = [W.cur, W.ammo[W.cur], W.reserve[W.cur], W.grenades].join("|");
  if (key !== last) {
    last = key;
    el.name.textContent = g.name; el.mag.textContent = String(W.ammo[W.cur]); el.res.textContent = " / " + W.reserve[W.cur];
    el.mag.style.color = W.ammo[W.cur] <= Math.ceil(g.mag * 0.25) ? "#ff6b5b" : "#fff";
    el.gren.textContent = "💣 ×" + W.grenades + "  (G)";
    el.slots.forEach((s, i) => s.classList.toggle("a", i === W.cur));
  }
  el.hp.style.width = (W.hp / 1.2) + "%"; el.hp.style.background = W.hp < 40 ? "#ff4d4d" : "#5fe08a";
  el.rel.style.display = W.reload > 0 ? "block" : "none";
  if (W.reload > 0) el.bar.style.width = (1 - W.reload / W.reloadDur) * 100 + "%";
}
/** Dấu trúng đạn giữa màn hình: 1 = trúng · 2 = bắn đầu · 3 = hạ gục/ngất. */
export function hitMark(kind: 1 | 2 | 3) {
  hit.className = "k" + kind; hit.style.animation = "none"; void hit.offsetWidth; hit.style.animation = "hm .28s ease-out";
}
