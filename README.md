# Lost Island — Paratroopers, Storm, Desert Island & a Spy (3D + Zama FHEVM, Vite + TypeScript)

**Story:** ALPHA Squad parachutes into a secret mission zone, is blown by a storm onto a desert island and loses contact; 1 of the 4+ survivors is a spy. All text/dialogue/cutscene lives in `src/story.ts` (the game is fully in English).

## Run (one command)
Double-click **`CHAY.bat`** (Windows) or `npm start`. The script installs packages → deploys the contract if missing/changed (asks for a PRIVATE_KEY of a test wallet with Sepolia ETH, stored in `.env`) → opens the game at http://localhost:3000 (MetaMask, Sepolia).
Manual: `npm install` · `npm run deploy` · `npm run dev`. Also: `npm run typecheck` · `npm run build`.
> **v10 changes the contract** (new `reportExecution`, new `Winner.FriendlyFire`), so it **must be redeployed**; the old contract address does not work. `CHAY.bat` does this automatically.

## New in v10
- **Friendly fire is recorded on-chain.** Shoot a teammate → they drop, yell "WHY YOU SHOT ME??" and aim back. Shoot again → you are marked as the spy and the whole squad shoots you. If you die, the client calls `reportExecution(roomId)`:
  - your status becomes Dead (encrypted) and `ejected = true`,
  - event `PlayerExecuted(roomId, slotId, round)` is emitted,
  - the game ends **immediately** with `Winner.FriendlyFire` (3) — even though the real spy was never found.
  The end screen shows the tx hash (with a Retry button if the transaction fails). A late checkpoint/vote result can no longer overwrite this ending.
- **Everything is English**: UI, story, cutscene, rules, toasts, bot chat, weapon names, scripts. (A few code comments in the source are still Vietnamese.)
- Fixed two pre-existing `tsc` errors (`lib: DOM.Iterable`, `audio.ts` type).
> Note: combat/positions are simulated client-side (the contract has no positions), so `reportExecution` is client-attested, like the kill range. Only a player of the room can report their own death, only while the game is running.

## Session wallet (v13)
Bots have no wallet, so in Solo every bot step used to pop up MetaMask. Now the game creates a throw-away **session wallet** (private key in this browser's localStorage, key `li_session_key`), funds it once with 0.03 Sepolia ETH (1 popup) and registers it as the room **operator** (`setOperator`, 1 popup). The operator may only call `runBotTurns`, `runBotVotes`, `callMeeting`, `tallyVotes`, `requestCheckpoint` (and anyone can already send the proofs); it cannot kill, vote, do tasks or report deaths. It uses the public RPC `https://ethereum-sepolia-rpc.publicnode.com` (see `src/web3/operator.ts`). If funding/registration fails the game falls back to MetaMask popups. Keep only a tiny balance in it.

## Permanent friendly-fire deaths (v12)
A teammate shot to 0 HP is dead until the game ends: the client calls `reportFriendlyKill(roomId, victim)` (status → Dead, event `FriendlyKill`) then a checkpoint. If the victim was secretly the spy, the checkpoint now ends the game with a Commando win (`_computeWinFlags`: no impostor alive). The spy's own first kill each round still uses the secret encrypted route. The old stun/revive is gone.

## Witnesses (v11)
Only squadmates who can SEE the shooter (within 16 m, inside their field of view, no wall between) accuse you. Others who hear the shot run to the victim and ask questions; if an accusation is already out and they then see you, they join in. A spy kill that someone sees exposes the spy; unseen kills stay secret. Tuning: `WIT` in `src/gameplay/hostile.ts`.

## Controls
WASD move · Space jump · **E** interact · **Q** assassinate (spy) · Left click shoot · Right click aim · **R** reload · **G** grenade · **1–4** weapons · **V** change view.

Balance knobs: `COMBAT` in `src/config.ts` (`playerHp`, `botDmg`, `grace`) and `src/gameplay/hostile.ts`.

## Structure
```
contracts/SpaceImpostorFHE.sol     FHE smart contract (incl. reportExecution)
scripts/deploy.mjs · run.mjs       compile + deploy · one-command launcher
src/story.ts                       ALL game text
src/config.ts                      balance / lighting / guns
src/world/                         3D (no blockchain knowledge)
src/web3/                          wallet, FHE, contract calls (chain.ts)
src/gameplay/                      rules: combat.ts, hostile.ts (friendly fire + execution), meeting.ts, round.ts…
src/ui/                            DOM: HUD, intro, cutscene, weapon HUD
```
Dependencies are one-way: `world` and `web3` are independent → `gameplay` uses both → `main`.

## Off-chain vs on-chain
Positions, vision, mini-games, animation, chat, bot movement, the friendly-fire fight: **client**. Roles, kills (encrypted target), task progress, votes, win conditions and the **friendly-fire execution**: **Zama FHE on-chain**.
