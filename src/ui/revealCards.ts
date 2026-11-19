import { t } from "../i18n";
import { SNAPS } from "./snapshot";

const STAMP_TEXT = t("rv.stamp");   // chữ trên con dấu (theo ngôn ngữ)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ───── âm thanh: xoẹt (thẻ bay vào) + cạch (đóng dấu), tạo bằng WebAudio ───── */
let ac: AudioContext | null = null;
const A = () => (ac ??= new AudioContext());
function noise(dur: number) { const c = A(), b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; }
function whoosh() { try { const c = A(), s = noise(0.28), f = c.createBiquadFilter(), g = c.createGain(); f.type = "bandpass"; f.Q.value = 1.2; f.frequency.setValueAtTime(500, c.currentTime); f.frequency.exponentialRampToValueAtTime(5200, c.currentTime + 0.22); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.28); s.connect(f); f.connect(g); g.connect(c.destination); s.start(); } catch { /* không có audio */ } }
function thud() { try { const c = A(), o = c.createOscillator(), g = c.createGain(), s = noise(0.12), f = c.createBiquadFilter(), g2 = c.createGain(); o.frequency.setValueAtTime(150, c.currentTime); o.frequency.exponentialRampToValueAtTime(42, c.currentTime + 0.25); g.gain.setValueAtTime(0.9, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.32); f.type = "lowpass"; f.frequency.value = 1800; g2.gain.setValueAtTime(0.5, c.currentTime); g2.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12); s.connect(f); f.connect(g2); g2.connect(c.destination); s.start(); } catch { /* ignore */ } }

function blip() { try { const c = A(), o = c.createOscillator(), g = c.createGain(); o.type = "square"; o.frequency.value = 1150; g.gain.setValueAtTime(0.05, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.06); } catch { /* ignore */ } }

/** Con dấu tròn đỏ: hai vòng, hình gián điệp đội mũ trùm cầm kính lúp, dải chữ chéo — nhoè mực như dấu thật. */
const STAMP_SVG = `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"><defs><filter id="rvRough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.7 1.78" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter></defs>
<g filter="url(#rvRough)" fill="none" stroke="#b3201f" stroke-linecap="round" stroke-linejoin="round">
<circle cx="120" cy="120" r="108" stroke-width="9"/><circle cx="120" cy="120" r="93" stroke-width="3.5"/>
<g fill="#b3201f" stroke="none"><path d="M120 34c-17 0-30 13-30 30 0 6 2 11 5 16-14 6-24 18-26 34h102c-2-16-12-28-26-34 3-5 5-10 5-16 0-17-13-30-30-30z"/></g>
<circle cx="120" cy="66" r="15" fill="#f5e9e0" stroke="none"/><path d="M104 66c4-9 28-9 32 0" stroke="#b3201f" stroke-width="5" fill="none"/>
<circle cx="150" cy="70" r="15" stroke-width="6" fill="rgba(245,233,224,.55)"/><path d="M161 82l17 18" stroke-width="8"/>
<g transform="rotate(-12 120 150)"><rect x="12" y="126" width="216" height="50" rx="8" stroke-width="6"/><rect x="12" y="126" width="216" height="50" rx="8" fill="rgba(179,32,31,.14)" stroke="none"/>
<text x="120" y="162" text-anchor="middle" font-family="Impact,'Arial Black',system-ui,sans-serif" font-weight="900" font-size="31" letter-spacing="1.5" textLength="190" lengthAdjust="spacingAndGlyphs" fill="#b3201f" stroke="none">${STAMP_TEXT}</text></g></g></svg>`;

