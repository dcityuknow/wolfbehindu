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
  opSetup: "🔑 Setting up your session wallet (it signs for the bots, so no more popups)…",
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

/** Opening cutscene — each beat: tag (timeline/location), art (illustration), lines (narration typed out letter by letter). */
export const CUTSCENE: { tag: string; art: "cabin" | "jump" | "storm" | "lost" | "island" | "briefing"; lines: string[] }[] = [
  { tag: `02:14 · ALTITUDE 12,000 FT · ${GAME.op}`, art: "cabin", lines: [
    "The C-130 cabin shudders in murky red light. Seven figures sit along both sides of the fuselage, main chutes cinched tight, rifles pressed to their chests.",
    "«ALPHA Squad, ten minutes to the drop zone. Objective: the abandoned comms station on the plateau. Grab the data, withdraw, leave no trace.»",
    "Nobody speaks. Before boarding, the commander gave just one warning: someone on this team was planted long before today." ] },
  { tag: "02:26 · GREEN LIGHT · REAR RAMP OPEN", art: "jump", lines: [
    "The red light turns green. The rear ramp swings wide and the wind howls, tearing every sound apart. «GO! GO! GO!»",
    "One by one they dive into the night. Main chutes burst open, blooming like black flowers across the sky." ] },
  { tag: "02:31 · STORM", art: "storm", lines: [
    "Nobody saw the storm until it swallowed the entire sky. Lightning ripped through the clouds, and gusts swept the squad away like dry leaves.",
    "Lines tangled. Signal lights blinked and died. The radio screeched through static: «…Alpha… abort… jump… lost cont—»" ] },
  { tag: "02:40 · CONTACT LOST", art: "lost", lines: [
    "Then only silence. Seven canopies drifted dozens of miles off target, carried straight toward a lone black speck in the middle of the ocean." ] },
  { tag: "DAWN · DESERT ISLAND", art: "island", lines: [
    "They woke on white sand with endless blue sea on every side. Radios dead, maps washed out, the plane long gone. Only torn parachutes, a few supply crates… and seven survivors had washed ashore." ] },
  { tag: "SURVIVAL OBJECTIVES", art: "briefing", lines: [
    "To live, they must repair the radio, decrypt the secret message, light a signal fire, purify sea water and recover the supply crate.",
    "But the commander never finished his warning: the traitor landed on this island too. They are standing right next to you.",
    "Trust no one. Survive." ] },
];
