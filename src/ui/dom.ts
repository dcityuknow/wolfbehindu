export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Thông báo kiểu "radio chat": nền đen, chữ trắng, góc dưới bên trái; mỗi dòng tự mờ dần rồi biến mất. */
export function toast(m: string) {
  const box = $("#toast"), d = document.createElement("div");
  d.className = "rl"; d.textContent = m; box.appendChild(d);
  while (box.children.length > 6) box.firstElementChild!.remove();
  setTimeout(() => d.classList.add("out"), 9000); setTimeout(() => d.remove(), 9800);
  const log = document.getElementById("mlog"); if (log) log.textContent = m + "\n" + log.textContent;
}
export const show = (sel: string, flex = true) => ($(sel).style.display = flex ? "flex" : "block");
export const hide = (sel: string) => ($(sel).style.display = "none");
