import LINES from "../config/meetLines.json";
import TRIAL from "../config/trialLines.json";
import { has, t, locale } from "../i18n";
import { NAMES, NO_TARGET } from "../config";
import { sfx } from "../audio";
import { playClip, speakText, stopAllVoices, speakingCount, type Clip } from "../meetVoice";
import { startSay, endSay, react, look, tileEl, setWarn, heat, isTalking, fireGun, setSpot, type Emo } from "../ui/meetStage";

/**
 * ĐẠO DIỄN CUỘC CÃI VÃ ở đống lửa: các bot tố cáo / nghi ngờ / biện minh / đổ lỗi / quát tháo / bênh nhau / hoảng loạn / chế giễu.
 * Có "độ nóng" tăng dần: càng nóng càng nhiều người nói CHỒNG LÊN NHAU (tối đa 3–4 giọng cùng lúc), nói nhanh, quát to.
 * Chỉ là diễn xuất — phiếu bầu thật của bot vẫn do contract (FHE) quyết định.
 */
type Intent = keyof typeof LINES;
interface Line { en: string; vi: string }
const L = LINES as Record<Intent, Line[]>;
const BCP: Record<string, string> = { vi: "vi-VN", en: "en-US", ru: "ru-RU", ng: "en-NG", bn: "bn-BD", id: "id-ID", hi: "hi-IN", zh: "zh-CN", fil: "fil-PH", uk: "uk-UA", ko: "ko-KR" };
const GAIN: Record<Intent, number> = { accuse: 1.25, suspect: 0.85, defend: 1.05, deflect: 0.95, shout: 1.4, agree: 0.95, panic: 1.15, mock: 1, laugh: 1.05, scream: 1.5, gasp: 0.95, grunt: 0.8 };
/** ý -> biểu cảm khuôn mặt/cử chỉ của ô; các "tiếng không lời" không nhắm vào ai */
const EMO_OF: Record<Intent, Emo> = { accuse: "accuse", suspect: "suspect", defend: "defend", deflect: "deflect", shout: "shout", agree: "agree", panic: "panic", mock: "mock", laugh: "mock", scream: "shout", gasp: "shock", grunt: "deflect" };
const NO_TARGET_INTENT = new Set<Intent>(["panic", "laugh", "scream", "gasp", "grunt"]);
const sub = (k: Intent, n: number) => (has(`meet.${k}.${n}`) ? t(`meet.${k}.${n}`) : locale.lang === "vi" ? L[k][n].vi : L[k][n].en);

interface Ctx { me: number; alive: () => number[]; left: () => number; log: (who: number, text: string) => void }
let ctx: Ctx | null = null, timer = 0, t0 = 0, nextAt = 0, acc = 0;
const speakers = new Map<number, { clip: Clip; tk: number }>();
let susp: number[] = [], lastAcc: null | { from: number; to: number; t: number; answered: boolean; delay: number; extra: number } = null;
const recent = new Map<string, number>(), lastLines: string[] = [];
const now = () => performance.now() / 1000;
const rnd = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
function weighted<T>(items: [T, number][]): T { let s = 0; for (const [, w] of items) s += w; let r = Math.random() * s; for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[0][0]; }
const panOf = (i: number) => { const e = tileEl(i); if (!e) return 0; const r = e.getBoundingClientRect(); return Math.max(-0.85, Math.min(0.85, ((r.left + r.width / 2) / window.innerWidth) * 2 - 1)); };

/** ── CẢNH "SHUT UP" ── 10 giây đầu cứ cãi loạn như cũ; sau đó MỖI GIÂY có ROLL_P cơ hội một bot random hét "SHUT THE FUCK UP", bắn súng lên trời,
 *  cả phòng im bặt nhìn hắn; hắn nêu quan điểm, chỉ mặt đặt tên 2–3 người (nghi / không nghi), vài bot khác hùa theo hoặc phản đối.
 *  Mọi thứ nói ở đây là THẬT: nó đổi `susp`, `bias`, `shield` → lockBallots() → phiếu mã hoá của các bot (contract.castBotVotes). */
