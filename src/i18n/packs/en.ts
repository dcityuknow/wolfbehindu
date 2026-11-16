import type { Dict } from "../index";

/**
 * Tiếng Anh = ngôn ngữ gốc / dự phòng cho mọi ngôn ngữ khác.
 * Các chữ trong story.ts (UI, ROLE, TASKS, ENDING, CHAT_LINES…) vốn đã là tiếng Anh nên không lặp lại ở đây;
 * file này chứa phần còn lại: intro, luật chơi, màn hình kết thúc, thẻ mở khoá vai trò, HUD…
 */
export const EN: Dict = {
  "conn.pvp": "👥 Multiplayer table (PvP) · optional cUSDT stake",
  "w.you": "You", "w.youTag": "(you)", "w.role": "Role", "w.crew": "COMMANDO", "w.spy": "SPY",
  "html.title": "Lost Island · The Spy Among Us",
  "html.lockhint": "🖱 Click the screen to lock the mouse · Left click: shoot · Right click: aim (scope on the sniper) · R: reload · 1 pistol · 2 long gun · 3 sniper · 4 grenade (hold click = pull pin, release = throw) · G: quick grenade · Shift: roll · V: change view",
  "html.close": "Close",
  "view.third": "3rd person", "view.first": "1st person",

  /* ── intro ── */
  "intro.step0": "1 · Intro", "intro.step1": "2 · Rules", "intro.step2": "3 · Play",
  "intro.back": "← Back", "intro.next0": "See the rules →", "intro.next1": "Got it, next →",
  "intro.rulesH": "The rules in 1 minute", "intro.playH": "Ready to play",
  "intro.pause": "⏸ Pause", "intro.resume": "▶ Play", "intro.lang": "🌐 Language",
  "sc.0.title": "Stranded on a desert island",
  "sc.0.cap": "ALPHA Squad parachutes toward a secret mission zone, but a storm sweeps them away and drops them on a desert island in the middle of the sea. Contact lost — nobody knows where they are.",
  "sc.0.head": "🪂 Desert island",
  "sc.1.title": "Survival tasks",
  "sc.1.cap": "Everyone completes 3 tasks at the blinking orange stations: repair the radio, decrypt the secret message, light the signal fire, purify sea water, recover the supply crate. Finish them as a team and you are rescued!",
  "sc.1.head": "Survival", "sc.1.sm": "3 tasks / person",
  "sc.2.title": "A hidden spy",
  "sc.2.cap": "One of the 7 is a spy planted in advance — it could be you! Roles are assigned randomly and encrypted with Zama FHE: only you can see your own role.",
  "sc.2.head": "🔐 Roles are encrypted", "sc.2.banner": "Only you see: COMMANDO 🎖",
  "sc.3.title": "Assassination & body reports",
  "sc.3.cap": "The spy secretly assassinates anyone who wanders off alone (Q key, at most once per round). Whoever finds a body must run to the campfire and sit down (E) to call the meeting; everyone then has 30 s to reach the fire — whoever does not show up is branded the spy.",
  "sc.4.title": "Meeting around the campfire",
  "sc.4.cap": "The squad gathers around the fire, argues, then votes in secret. Votes are encrypted on-chain — nobody knows who you voted for. The player with the most votes is ejected.",
  "sc.4.banner": "Ejected: it WAS the spy! 🎯",
  "sc.5.title": "Who survives?",
  "sc.5.cap": "Ready? Open “Rules” to see the controls, or jump right in. The opening cutscene plays when you enter the game.",
  "sc.5.crewT": "🎖 COMMANDOS WIN", "sc.5.crewA": "✔ Vote out the real spy", "sc.5.or": "or", "sc.5.crewB": "✔ The squad finishes its tasks",
  "sc.5.spyT": "🕵 THE SPY WINS", "sc.5.spyA": "✔ Assassinate until living commandos", "sc.5.spyB": "≤ number of living spies", "sc.5.spyC": "(1 commando + 1 spy is enough)",

  /* ── rules ── */
  /* ── text on the illustrated clips (ruleClips.ts) ── */
  "clip.1.spy": "🕵 1 TRAITOR among 7",
  "clip.2.task": "📻 Repair the radio", "clip.2.body": "A body!", "clip.2.meet": "EMERGENCY MEETING", "clip.2.vote": "Compare stories & vote",
  "clip.3.stab": "Assassinate", "clip.3.burrow": "Secret burrow", "clip.3.alibi": "Alibi",
  "clip.4.check": "🏁 Check tasks", "clip.4.win": "VICTORY!",
  "clip.5.pistol": "Pistol", "clip.5.scope": "Scope (right mouse)", "clip.5.nade": "Hold to pull the pin",
  "clip.5.ouch": "WHY DID YOU SHOOT ME??", "clip.5.banner": "FRIENDLY FIRE IS REAL", "clip.5.over": "GAME OVER — INSTANTLY",
  "clip.6.a": "Tasks", "clip.6.b": "Body / Meeting", "clip.6.c": "Secret vote", "clip.6.d": "Ejected", "clip.6.round": "Round {0}", "clip.6.check": "Check", "clip.6.win": "A side wins",
  "clip.7.enc": "roles are encrypted", "clip.7.rev": "game over: public", "clip.7.spy": "SPY", "clip.7.crew": "COMMANDO",

  "rules.1.h": "🎯 Story & goal",
  "rules.1.b": `<p>ALPHA Squad was blown off its drop zone by a storm and is stranded on a desert island with no contact. You play alongside <b>6 Bot squadmates</b>. Among the 7 of you is <b>1 spy</b> (random — it may be you).</p>
  <p><b style="color:#5f9">Commandos win</b> by ejecting the real spy <i>or</i> by finishing every survival task.<br>
  <b style="color:#f66">The spy wins</b> when living commandos ≤ living spies.</p>`,
  "rules.2.h": "🎖 If you are a Commando",
  "rules.2.b": `<p>1. Find a <b style="color:#fa3">blinking orange station</b>, stand close and press <kbd>E</kbd> to do a task: 📻 repair the radio · 🔐 decrypt the message · 🔥 light the signal fire · 💧 purify water · 📦 recover the supply crate (3 per person).<br>
  2. Found a body? Run to the campfire and press <kbd>E</kbd> to sit down — that calls the meeting. Everyone has <b>30 s</b> to reach the fire and sit; anyone who stays away is branded the spy.<br>
  3. At the campfire meeting: read the chat, compare stories, then vote out whoever you suspect (or skip).</p>`,
  "rules.3.h": "🕵 If you are the Spy",
  "rules.3.b": `<p>Wait for someone to wander off alone, get close (&lt; 2.2 m) and press <kbd>Q</kbd> to assassinate — <b>once per round</b>.<br>
  Press <kbd>E</kbd> at a secret burrow (rock hole with a green glow) to pop out of another one. Fake tasks to keep your cover, then shift the blame during meetings.</p>`,
  "rules.4.h": "🎮 Controls",
  "rules.4.b": `<p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move in the direction you look · <b>mouse</b> rotates the camera (click the screen to lock the mouse)<br><kbd>V</kbd> change view: 3rd person / 1st person · scroll to zoom<br>
  <kbd>Space</kbd> jump · <kbd>Shift</kbd> roll (dodge forward, 1 s cooldown) · walk into the sea to swim (you can't shoot while swimming) · <kbd>E</kbd> interact (tasks / secret burrow / sit at the central campfire to call or join a meeting)<br>
  <kbd>Q</kbd> assassinate (spy only)<br><b>Guns:</b> <kbd>Left click</kbd> shoot · <kbd>Right click</kbd> aim · <kbd>R</kbd> reload · <kbd>1</kbd> pistol · <kbd>2</kbd> long gun · <kbd>3</kbd> sniper (aim = scope) · <kbd>4</kbd> grenade (hold click to pull the pin, release to throw) · <kbd>G</kbd> quick grenade (scroll wheel switches guns in 1st person)</p>
  <p class="dim">Vision is limited: you only see players inside the lit area and not hidden behind rocks, buildings or bushes. Nobody can walk into the sea.</p>`,
  "rules.5.h": "💥 Friendly fire is REAL",
  "rules.5.b": `<p>Shoot a teammate until they <b>drop</b> and they are <b>dead for good</b> — recorded on the contract, no reviving. Only squadmates who actually <b>SEE you do it</b> (close enough, facing you, no wall between) will yell <b>“WHY YOU SHOT ME??”</b> and <b>aim back at you</b>. Everyone else just runs over to the victim and asks what happened — <b>no witness, no accusation</b>. A witnessed shot <b>again</b> and the squad marks you as the spy and <b>opens fire</b>; the spy's real kills are exposed the same way if someone sees them.<br>
  If they gun you down, your death is <b>recorded on the smart contract</b> and the game ends <b>immediately</b> — even though the real spy was never found. Only the <b>spy</b> can truly kill (once per round, shared with <kbd>Q</kbd>). Think before you pull the trigger.</p>`,
  "rules.6.h": "🔁 One round",
  "rules.6.b": `<p>Roam & do tasks → a body is found or someone calls a meeting → <b>meeting & secret vote</b> → 1 player is ejected (or nobody) → new round, until one side wins.<br>
  The <b>🏁 Check mission</b> button (bottom right) asks the contract whether anyone has won yet.</p>`,
  "rules.7.h": "🔐 Why blockchain?",
  "rules.7.b": `<p>Roles, assassination targets, votes and task progress are <b>encrypted</b> on Sepolia (Zama FHE): even someone watching the transactions cannot tell who the spy is. Deaths — including being executed by your squad — are written to the contract. Only movement and chat run on your machine.</p>`,

  /* ── connect (step 3) ── */
  /* ── "Why connect a wallet" diagram (walletDiagram.ts) ── */
  "wd.you": "You", "wd.you2": "your browser",
  "wd.mm": "MetaMask", "wd.mm2": "your own wallet", "wd.confirm": "✋ you press confirm",
  "wd.sess": "Session wallet", "wd.sess2": "auto-created, throw-away", "wd.sess3": "funded ~0.03 test-ETH",
  "wd.chain": "Sepolia", "wd.chain2": "TEST network", "wd.chain3": "game rules + FHE encryption",
  "wd.a": "YOUR actions", "wd.a2": "tasks · kills · votes",
  "wd.c": "BOT turns", "wd.c2": "🤖 the session wallet signs — no popups for you",
  "wd.e": "🔐 Decrypt YOUR role", "wd.e2": "1 signature · no gas · only you see it",
  "wd.p1": "No real money — only free Sepolia ETH (faucet)", "wd.p2": "Never asks for your seed phrase / private key", "wd.p3": "Your own actions cost a little test-ETH as gas",
  "conn.why.h": "🔗 Why connect a wallet?",
  "conn.why.b": `<p>The game runs on <b>Sepolia</b> — Ethereum's <b>test network</b>. Your wallet (MetaMask) is the “account” that signs your actions: create the room, do tasks, assassinate, vote.</p>
  <ul><li>💸 <b>No real money.</b> You only need Sepolia ETH (free — search “Sepolia faucet”).</li>
  <li>🔑 A throw-away <b>session wallet</b> is created in your browser and funded once with ~0.03 test-ETH. Starting a game is <b>one</b> transaction. It signs the bots’ actions (bot turns, bot votes, tally) so MetaMask only asks you for <b>your own</b> actions. It can never act as you.</li>
  <li>⛽ Your own actions (tasks, kills, votes, deaths) still cost a little test-ETH gas and need your confirmation.</li>
  <li>✍️ One gas-free signature lets you <b>decrypt your role</b> (only you can see it).</li>
  <li>🔑 The game <b>never</b> asks for your seed phrase / private key.</li></ul>`,
  "conn.chk.h": "✅ Quick check", "conn.tip": "Tip: use a separate wallet for testing, never one that holds real funds.",
  "conn.play": "🔗 Connect wallet & Deploy (you + 6 Bot squadmates)",
  "chk.none": `❌ No wallet found. Install <a href="https://metamask.io/download" target="_blank" rel="noopener">MetaMask</a> and reload the page.`,
  "chk.ok": "✅ Wallet detected in your browser.", "chk.sep": "✅ You are on the Sepolia network.",
  "chk.notsep": "⚠️ Not on Sepolia yet — the game will ask you to switch networks when you press Play.", "chk.later": "ℹ️ The network will be checked when you press Play.",
  "howto.h": "❓ How to play", "howto.close": "Close (game keeps running)",

  /* ── thẻ mở khoá vai trò + màn hình kết thúc ── */
  "rv.unlock": "🔓 UNLOCKING ROLES", "rv.spy": "🕵 THE SPY: {0}", "rv.done": "🔓 ROLES UNLOCKED", "rv.go": "Continue", "rv.stamp": "SPY", "rv.you": "YOU",
  "end.spyWas": "🕵 The spy was: {0}", "end.proving": "Proving your death on-chain (FHE)…", "end.proved": "✓ Death proven on-chain (KMS-signed).",
  "tx.req.go": "Sending transaction: request the death proof — waiting for a block…", "tx.req.ok": "Transaction done: the contract made your encrypted status public so the KMS can decrypt it.",
  "kms.death.go": "KMS is publicly decrypting your status (the longest wait)…", "kms.death.ok": "KMS decrypted + signed it: you are dead.",
  "tx.submit.go": "Sending transaction: submitting the KMS signatures as proof…", "tx.submit.ok": "Transaction done: the contract verified the KMS signatures and ended the game.",
  "tx.exec.go": "Sending transaction: recording your death (executed) on the contract…", "tx.exec.ok": "Transaction done: the contract recorded your death and ended the game.",
  "tx.reveal.go": "Sending transaction: unlocking the squad's roles…", "tx.reveal.ok": "Transaction done: all 7 roles are now public, ready to decrypt.",
  "kms.roles.go": "KMS is decrypting the 7 roles (another short wait)…", "kms.roles.ok": "KMS decrypted the roles — getting the spy stamp ready.", "kms.retry": "KMS not ready yet — retrying automatically (attempt {0})…",
  "end.cantProve": "Could not prove the death on-chain.", "end.unlocking": "Unlocking roles (FHE)…",
  "end.cantUnlock": "Could not unlock the roles ({0}). If the contract is old, run <b>npm start</b> to redeploy it.", "end.retry": "Retry",

  /* ── mini-game, toast, súng, cảnh mở đầu ── */
  "mg.wrong": "WRONG — look again", "mg.blow": "🔥 BLOW", "mg.next": "Next valve: {0}", "mg.wrongOrder": "Wrong order! Start again from valve 1", "mg.flow": "Water is flowing!", "mg.cut": "✂ CUT!",
  "toast.deep": "🌊 Deep sea ahead — you can't swim any farther", "toast.swim": "🏊 Swimming — you can't shoot · stop moving to shoot", "toast.hands": "🙌 Hands busy — grenade put away",
  "toast.killed": "💀 You were killed", "toast.meetFail": "✗ Could not open the meeting on-chain — try again", "toast.sdk": "Initializing Zama SDK…", "toast.sign": "✍ Sign EIP-712 to decrypt (no gas)…",
  "gun.pistol": "Pistol", "gun.rifle": "Long Gun (AK-47)", "gun.sniper": "Sniper Rifle", "gun.grenade": "Grenade", "gun.nade": "Grenade · hold click = pull pin, release = throw",
  "cine.skip": "Skip ⏭", "cine.alt": "⚠ CRITICAL ALTITUDE", "cine.altL": "ALT",
  "voice.net": "📡 SQUAD NET", "voice.static": "📡 SQUAD NET — SIGNAL LOST", "voice.ai": "⚙ SUIT AI", "voice.private": "🔒 PRIVATE CHANNEL",
};
