import type { TaskType } from "./types";
/**
 * All text/story of the game lives here (theme: paratroopers · storm · desert island · spy).
 * To change dialogue, task names, chat lines… just edit this file.
 */
export const GAME = { logo: "🪂 Lost Island", title: "Lost Island · The Spy Among Us", op: "OPERATION BLACK SPEARHEAD", squad: "ALPHA Squad" };

/** Callsigns — [0] is the player. Used for name tags, chat and the voting board. */
export const CALLSIGNS = ["You", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];

export const ROLE = {
  crew: { name: "COMMANDO", badge: "🎖 COMMANDO", color: "#5f9", title: "YOU ARE A COMMANDO", sub: "Complete 3 survival tasks and find the spy among your 6 squadmates. Trust no one." },
  spy: { name: "SPY", badge: "🕵 SPY", color: "#f55", title: "YOU ARE THE SPY", sub: "Keep your cover. Wait for someone to wander off alone, then assassinate them (Q). Use the secret burrows (E) to slip away and fake tasks so nobody suspects you." },
};

/** Tasks / mini-games. Key = TaskType (a branch in minigames.ts). */
export const TASKS: Record<TaskType, { name: string; icon: string; prompt: string; hint: string }> = {
  radio: { name: "Repair the radio", icon: "📻", prompt: "[E] 📻 Repair the radio", hint: "Connect the wires of the same color to restore the antenna." },
  decode: { name: "Decrypt the secret message", icon: "🔐", prompt: "[E] 🔐 Decrypt the secret message", hint: "Memorize the code — it disappears after 3 seconds — then type it back." },
  fire: { name: "Light the signal fire", icon: "🔥", prompt: "[E] 🔥 Light the signal fire", hint: "Hold the button to fan the flames. Let go and the fire weakens." },
  water: { name: "Purify sea water", icon: "💧", prompt: "[E] 💧 Run the water purifier", hint: "Open the valves in order 1 → 5. One mistake and you start over." },
  supply: { name: "Recover the supply crate", icon: "📦", prompt: "[E] 📦 Recover the supply crate", hint: "Press CUT when the marker is inside the green zone — 3 times in a row." },
};

/** HUD / buttons / actions */
export const UI = {
  roleLabel: (spy: boolean) => `Role: <b style="color:${spy ? "#f55" : "#5f9"}">${spy ? ROLE.spy.badge : ROLE.crew.badge}</b>`,
  tasks: (n: number) => `Tasks: ${n}/3`,
  round: (n: number) => `Round ${n}`,
  kill: "🔪 Assassinate (Q)", killUsed: "🔪 Already struck (this round)",
  report: "[E] 🚨 Report the body", vent: "[E] Enter secret burrow", meeting: "[E] Call emergency meeting",
  ventToast: "🕳 You slipped into a secret burrow!",
  ghostToast: "💀 You were assassinated — you are now a ghost on the island, still able to watch",
  bodyHint: "🚨 Body found! Run to the campfire and sit down ([E]) to call a meeting.",
  bodyPrompt: "[E] 🚨 Body found — run to the campfire to call the meeting",
  sitCall: "[E] 🪑 Sit down at the campfire & call a meeting", sitJoin: "[E] 🪑 Sit down — join the meeting",
  seated: "🪑 You are seated at the campfire — waiting for the others…",
  callBy: (n: string) => `${n} sat at the campfire and called a meeting — everyone run to the fire!`,
  callBar: (why: string, who: string, s: number) => `<div class="cb-t">🚨 MEETING CALLED — ${why}</div><div>${who} is at the campfire. Run there and press <b>[E]</b> to sit down!</div><div class="cb-n">${s}</div><div class="cb-s">Anyone who doesn't show up is branded the SPY!</div>`,
  callWait: (n: number, s: number) => `🪑 You are seated · waiting for ${n} more · ${s}s`,
  callChain: "📡 Everyone is seated — opening the meeting on-chain…",
  branded: (n: string) => `🚫 ${n} did not come to the campfire in time — branded the SPY and expelled`,
  bodyFound: "Body discovered!", callMeeting: "Emergency meeting at the campfire!",
  botReport: (n: string) => `📢 ${n} found a body!`,
  help: "❓ Briefing", check: "🏁 Check mission", checkNone: "The mission goes on — nobody has won yet.",
  checkLine: "Nobody has won yet.",
  meetTitle: "EMERGENCY MEETING AT THE CAMPFIRE", chatPh: "Say something…", send: "Send", skip: "Skip — nobody is ejected", confirm: "Confirm vote",
  picked: (n: string) => `Selected ${n}`,
  sealing: "🔐 Sealing & submitting your vote…", tally: "📊 Squadmates are voting — tallying the sealed ballots (FHE)…",
  sysName: "Command", sysVote: "Your vote has been sealed (encrypted on-chain). Nobody knows who you voted for.",
  tieSplash: "The squad could not agree — nobody is ejected",
  ejected: (n: string, spy: boolean) => (spy ? `${n} was ejected — WAS THE SPY 🎯` : `${n} was ejected — NOT the spy. You ejected an innocent squadmate 💔`),
  again: "Play again",
  // friendly fire
  mateDead: (n: string) => `☠ ${n} is dead for good — friendly fire is recorded on-chain`,
  opSetup: "🔑 Preparing your session wallet (it signs for the bots)…",
  opFunding: "⛽ Funding the session wallet with a little test-ETH…",
  opReady: "✓ Session wallet ready — bot actions now run without popups",
  opFallback: "⚠ Session wallet unavailable — falling back to MetaMask for bot actions",
  spectating: "💀 You are dead — you can only watch. The squad is voting without you…",
  timesUp: "⏱ Time is up — your vote counts as abstain.",
  retryVote: "Retry",
  voteFail: "❌ The vote could not be completed.",
  whyShot: "WHY YOU SHOT ME??",
  wanted: "🕵 YOU ARE MARKED AS THE SPY — your squad is shooting you!",
  firstAccuse: "That's him! Squad, FIRE!",
  chainRecording: "⛓ Recording your death on-chain…",
  chainDone: (tx: string) => `✅ Death recorded on-chain · tx ${tx}`,
  chainFail: "❌ Could not record the death on-chain.",
  retry: "Retry",
};