const CHAOS_SECONDS = 10, ROLL_P = 0.2, MAX_SHOTS = 1, MIN_LEFT = 45, TRIAL_SUSP = 3;
let hold = false, shots = 0, nextRoll = 0, seq = 0, locked: number[] | null = null;
const bias = new Map<number, Set<number>>(), shield = new Map<number, Set<number>>();   // bot -> những ai hắn sẽ bỏ phiếu cho / từ chối bỏ phiếu cho

export function startDebate(c: Ctx) {
  stopDebate(); ctx = c; t0 = now(); nextAt = t0 + 0.8; acc = 0; lastAcc = null; susp = Array(NAMES.length).fill(0); heat.v = 0;
  hold = false; shots = 0; nextRoll = t0 + CHAOS_SECONDS; locked = null; bias.clear(); shield.clear();
  timer = window.setInterval(tick, 250);
}
export function stopDebate() {
  seq++; hold = false; setSpot(null);
  clearInterval(timer); timer = 0; for (const [i, s] of speakers) { s.clip.stop(); endSay(i, s.tk); } speakers.clear(); stopAllVoices(); ctx = null; heat.v = 0;
}

function pickTarget(from: number, alive: number[]) { return weighted(alive.filter((j) => j !== from).map((j) => [j, 1 + susp[j] * 1.5] as [number, number])); }

function speak(i: number, intent: Intent, target?: number) {
  if (!ctx || hold || speakers.has(i) || isTalking(i)) return;   // hold = đang có cảnh SHUT UP / phiên tòa: không ai được nói chen
  const arr = L[intent], key = `${i}:${intent}`; let n = (Math.random() * arr.length) | 0;
  for (let g = 0; g < arr.length && arr.length > 1 && (n === recent.get(key) || lastLines.includes(`${intent}${n}`)); g++) n = (n + 1) % arr.length;   // không lặp câu của chính mình, cũng tránh câu vừa có người khác nói
  recent.set(key, n); lastLines.push(`${intent}${n}`); if (lastLines.length > 3) lastLines.shift();
  const crowd = speakers.size, text = sub(intent, n); let tk = -1;
  const clip = playClip(`voice/meet/${i}_${intent}${n}.mp3`, {
    text: arr[n].en, gain: GAIN[intent] * (crowd >= 2 ? 0.8 : 1), pan: panOf(i), pitch: 0.8 + (i % 5) * 0.1,
    onEnd: () => { const s = speakers.get(i); if (s && s.clip === clip) speakers.delete(i); endSay(i, tk); ctx?.alive().forEach((j) => { if (j !== i) look(j, -1); }); },
  });
  tk = startSay(i, { emo: EMO_OF[intent], text, target, level: () => clip.level(), dur: () => clip.dur });
  if (tk < 0) { clip.stop(); return; }
  speakers.set(i, { clip, tk }); ctx.log(i, text);
  // người nghe quay sang nhìn người đang nói; mục tiêu bị tố giật mình
  ctx.alive().forEach((j) => { if (j !== i && !isTalking(j) && Math.random() < 0.75) look(j, i); });
  if (target !== undefined && target >= 0 && (intent === "accuse" || intent === "suspect" || intent === "shout" || intent === "mock")) {
    susp[target] += intent === "accuse" ? 1.2 : 0.6; acc++; heat.v = Math.min(1, heat.v + 0.06);
    const gasp = target !== ctx.me && Math.random() < 0.6;   // bị tố: hít hơi giật mình rồi mới cãi lại
    lastAcc = { from: i, to: target, t: now(), answered: false, delay: gasp ? 1.25 : 0.7, extra: 0 };
    if (gasp) setTimeout(() => speak(target, "gasp"), 160); else react(target, "shock", 1.1, i);
    if (target === ctx.me) { setWarn(target, true); setTimeout(() => setWarn(target, false), 2500); }
  }
}