let styled = false;
function css() {
  if (styled) return; styled = true;
  const s = document.createElement("style");
  s.textContent = `
#rvc{--rvbar:clamp(70px,15vh,128px);position:fixed;inset:0;z-index:40;background:radial-gradient(ellipse at 50% 40%,#1e2246,#03040e);color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
#rvc .rvt{position:absolute;left:0;right:0;top:0;z-index:5;padding:clamp(10px,2.2vh,26px) 12px clamp(26px,5vh,60px);text-align:center;font-weight:900;letter-spacing:4px;font-size:clamp(18px,3.2vw,40px);color:#ffd24d;text-shadow:0 2px 14px #000,0 0 30px #000;background:linear-gradient(rgba(0,0,0,.8),transparent);pointer-events:none}
#rvc .rvrow{position:absolute;inset:0;display:flex;flex-wrap:wrap;justify-content:center;align-content:stretch;gap:clamp(4px,.6vw,10px);padding:clamp(4px,.6vw,10px);padding-top:clamp(40px,7vh,80px);padding-bottom:calc(var(--rvbar) + clamp(12px,2vw,24px));perspective:1200px}
.rvcard{box-sizing:border-box;position:relative;flex:0 0 calc(16.666% - clamp(4px,.6vw,10px));min-width:0;height:calc(50% - clamp(4px,.6vw,10px) / 2);border-radius:clamp(8px,1.2vw,18px);border:clamp(4px,.5vw,8px) solid transparent;background:linear-gradient(#1a1d26,#1a1d26) padding-box,linear-gradient(145deg,#e3e7ec,#7b828c 38%,#cfd4da 58%,#6a717b) border-box;box-shadow:0 10px 26px rgba(0,0,0,.6),inset 0 0 0 2px rgba(0,0,0,.35);opacity:0;transform:translateX(-130vw) skewX(-24deg);transition:filter .5s}
.rvcard.shown{opacity:1;transform:none}
.rvcard.in{animation:rvIn .36s cubic-bezier(.15,.9,.25,1) forwards}
.rvcard .rvimg{position:absolute;inset:0;border-radius:inherit;background-size:cover;background-position:center 35%}
.rvcard .rvbadge{position:absolute;top:clamp(34px,7vh,80px);left:clamp(4px,.6vw,12px);width:clamp(30px,4.2vw,64px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 30%,#eef0f3,#8a919b);border:3px solid #5a606a;display:flex;align-items:center;justify-content:center;font-size:clamp(14px,2.2vw,32px);box-shadow:0 2px 6px rgba(0,0,0,.5);z-index:2}
.rvcard .rvname{position:absolute;left:0;right:0;bottom:0;padding:clamp(24px,6vh,70px) 4px clamp(12px,3vh,36px);border-radius:0 0 inherit inherit;background:linear-gradient(transparent,rgba(0,0,0,.88));font-weight:800;font-size:clamp(11px,1.5vw,24px);text-align:center;text-shadow:0 2px 6px #000;z-index:2}
.rvcard .rvstamp{position:absolute;top:50%;pointer-events:none;opacity:0;z-index:4}   /* rộng/vị trí do JS đặt (placeStamp) để con dấu không bị cắt ở mép màn hình */
.rvcard.hit{animation:rvShake .35s;z-index:6}
.rvcard.hit .rvstamp{animation:rvStamp .34s cubic-bezier(.2,.8,.3,1.1) forwards}
.rvcard.dim{filter:grayscale(.55) brightness(.72)}
#rvc .rvradio{position:absolute;z-index:8;left:clamp(6px,.8vw,14px);right:clamp(6px,.8vw,14px);bottom:clamp(6px,.8vw,14px);height:var(--rvbar);display:flex;align-items:stretch;gap:12px;background:#000d;border:clamp(2px,.3vw,4px) solid #e6e9ee;border-radius:6px;padding:8px 14px;box-shadow:0 6px 24px rgba(0,0,0,.7)}
#rvc .rvlog{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;font:clamp(12px,1.55vw,20px)/1.4 ui-monospace,Consolas,monospace;color:#fff}
#rvc .rvlog a{color:#7cf;text-decoration:underline;cursor:pointer;font-weight:700}#rvc .rvlog a:hover{color:#bff}
#rvc .rvlog .rl{border-left:3px solid #6f6;padding-left:9px;opacity:.55;white-space:pre-wrap;word-break:break-word}
#rvc .rvlog .rl:before{content:"📻 ";opacity:.85}#rvc .rvlog .rl:last-child{opacity:1}
#rvc .rvlog .rl:last-child.typing:after{content:"▌";animation:rvBlink .6s steps(1) infinite}
#rvc button{align-self:center;flex:none;padding:clamp(8px,1.4vh,14px) clamp(18px,2.8vw,40px);font-size:clamp(14px,1.7vw,22px);border-radius:10px;border:0;font-weight:800;cursor:pointer;display:none}
#rvc button.on{display:block}
@media (max-aspect-ratio:1/1){#rvc{--rvbar:clamp(96px,18vh,150px)}.rvcard{flex:0 0 calc(33.333% - clamp(4px,.6vw,10px));height:calc(25% - clamp(4px,.6vw,10px))}.rvcard .rvbadge{top:6px}}
@keyframes rvBlink{50%{opacity:0}}
@keyframes rvIn{0%{opacity:1;transform:translateX(-130vw) skewX(-24deg)}70%{opacity:1;transform:translateX(14px) skewX(5deg)}100%{opacity:1;transform:none}}
@keyframes rvStamp{0%{opacity:0;transform:scale(3.4) rotate(-38deg)}60%{opacity:.95;transform:scale(.93) rotate(-12deg)}100%{opacity:.93;transform:scale(1) rotate(-14deg)}}
@keyframes rvShake{0%,100%{transform:none}20%{transform:translate(-6px,4px)}45%{transform:translate(5px,-4px)}70%{transform:translate(-3px,2px)}}`;
  document.head.appendChild(s);
}

/** Đặt con dấu to gần gấp đôi thẻ nhưng kẹp trong màn hình: thẻ sát mép trái/phải thì con dấu lệch vào trong thay vì bị cắt. */
function placeStamp(card: HTMLElement) {
  const st = card.querySelector<HTMLElement>(".rvstamp")!, r = card.getBoundingClientRect();
  const w = Math.min(r.width * (innerHeight > innerWidth ? 1.2 : 1.7), innerHeight * 0.5, innerWidth - 16);
  const cx = Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, r.left + r.width / 2));
  st.style.width = w + "px"; st.style.left = cx - r.left + "px"; st.style.margin = `${-w / 2}px 0 0 ${-w / 2}px`;
}