/** End screens */
export const ENDING = {
  crew: { title: "🎖 COMMANDOS WIN", desc: "A distress signal climbs into the island sky — or the spy has been exposed. A rescue helicopter is on its way." },
  spy: { title: "🕵 THE SPY WINS", desc: "The squad was whittled down until it could no longer fight back. The mission failed — the traitor completed their orders." },
  shot: {
    title: "☠ EXECUTED BY YOUR OWN SQUAD",
    crew: "You opened fire on your own teammates — and they showed no mercy.<br>The squad's trust shattered on the island, and the spy was never found.",
    spy: "Your careless gunfire blew your cover. The squad gunned you down on suspicion alone — no vote, no proof, no victory for anyone.",
    over: "GAME OVER — the mission ended before the spy was found.",
  },
  absent: {
    title: "🕵 BRANDED THE SPY — YOU NEVER SHOWED UP",
    crew: "A meeting was called and you did not reach the campfire within 30 seconds. The squad decided only a spy would stay away — and had you removed.",
    spy: "A meeting was called and you stayed away from the campfire. The squad took your absence as a confession and removed you.",
    over: "GAME OVER — you missed the emergency meeting.",
  },
  win: "🎉 You win!", lose: "You lose.",
};

/** Bot lines during meetings. {n} = the suspected player's name. */
export const CHAT_LINES = [
  "{n}, where did you wander off to earlier? I didn't see anyone go that way with you.",
  "I saw {n} hanging around the sand burrow. Explain yourself.",
  "Reporting in: I was in the forest, just finished the radio. What about {n}?",
  "{n} is suspiciously quiet. An innocent person has nothing to hide.",
  "No proof, but a soldier's gut tells me it's {n}.",
  "Stay calm. Ejecting the wrong squadmate means we lose one more person.",
  "Has anyone seen {n} doing a task? I haven't, not once.",
  "I just saw {n} wiping a knife. Don't tell me it was for peeling potatoes.",
  "Roll call, one by one: where was everybody when the body was found?",
  "The spy is sitting right here at this fire. {n}, look me in the eye and say it.",
  "I was guarding the fire the whole time — {n} can vouch for me. Don't pin this on me.",
  "Skip. We don't have enough to go on. Every wrong vote costs us another life.",
  "{n}, what was our drop password? Answer fast.",
  "I don't trust anyone anymore. Not even {n}. Not even you guys.",
  "The radio is still dead, water's running out, and you're arguing. Somebody is laughing right now.",
  "{n} landed closest to me, so why did you leave the forest so early?",
];
/** Opening lines of a meeting (the first bot speaks) */
export const OPENERS = {
  body: ["I just saw a body out there. Someone did this — and it's one of us.", "Someone is dead. No storm, no wild animals — that was a knife."],
  emergency: ["I called this meeting to settle things: our squad is being manipulated from the inside.", "Something is wrong. Everyone gather around the fire and talk it through."],
};