function tick() {
  if (!ctx) return; const c = ctx, alive = c.alive(), bots = alive.filter((i) => i !== c.me); if (bots.length < 1) return;
  const tm = now(), el = tm - t0, left = c.left();
  if (hold || locked) return;   // phiên tòa đang diễn (hoặc phiếu đã chốt): đạo diễn ở shotScene
  if (shots < MAX_SHOTS && tm >= nextRoll && bots.length >= 3 && left > MIN_LEFT) {   // hết 10 giây hỗn loạn: mỗi giây 20% có người hét
    nextRoll = tm + 1;
    if (Math.random() < ROLL_P) return void shotScene(rnd(bots));
  }
  heat.v = Math.min(1, Math.max(heat.v * 0.998, el / 45 + acc * 0.04 + (left < 12 ? 0.3 : 0)));
  const maxC = heat.v > 0.6 ? 4 : 3, conc = speakingCount();
  const la = lastAcc;
  if (la && !la.answered && tm - la.t > la.delay && tm - la.t < 7) {   // bị tố -> cãi lại, thường là NGẮT lời người tố
    la.answered = true;
    if (la.to !== c.me && alive.includes(la.to) && conc < maxC) return void speak(la.to, Math.random() < 0.2 + heat.v * 0.5 ? "shout" : "defend", la.from);
  }
  if (la && la.answered && la.extra < 2 && tm - la.t < 8 && Math.random() < 0.18 && conc < maxC) {   // tối đa 2 người nhảy vào mỗi vụ tố cáo
    la.extra++;   // người khác nhảy vào bênh/đánh phe
    const j = rnd(bots.filter((k) => k !== la.from && k !== la.to && !speakers.has(k)));
    if (j !== undefined) { if (Math.random() < 0.5) { susp[la.to] += 0.5; return void speak(j, "agree", la.to); } return void speak(j, "shout", la.from); }
  }
  if (conc > 0 && conc < maxC && Math.random() < 0.05 + heat.v * 0.22) {   // chen ngang giữa chừng
    const j = rnd(bots.filter((k) => !speakers.has(k))); if (j === undefined) return;
    const it = heat.v > 0.5 ? weighted<Intent>([["shout", 3], ["accuse", 3], ["scream", 2], ["laugh", 2], ["mock", 2], ["deflect", 1], ["grunt", 1]]) : weighted<Intent>([["suspect", 3], ["deflect", 2], ["mock", 2], ["laugh", 1.5], ["grunt", 1.5], ["accuse", 2]]);
    return void speak(j, it, NO_TARGET_INTENT.has(it) ? undefined : pickTarget(j, alive));
  }
  if (left < 12 && Math.random() < 0.08 && conc < maxC) { const j = rnd(bots.filter((k) => !speakers.has(k))); if (j !== undefined) return void speak(j, "panic"); }
  if (conc === 0 && tm > nextAt) {
    const j = rnd(bots); nextAt = tm + 0.35 + Math.random() * 1.1 * (1 - heat.v * 0.6);
    const it = weighted<Intent>([["accuse", 28], ["suspect", 26], ["deflect", 14], ["mock", 8], ["panic", 8], ["laugh", 4], ["grunt", 5], ["shout", heat.v * 25], ["scream", heat.v * 8]]);
    speak(j, it, NO_TARGET_INTENT.has(it) ? undefined : pickTarget(j, alive));
  }
}

const wait = (ms: number, id: number) => new Promise<boolean>((res) => window.setTimeout(() => res(id === seq && !!ctx), ms));
const add = (m: Map<number, Set<number>>, k: number, v: number) => { let q = m.get(k); if (!q) m.set(k, (q = new Set())); q.add(v); };
const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
type TKey = keyof typeof TRIAL;
const TL = TRIAL as Record<TKey, Line[]>;
const tsub = (k: TKey, n: number, tg?: number) => { const raw = has(`trial.${k}.${n}`) ? t(`trial.${k}.${n}`) : locale.lang === "vi" ? TL[k][n].vi : TL[k][n].en; return tg === undefined ? raw : raw.replace("{n}", NAMES[tg]); };