export interface RevealStage {
  /** Thêm một dòng vào khung radio ở góc dưới (gõ từng chữ, xếp hàng nối tiếp). */
  say(msg: string, link?: { text: string; href: string }): Promise<void>;
  /** Hiện một nút trong khung radio, chờ bấm. */
  ask(label: string): Promise<void>;
  /** Đóng dấu GIÁN ĐIỆP lên các thẻ (chờ các thẻ vào hết trước). roles[i] = 1 là gián điệp. */
  stamp(roles: number[]): Promise<void>;
  /** Bật/tắt đồng hồ đếm giây ở tiêu đề (để thấy đang chờ chứ không phải đứng hình). */
  clock(on: boolean): void;
  /** Nút "Tiếp tục" rồi đóng cảnh. */
  finish(): Promise<void>;
}

/** Mở cảnh thẻ NGAY: các ảnh chụp (có nền) xoẹt xoẹt vào từng cái và nằm chờ được đóng dấu; phía dưới là khung text kiểu radio. */
export function openRevealStage(names: string[], you: number): RevealStage {
  css();
  const n = names.length, root = document.createElement("div"); root.id = "rvc";
  root.innerHTML = `<div class="rvt">${t("rv.unlock")}</div><div class="rvrow">${names.map((nm, i) => `<div class="rvcard"><div class="rvimg" style="background-image:url(${SNAPS[i] ?? ""});${SNAPS[i] ? "" : "background-color:#2a3146"}"></div><div class="rvbadge">🪂</div><div class="rvname">${nm}${i === you ? " · " + t("rv.you") : ""}</div><div class="rvstamp">${STAMP_SVG}</div></div>`).join("")}</div><div class="rvradio"><div class="rvlog"></div><button class="g" id="rvgo"></button></div>`;
  document.body.appendChild(root);
  const cards = [...root.querySelectorAll<HTMLElement>(".rvcard")], log = root.querySelector<HTMLElement>(".rvlog")!, btn = root.querySelector<HTMLButtonElement>("#rvgo")!;
  const intro = (async () => { await sleep(500); for (const c of cards.slice(0, n)) { c.classList.add("in", "shown"); whoosh(); await sleep(430); } await sleep(700); })();   // xoẹt, xoẹt, xoẹt…
  let q: Promise<void> = Promise.resolve();
  const say = (msg: string, link?: { text: string; href: string }) => (q = q.then(async () => {
    const d = document.createElement("div"); d.className = "rl typing"; log.appendChild(d); while (log.children.length > 6) log.firstElementChild!.remove();
    blip(); const step = Math.max(1, Math.ceil(msg.length / 140));
    for (let k = 0; k < msg.length; k += step) { d.textContent = msg.slice(0, k + step); await sleep(18); }
    d.textContent = msg; d.classList.remove("typing");
    if (link) { const a = document.createElement("a"); a.textContent = link.text; a.href = link.href; a.target = "_blank"; a.rel = "noopener noreferrer"; d.append(" ", a); }   // bấm → mở tab mới
    await sleep(250);
  }));
  const ask = (label: string) => new Promise<void>((res) => { btn.textContent = label; btn.classList.add("on"); btn.onclick = () => { btn.classList.remove("on"); res(); }; });
  const stamp = async (roles: number[]) => {
    await intro; clock(false);
    const spies = roles.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
    for (const i of spies) { placeStamp(cards[i]); cards[i].classList.add("hit"); thud(); await sleep(900); }   // cạch! đóng dấu
    cards.forEach((c, i) => { if (!spies.includes(i)) c.classList.add("dim"); });
    const line = spies.length ? t("rv.spy", spies.map((i) => names[i]).join(", ")) : t("rv.done");
    root.querySelector<HTMLElement>(".rvt")!.textContent = line; void say(line);
  };
  let ck = 0; const ttl = root.querySelector<HTMLElement>(".rvt")!, base = ttl.textContent ?? "";
  const clock = (on: boolean) => { clearInterval(ck); if (!on) { ttl.textContent = base; return; } const t0 = Date.now(); const upd = () => (ttl.textContent = `${base} · ${Math.floor((Date.now() - t0) / 1000)}s`); upd(); ck = window.setInterval(upd, 1000); };
  const finish = async () => { await q; await ask(t("rv.go")); root.remove(); };
  return { say, ask, stamp, clock, finish };
}

/** Bản cũ (dùng cho kết cục thường): mở cảnh, đóng dấu, chờ bấm Tiếp tục. */
export async function playRevealCards(roles: number[], names: string[], you: number): Promise<void> {
  const st = openRevealStage(names, you); await st.stamp(roles); await st.finish();
}
