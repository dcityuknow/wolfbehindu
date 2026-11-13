import { VOICE } from "./story";
import { VO } from "./world/cineState";
import { cineSfx } from "./audio";

/** Lồng tiếng + phụ đề cho cảnh mở đầu. Ưu tiên file thu sẵn public/voice/<id>.mp3, không có thì dùng giọng đọc nam của trình duyệt (SpeechSynthesis). */
const hasTTS = typeof speechSynthesis !== "undefined";
const avail: Record<string, boolean> = {};
let cur: HTMLAudioElement | null = null, tmr = 0, male: SpeechSynthesisVoice | null = null, gen = 0;
const BAD = /female|zira|samantha|susan|hazel|karen|victoria|tessa|moira|fiona|serena|allison|ava\b|jenny|aria|sara|linda|heather|catherine|amy|emma|joanna|salli|kimberly|ivy|kendra/i;
const GOOD = /google uk english male|microsoft (david|mark|guy|ryan|james|george|christopher|eric)|\bdavid\b|\bmark\b|daniel|\balex\b|fred|george|james|aaron|arthur|rishi|\bmale\b/i;
function pick() {
  if (!hasTTS) return; const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  male = vs.find((v) => GOOD.test(v.name) && !BAD.test(v.name)) ?? vs.find((v) => !BAD.test(v.name)) ?? vs[0] ?? null;
}
const el = (id: string) => document.getElementById(id);
function show(l: (typeof VOICE)[number]) {
  const sub = el("cineSub"), net = el("cineNet");
  if (sub) { sub.innerHTML = `<small>${l.who}</small><b>${l.en}</b><i>${l.vi}</i>`; sub.classList.add("on"); }
  const T = { net: "📡 SQUAD NET", static: "📡 SQUAD NET — SIGNAL LOST", ai: "⚙ SUIT AI", private: "🔒 PRIVATE CHANNEL", "": "" }[l.chan];
  if (net) { net.className = l.chan === "static" ? "on glitch" : T ? "on" : ""; net.innerHTML = T ? `${T} <u>▂▄▆█</u>` : ""; }
}
function hide() { const sub = el("cineSub"), net = el("cineNet"); sub?.classList.remove("on"); if (net) net.className = ""; }

/** Gọi lúc bắt đầu cảnh: nhận diện chọn giọng + dò xem có file thu sẵn không. */
export function voicePreload() {
  pick(); if (hasTTS) speechSynthesis.onvoiceschanged = pick;
  for (const l of VOICE) fetch(`voice/${l.id}.mp3`, { method: "HEAD" }).then((r) => { avail[l.id] = r.ok && /audio|mpeg|ogg/.test(r.headers.get("content-type") || ""); }).catch(() => {});
}
export function voiceStop() {
  gen++; clearTimeout(tmr); VO.speaker = -1; VO.glitch = 0; hide();
  try { if (hasTTS) speechSynthesis.cancel(); cur?.pause(); } catch { /* bỏ qua */ } cur = null;
}
export function say(id: string) {
  const l = VOICE.find((v) => v.id === id); if (!l) return;
  voiceStop(); const my = ++gen; show(l); VO.speaker = l.spk; VO.glitch = l.chan === "static" ? 1 : 0; cineSfx.squelch();
  const done = () => { if (my !== gen) return; VO.speaker = -1; VO.glitch = 0; cineSfx.squelch(); tmr = window.setTimeout(() => { if (my === gen) hide(); }, 1400); };
  try {
    if (avail[id]) { const a = new Audio(`voice/${id}.mp3`); a.volume = l.vol ?? 1; cur = a; a.onended = done; a.onerror = done; void a.play().catch(done); }
    else if (hasTTS) { const u = new SpeechSynthesisUtterance(l.en); if (male) u.voice = male; u.lang = male?.lang || "en-US"; u.pitch = l.pitch; u.rate = l.rate; u.volume = l.vol ?? 1; u.onend = done; u.onerror = done; speechSynthesis.speak(u); }
    else tmr = window.setTimeout(done, 600 + l.en.length * 60);
  } catch { done(); }
  if (l.cutAt) window.setTimeout(() => { if (my !== gen) return; try { speechSynthesis.cancel(); cur?.pause(); } catch { /* bỏ qua */ } cineSfx.static(0.6, 0.7); done(); }, l.cutAt * 1000);
}
