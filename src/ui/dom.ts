export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const lines: string[] = [];
export function toast(m: string) {
  lines.unshift(m);
  lines.length = Math.min(lines.length, 6);
  $("#toast").innerHTML = lines.join("<br>");
  $("#mlog").textContent = m + "\n" + $("#mlog").textContent;
}
export const show = (sel: string, flex = true) => ($(sel).style.display = flex ? "flex" : "block");
export const hide = (sel: string) => ($(sel).style.display = "none");