/** Opening cutscene: 5 scenes (≈60s total, durations in world/cine3d.ts BEAT_MIN). No on-screen narration — the only text shown is the characters' subtitles (VOICE below). */
export const CUTSCENE = [{ tag: "cabin" }, { tag: "jump" }, { tag: "storm" }, { tag: "altitude" }, { tag: "island" }];

/**
 * Voice-over (male voices) + subtitles for the opening. beat/t = when it starts inside the scene (seconds). spk = id of the squad member whose mouth moves (-1 = none).
 * chan: net = squad radio · static = failing radio · ai = suit AI · private = private channel. cutAt = radio cuts out after N seconds.
 * Voices come from the browser's text-to-speech (pitch/rate tuned per character). To use real recordings, drop public/voice/<id>.mp3 — it is picked up automatically.
 */
export interface VoiceLine { id: string; beat: number; t: number; who: string; chan: "net" | "static" | "ai" | "private" | ""; spk: number; en: string; vi: string; pitch: number; rate: number; vol?: number; cutAt?: number }
export const VOICE: VoiceLine[] = [
  { id: "v1", beat: 0, t: 0.5, who: "TEAM LEADER · comms", chan: "net", spk: 1, pitch: 0.75, rate: 0.95,
    en: "Heads up. Our sat-link was compromised five minutes ago. Someone leaked the coordinates.", vi: "Cảnh giác. Đường truyền vệ tinh đã bị lộ từ 5 phút trước. Có kẻ đã tuồn tọa độ ra ngoài." },
  { id: "v2", beat: 0, t: 8.8, who: "COMMANDO #2", chan: "", spk: 2, pitch: 0.55, rate: 1.0,
    en: "What are you looking at? You? Or was it you?", vi: "Nhìn cái gì? Mày hả? Hay là mày?" },
  { id: "v3", beat: 1, t: 0.8, who: "TEAM LEADER", chan: "net", spk: 1, pitch: 0.9, rate: 1.2, vol: 1,
    en: "Save it! Improvise on the ground! MOVE! GO, GO, GO!", vi: "Dẹp ngay! Xuống đất tùy cơ ứng biến! DI CHUYỂN! NHẢY, NHẢY, NHẢY!" },
  { id: "v4a", beat: 2, t: 2.0, who: "RADIO", chan: "static", spk: -1, pitch: 0.8, rate: 1.1, vol: 0.75,
    en: "Mayday... lost formation!...", vi: "Cấp cứu... mất đội hình!..." },
  { id: "v4b", beat: 2, t: 5.2, who: "RADIO", chan: "static", spk: -1, pitch: 0.8, rate: 1.1, vol: 0.6,
    en: "Off-course... [STATIC]...", vi: "Lệch hướng... [RẸ RẸ]..." },
  { id: "v4c", beat: 2, t: 8.0, who: "RADIO", chan: "static", spk: -1, pitch: 0.8, rate: 1.25, vol: 0.55, cutAt: 1.2,
    en: "...abort, abort—", vi: "...hủy bỏ, hủy bỏ—" },
  { id: "v5", beat: 3, t: 0.0, who: "SUIT AI", chan: "ai", spk: -1, pitch: 0.3, rate: 1.0,
    en: "Warning. Critical altitude. Emergency auto-deploy engaged.", vi: "Cảnh báo. Độ cao nguy hiểm. Kích hoạt bung dù khẩn cấp." },
  { id: "v6", beat: 4, t: 6.4, who: "PRIVATE CHANNEL", chan: "private", spk: -1, pitch: 0.6, rate: 0.82,
    en: "Game on. Good luck surviving... old friends.", vi: "Trò chơi bắt đầu. Chúc may mắn sống sót nhé... những người bạn cũ." },
];