/** Nói một câu và đợi nó nói xong (hoặc bị cắt). Không tính vào "độ nóng", không bị chặn bởi hold. */
function sayClip(i: number, o: { file: string; text: string; en: string; emo: Emo; target?: number; gain?: number; onStart?: (clip: Clip) => void }): Promise<void> {
  return new Promise<void>((done) => {
    if (!ctx || isTalking(i)) return done();
    let tk = -1;
    const clip: Clip = playClip(o.file, {
      text: o.en, gain: o.gain ?? 1.1, pan: panOf(i), pitch: 0.8 + (i % 5) * 0.1,
      onEnd: () => { const s = speakers.get(i); if (s && s.clip === clip) speakers.delete(i); endSay(i, tk); done(); },
    });
    tk = startSay(i, { emo: o.emo, text: o.text, target: o.target, level: () => clip.level(), dur: () => clip.dur });
    if (tk < 0) { clip.stop(); return; }
    speakers.set(i, { clip, tk }); ctx.log(i, o.text); o.onStart?.(clip);
    window.setTimeout(() => clip.stop(), 15000);   // chốt an toàn: file/TTS kẹt thì vẫn đi tiếp
  });
}
const sayTrial = (i: number, k: TKey, n: number, o: { emo: Emo; target?: number; gain?: number; onStart?: (clip: Clip) => void }) =>
  sayClip(i, { file: `voice/meet/${i}_${k}${n}${o.target !== undefined && (k === "pointSus" || k === "pointClear") ? "_" + o.target : ""}.mp3`, text: tsub(k, n, o.target), en: tsub(k, n, o.target), ...o });
const hushAll = () => { for (const [, s] of speakers) s.clip.stop(); speakers.clear(); stopAllVoices(); };
const bang = (i: number) => { sfx.shot("pistol", 1.6); fireGun(i); heat.v = 1; };

async function shotScene(shooter: number) {
  if (!ctx) return; const c = ctx, id = ++seq, me = c.me; hold = true; shots++; lastAcc = null;
  const live = () => id === seq && !!ctx;
  const alive = () => c.alive(), others = (...ex: number[]) => alive().filter((j) => !ex.includes(j));
  // 1) cả phòng bị cắt ngang, im bặt, quay lại nhìn; hắn hét + giơ súng bắn lên trời
  hushAll(); setSpot(shooter);
  for (const j of others(shooter)) { look(j, shooter); react(j, "shock", 2.4, shooter); }
  await sayTrial(shooter, "silence", (Math.random() * TL.silence.length) | 0, {
    emo: "gun", gain: 1.8,
    onStart: (clip) => window.setTimeout(() => { if (!live()) return; bang(shooter); if (Math.random() < 0.4) window.setTimeout(() => live() && bang(shooter), 260); }, Math.max(350, clip.dur * 560)),
  });
  if (!live() || !(await wait(1300, id))) return;   // im lặng chết chóc, ai cũng nhìn hắn
  // 2) quan điểm cá nhân
  await sayTrial(shooter, "opinion", (Math.random() * TL.opinion.length) | 0, { emo: "accuse" });
  if (!live() || !(await wait(500, id))) return;
  // 3) chỉ mặt đặt tên từng người
  const pool = shuffle(others(shooter)).sort((a, b) => susp[b] - susp[a] + (Math.random() - 0.5) * 2), k = Math.min(pool.length, c.left() > 70 ? 2 + ((Math.random() * 2) | 0) : 2);
  const picks = pool.slice(0, k);
  for (const tg of picks) {
    const sus = Math.random() < 0.65;
    setSpot(shooter, [tg]);
    if (sus) { susp[tg] += TRIAL_SUSP; add(bias, shooter, tg); if (tg !== me) react(tg, "shock", 1.6, shooter); else { setWarn(me, true); window.setTimeout(() => setWarn(me, false), 3500); } }
    else { susp[tg] = Math.max(0, susp[tg] - 1.5); add(shield, shooter, tg); if (tg !== me) react(tg, "agree", 1.4, shooter); }
    await sayTrial(shooter, sus ? "pointSus" : "pointClear", 0, { emo: sus ? "accuse" : "point", target: tg });
    if (!live()) return;
    // 2–3 bot khác hùa theo / phản đối ngay (chồng tiếng nhẹ), mỗi người ảnh hưởng phiếu của chính hắn
    const fs = shuffle(others(shooter, tg, me)).slice(0, 2 + ((Math.random() * 2) | 0));
    await Promise.all(fs.map(async (f, idx) => {
      if (!(await wait(idx * (260 + Math.random() * 380), id))) return;
      const agree = Math.random() < 0.6; look(f, shooter);
      if (sus) { if (agree) { add(bias, f, tg); susp[tg] += 1; } else { add(shield, f, tg); susp[tg] = Math.max(0, susp[tg] - 1); } }
      else { if (agree) { add(shield, f, tg); susp[tg] = Math.max(0, susp[tg] - 0.6); } else { add(bias, f, tg); susp[tg] += 1.2; } }
      await sayTrial(f, sus ? (agree ? "backSus" : "againstSus") : (agree ? "backClear" : "againstClear"), (Math.random() * 2) | 0, { emo: agree ? "agree" : sus ? "disagree" : "accuse", gain: 1.05 });
    }));
    if (!live()) return;
    // bị tố: bot tự biện minh (người chơi bị chỉ thì có vài giây để gõ chữ cãi lại)
    if (tg === me) { await wait(2600, id); setWarn(me, false); }
    else if (sus && Math.random() < 0.6) { const n = (Math.random() * L.defend.length) | 0; setSpot(tg); await sayClip(tg, { file: `voice/meet/${tg}_defend${n}.mp3`, text: sub("defend", n), en: L.defend[n].en, emo: "defend", target: shooter, gain: 1.05 }); }
    if (!live() || !(await wait(350, id))) return;
  }
  // 4) hết phiên tòa: trả sân khấu lại cho cuộc cãi vã tự do (nguội đi một chút)
  hold = false; setSpot(null); heat.v = 0.6; nextAt = now() + 1.2; for (const j of alive()) look(j, -1);
}

