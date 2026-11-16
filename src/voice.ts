import { t } from "./i18n";
import { VOICE } from "./story";
import { VO } from "./world/cineState";
import { cineSfx } from "./audio";

/** Lồng tiếng + phụ đề cho cảnh mở đầu. Giọng chính = file nam neural thu sẵn public/voice/<id>.mp3 (mỗi nhân vật 1 giọng, tạo bởi tools/gen-voice.py). Chỉ khi file lỗi/thiếu mới dùng giọng đọc của trình duyệt (SpeechSynthesis). */
const hasTTS = typeof speechSynthesis !== "undefined";
const clips: Record<string, HTMLAudioElement> = {}, bad: Record<string, boolean> = {};
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
  if (sub) { sub.innerHTML = `<small>${l.who}</small><b>${l.en}</b>${l.vi ? `<i>${l.vi}</i>` : ""}`; sub.classList.add("on"); }
  const T = { net: t("voice.net"), static: t("voice.static"), ai: t("voice.ai"), private: t("voice.private"), "": "" }[l.chan];
  if (net) { net.className = l.chan === "static" ? "on glitch" : T ? "on" : ""; net.innerHTML = T ? `${T} <u>▂▄▆█</u>` : ""; }
}
function hide() { const sub = el("cineSub"), net = el("cineNet"); sub?.classList.remove("on"); if (net) net.className = ""; }
/** Một Audio dùng lại cho mỗi câu; lỗi tải (404…) → đánh dấu để lần sau đọc bằng TTS. */
function clip(id: string) {
  let a = clips[id];
  if (!a) { a = new Audio(`voice/${id}.mp3`); a.preload = "auto"; a.addEventListener("error", () => { bad[id] = true; }); clips[id] = a; }
  return a;
}

/** Gọi lúc bắt đầu cảnh: tải trước toàn bộ file giọng (để câu đầu không bị trễ) + chọn giọng TTS dự phòng. */
export function voicePreload() {
  pick(); if (hasTTS) speechSynthesis.onvoiceschanged = pick;
  for (const l of VOICE) { try { clip(l.id).load(); } catch { /* bỏ qua */ } }
}
export function voiceStop() {
  gen++; clearTimeout(tmr); VO.speaker = -1; VO.glitch = 0; hide();
  try { if (hasTTS) speechSynthesis.cancel(); if (cur) { cur.pause(); cur.currentTime = 0; } } catch { /* bỏ qua */ } cur = null;
}
export function say(id: string) {
  const l = VOICE.find((v) => v.id === id); if (!l) return;
  voiceStop(); const my = ++gen; show(l); VO.speaker = l.spk; VO.glitch = l.chan === "static" ? 1 : 0; cineSfx.squelch();
  const done = () => { if (my !== gen) return; VO.speaker = -1; VO.glitch = 0; cineSfx.squelch(); tmr = window.setTimeout(() => { if (my === gen) hide(); }, 900); };
  const tts = () => {
    if (my !== gen) return;
    try {
      if (hasTTS) { const u = new SpeechSynthesisUtterance(l.en); if (male) u.voice = male; u.lang = male?.lang || "en-US"; u.pitch = l.pitch; u.rate = l.rate; u.volume = l.vol ?? 1; u.onend = done; u.onerror = done; speechSynthesis.speak(u); }
      else tmr = window.setTimeout(done, 600 + l.en.length * 60);
    } catch { done(); }
  };
  if (bad[id]) tts();
  else {
    try {
      const a = clip(id); a.pause(); a.currentTime = 0; a.volume = l.vol ?? 1; cur = a;
      a.onended = done; a.onerror = () => { bad[id] = true; tts(); };
      void a.play().catch(() => { if (my === gen && !bad[id]) { bad[id] = true; tts(); } });
    } catch { tts(); }
  }
  if (l.cutAt) window.setTimeout(() => { if (my !== gen) return; try { speechSynthesis.cancel(); cur?.pause(); } catch { /* bỏ qua */ } cineSfx.static(0.6, 0.7); done(); }, l.cutAt * 1000);
}