/** Chốt phiếu các bot theo ĐÚNG những gì đã nói ở đống lửa (gọi khi người chơi bỏ phiếu / hết giờ). plan[slot] = ô được bỏ, NO_TARGET = phiếu trắng. null = chưa có cuộc cãi nào → để contract random. */
function decideVote(j: number, alive: number[]): number {
  const cand = alive.filter((k) => k !== j && !shield.get(j)?.has(k));
  if (!cand.length) return NO_TARGET;
  const want = [...(bias.get(j) ?? [])].filter((k) => cand.includes(k));
  if (want.length && Math.random() < 0.88) return weighted(want.map((k) => [k, 1 + susp[k]] as [number, number]));
  if (Math.max(...cand.map((k) => susp[k])) < 0.8 && Math.random() < 0.2) return NO_TARGET;   // chẳng ai nổi bật: vài bot bỏ trắng
  return weighted(cand.map((k) => [k, Math.pow(0.35 + Math.max(0, susp[k]), 2)] as [number, number]));
}
export function lockBallots(): number[] | null {
  if (locked) return locked;
  if (!ctx) return null;
  const plan: number[] = Array(NAMES.length).fill(NO_TARGET), alive = ctx.alive();
  for (const j of alive) if (j !== ctx.me) plan[j] = decideVote(j, alive);
  locked = plan; seq++; hold = true; hushAll(); setSpot(null);   // cuộc họp đã chốt phiếu: cắt cảnh đang diễn dở
  return plan;
}

/** Người chơi gõ chữ: nói bằng ô của mình (giọng trình duyệt); bot bị nhắc tên sẽ cãi lại. */
export function playerSays(text: string) {
  if (!ctx) return; const c = ctx, me = c.me, low = text.toLowerCase();
  const named = c.alive().find((j) => j !== me && low.includes(NAMES[j].toLowerCase()));
  const emo: Emo = named !== undefined ? "accuse" : /\?\s*$/.test(text) ? "suspect" : /!\s*$/.test(text) ? "shout" : "defend";
  let tk = -1; const clip = speakText(text, BCP[locale.lang] || "en-US", () => endSay(me, tk));
  tk = startSay(me, { emo, text, target: named, level: () => clip.level(), dur: () => clip.dur });
  c.log(me, text);
  c.alive().forEach((j) => { if (j !== me && Math.random() < 0.8) look(j, me); });
  if (named !== undefined) { susp[named] += 1; heat.v = Math.min(1, heat.v + 0.05); react(named, "shock", 1, me); setTimeout(() => { if (ctx) speak(named, Math.random() < 0.4 ? "shout" : "defend", me); }, 900 + Math.random() * 500); }
  else if (Math.random() < 0.55) { const j = rnd(c.alive().filter((k) => k !== me)); if (j !== undefined) setTimeout(() => { if (ctx) speak(j, rnd<Intent>(["suspect", "accuse", "mock"]), me); }, 1200 + Math.random() * 800); }
}
