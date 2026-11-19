## v5.2 — Xác nằm nhiều kiểu + máu trên sàn
* Ai bị giết (bot, đồng đội, chính bạn) đều ngã xuống một trong 9 tư thế ngẫu nhiên (ngửa dang tay chân chữ X, sấp như sao biển, nằm nghiêng co người, bò ngã…), hướng thân lệch ngẫu nhiên, súng KHÔNG còn dính tay. Code: world/corpse.ts.
* Vũng máu loang ra dưới xác + vệt máu lê + các vệt bắn rải quanh sàn (world/fx.ts bloodPool). Máu không tự biến mất, chỉ xoá khi bắt đầu ván mới.

## v5.1 — Đảo lớn gấp 3 + sườn đồi mượt
* Bán kính đảo 64 → 192 m (đường kính ~385 m). Khu chơi chính (trạm, hang, nhà) nằm trong CORE_R = 92 m quanh lửa trại; phần còn lại là vùng hoang dã: núi tuyết phía Bắc, 2 hồ lớn, rừng thông, bãi biển + cầu tàu + xác tàu + võng ở bờ Nam.
* Địa hình: nhiễu tần số thấp → làm mờ 12 lượt → giới hạn dốc 0.85 khối/ô → làm tròn thành khối (các bậc 1 khối trải 2–4 ô). Vách đá ra biển cắt sau bước này nên vẫn dựng đứng, vai vách được bo tròn.
* Sườn dốc lộ đất nâu / đá theo độ dốc thật; tuyết chỉ ở đỉnh cao (~46 m+).
* Render: chia terrain thành cụm 64×64 m có frustum culling; bầu trời + mặt trời đi theo người chơi; sương mù thưa hơn.

# Development changelog (old README, kept for history)

# Lost Island — Paratroopers, Storm, Desert Island & a Spy (3D + Zama FHEVM, Vite + TypeScript)

**Story:** ALPHA Squad parachutes into a secret mission zone, is blown by a storm onto a desert island and loses contact; 1 of the 4+ survivors is a spy. All text/dialogue/cutscene lives in `src/story.ts` (the game is fully in English).

## Run (one command)
Double-click **`CHAY.bat`** (Windows) or `npm start`. The script installs packages → deploys the contract if missing/changed (asks for a PRIVATE_KEY of a test wallet with Sepolia ETH, stored in `.env`) → opens the game at http://localhost:3000 (MetaMask, Sepolia).
Manual: `npm install` · `npm run deploy` · `npm run dev`. Also: `npm run typecheck` · `npm run build`.
> **v10 changes the contract** (new `reportExecution`, new `Winner.FriendlyFire`), so it **must be redeployed**; the old contract address does not work. `CHAY.bat` does this automatically.

## Meetings at the campfire (v17)
- A meeting can only be called by **sitting on a stool at the central campfire** (E). A bot that finds a body now runs to the campfire, sits, and only then calls the meeting. Pressing E on a body just marks it as found.
- Once someone sits, a **30 s countdown** (`CALL_SECONDS` in `config.ts`) starts. Everyone must run to the fire and press E to sit (bots do it automatically). The meeting opens as soon as everybody alive is seated, or when time runs out.
- Anyone not seated in time is **branded the spy**: a bot is expelled (death recorded on-chain with `reportFriendlyKill`); if it is **you**, you are executed and the game ends (`reportExecution`, text in `ENDING.absent`).
- Your camera and controls are **never** taken over: you keep full control until you sit, and the camera stays where you left it during the meeting.

### v18
- The player who calls a meeting (or a bot running to the campfire to call one) has a big bobbing red **!** above their head (visible even through fog of war).
- The countdown is shown big in the middle of the screen for everyone who has not sat down yet (turns red and pulses in the last 10 s); once seated it shrinks to the top.
- Characters can no longer walk through each other (`separate()` in `world/characters.ts`, body radius `BODY_R`).

### v21
- Notifications are now a black-background, white-text "radio chat" feed at the bottom-left; each line fades after ~9 s.

### v20
- **Random parachute landings:** every soldier now drops onto a different random spot on the island each game (inland, clear of buildings/rocks/bushes, ≥ ~10 m apart) instead of a tight ring around the campfire. The opening cutscene cameras were widened to follow the spread, and when the game starts every character stands where they landed.

## New in v10
- **Friendly fire is recorded on-chain.** Shoot a teammate → they drop, yell "WHY YOU SHOT ME??" and aim back. Shoot again → you are marked as the spy and the whole squad shoots you. If you die, the client calls `reportExecution(roomId)`:
  - your status becomes Dead (encrypted) and `ejected = true`,
  - event `PlayerExecuted(roomId, slotId, round)` is emitted,
  - the game ends **immediately** with `Winner.FriendlyFire` (3) — even though the real spy was never found.
  The end screen shows the tx hash (with a Retry button if the transaction fails). A late checkpoint/vote result can no longer overwrite this ending.
- **Everything is English**: UI, story, cutscene, rules, toasts, bot chat, weapon names, scripts. (A few code comments in the source are still Vietnamese.)
- Fixed two pre-existing `tsc` errors (`lib: DOM.Iterable`, `audio.ts` type).
> Note: combat/positions are simulated client-side (the contract has no positions), so `reportExecution` is client-attested, like the kill range. Only a player of the room can report their own death, only while the game is running.

## One-signature start (v15)
`createSoloGame(operator)` does room + session-wallet operator + bots + encrypted roles + start in ONE transaction (was 3). The funding transfer to the session wallet is only asked when its balance is low and is not waited for before the game tx. The EIP-712 decrypt permit is now kept in localStorage for a day (`li_permit_…`), so a page reload does not ask for it again. Steady state: 1 transaction popup to start a game.

## Session wallet (v13)
Bots have no wallet, so in Solo every bot step used to pop up MetaMask. Now the game creates a throw-away **session wallet** (private key in this browser's localStorage, key `li_session_key`), funds it once with 0.03 Sepolia ETH (1 popup) and registers it as the room **operator** (`setOperator`, 1 popup). The operator may only call `runBotTurns`, `runBotVotes`, `callMeeting`, `tallyVotes`, `requestCheckpoint` (and anyone can already send the proofs); it cannot kill, vote, do tasks or report deaths. It uses the public RPC `https://ethereum-sepolia-rpc.publicnode.com` (see `src/web3/operator.ts`). If funding/registration fails the game falls back to MetaMask popups. Keep only a tiny balance in it.

## Permanent friendly-fire deaths (v12)
A teammate shot to 0 HP is dead until the game ends: the client calls `reportFriendlyKill(roomId, victim)` (status → Dead, event `FriendlyKill`) then a checkpoint. If the victim was secretly the spy, the checkpoint now ends the game with a Commando win (`_computeWinFlags`: no impostor alive). The spy's own first kill each round still uses the secret encrypted route. The old stun/revive is gone.

## Witnesses (v11)
Only squadmates who can SEE the shooter (within 16 m, inside their field of view, no wall between) accuse you. Others who hear the shot run to the victim and ask questions; if an accusation is already out and they then see you, they join in. A spy kill that someone sees exposes the spy; unseen kills stay secret. Tuning: `WIT` in `src/gameplay/hostile.ts`.

## Controls
WASD move · Space jump · **E** interact · **Q** assassinate (spy) · Left click shoot · Right click aim · **R** reload · **G** grenade · **1** pistol · **2** long gun · **3** sniper (right click = scope) · **4** grenade (hold click = pull pin, release = throw) · **V** change view.

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


## Weapons (v28)
Only 3 guns + grenades (`GUNS`, `GRENADE`, `SWAP` in `src/config.ts`). Third person: guns are slung on the back (long gun / sniper crossed in an X) and hip (pistol holster, grenades on the left hip); switching draws the gun from the back/holster, reload pulls the mag, drops it, takes a new one from the left pouch, inserts it and racks the slide; grenade = hand into the hip pocket, pin pulled by the left hand, wind-up and throw. Code: `world/guns.ts` (models + rig), `world/gunpose.ts` (animation), `world/camera.ts` (first-person), `gameplay/combat.ts` (state machine).

## What is encrypted, what is verified, what is off-chain (Zama Developer Program S5)

**Encrypted on-chain (FHE, `euint8`/`ebool`)** — the spy's identity (`FHE.randEuint8`, never shown to anyone, bots included), every player's alive/dead status, secret kill targets, shielded votes, task progress. Chain observers cannot tell who the spy is or who was killed.

**Verifiable (KMS-signed public decryption + `FHE.checkSignatures`)** — vote tally and ejected role, win checkpoints, and **assassination**: when you die, the contract makes only YOUR status public, the KMS decrypts and signs it, and the contract ends the game only if the proof says "dead" (`requestDeathProof` / `submitDeathProof`). After any ending the contract unlocks every role (`revealRoles`, only when the room is Finished) so anybody can audit that the winner was legitimate.

**Off-chain, client-simulated (honest limits)** — movement, shooting, bot AI and positions (a real-time FPS cannot run on-chain). The two client-attested actions (`reportExecution`, `reportFriendlyKill`) are restricted to solo rooms, so in PvP nobody can declare another player dead or end the game for everyone.

---
## Cập nhật: đa ngôn ngữ + lính theo quốc gia + thẻ gián điệp full màn hình

- **Điểm vào mới**: `src/boot.ts` (index.html trỏ vào đây). Nó xác định ngôn ngữ/quốc gia TRƯỚC rồi mới nạp `main.ts`.
- **Ngôn ngữ & quốc gia** (`src/i18n/index.ts`): lần đầu vào, đoán quốc gia từ IP (api.country.is → ipapi.co, nhớ 12 giờ); không được thì theo ngôn ngữ trình duyệt.
  11 ngôn ngữ: vi, en, ru, ng (Pidgin), bn, id, hi, zh, fil, uk, ko. Thanh chọn ngôn ngữ nằm ở menu; bấm là lưu + tải lại.
- **Lính đại diện** = lính của quốc gia đó (`SQUAD[0]` trong `config.ts`); 6 Bot còn lại mỗi ván bốc ngẫu nhiên từ 10 nước còn lại, nên cả 11 kiểu lính đều có lúc xuất hiện (hợp đồng chỉ có 7 slot).
- **Bản dịch**: `src/i18n/packs/` — `en.ts` (gốc/dự phòng), `vi.ts` và `full/*.ts` (đủ cả 11 ngôn ngữ: luật chơi, intro, lời Bot, kết thúc, minigame, phụ đề…); `more.ts` là lớp giao diện cơ bản bên dưới `full/`. Thiếu khoá nào tự dùng tiếng Anh.
  Chữ trong `story.ts` được ghi đè theo đường dẫn (`"UI.tasks"`, `"ROLE.spy.title"`…). Thêm bản dịch = thêm khoá cùng tên vào pack.
- **Thẻ mở khoá vai trò** (`ui/revealCards.ts`): 7 thẻ xếp 2 hàng (4+3) chiếm trọn màn hình, ảnh chụp 720×800 nên không bị bóp; điện thoại/màn hình dọc xếp 2 cột. Con dấu GIÁN ĐIỆP kẹp trong màn hình.


## v5.0.0
- Contracts split into core modules + StakeVault, LostIslandStats, BountyBoard, LastWill, BribeEscrow, RoomChat.
- `settleStake` became `settleRoom` (works for free PvP rooms too and feeds the leaderboard); claims moved to the vault.
- `npm install` uses `--legacy-peer-deps` (peer conflict between @fhevm/solidity 0.13.4 and @openzeppelin/confidential-contracts 0.5.3).
- NOT compiled or run by the author of this change (no network in the sandbox): first `npm run compile`, then `npm test`.


## Cập nhật: đủ 11 lính cho 11 quốc gia / 11 ngôn ngữ
- Mỗi ván Solo giờ có **11 người = 11 quốc gia**: bạn (lính nước bạn chọn/IP) + **10 Bot, mỗi Bot một nước còn lại** (trước đây chỉ 6 Bot bốc ngẫu nhiên từ 10 nước nên thiếu 4 nước).
- Contract: `MAX_SLOTS` 7 → **11**, `SOLO_BOTS` 6 → **10** (`contracts/core/GameTypes.sol`, `GameStorage.sol`, bản sao trong `hh/`). `BOTS_PER_TX` giữ 3 → bot chạy 4 lô/tx. **Phải deploy lại contract** (`CHAY.bat` / `npm start` tự deploy lại khi .sol đổi).
- Client: `BOTS = 10`, `COLORS` 11 màu, `CALLSIGNS` 11 tên (thêm Hotel, India, Juliet, Kilo), `SQUAD = [nước bạn, ...10 nước còn lại]`.
- Thẻ mở khoá vai trò: 11 thẻ (ngang 6+5, dọc 3 cột × 4 hàng).
- Chữ hướng dẫn / kết thúc / KMS trong cả 11 ngôn ngữ đã đổi "7 người, 6 Bot" → "11 người, 10 Bot".
- Test (`hh/test/game.test.ts`) đổi sang 11 slot / 10 bot (4 lô bot).
- **Video mở đầu (cine3d) đủ 11 lính**: khoang máy bay 11 ghế (thêm Hotel, India, Juliet, Kilo = id 7..10), mỗi người 1 cú cận cảnh + biểu cảm riêng (Hotel cười lo lắng · India soi xét · Juliet xạ thủ lạnh lùng · Kilo tân binh run sợ), 11 người xếp hàng nhảy, 10 đồng đội bung dù lần lượt (`N`, `SEAT`, `DEP_ORDER`, `EXT` 9→14 trong `cinePath.ts`). Cabin dài 32→45s, cảnh nhảy 10→12s.
- **Lời thoại mới** `v13..v17` (VOICE trong `story.ts`) + bản dịch đủ 11 ngôn ngữ (`voice.v13`…). Đã thu sẵn `public/voice/v13..v17.mp3` bằng Kokoro (giọng nam riêng cho từng nhân vật); tạo lại bằng `tools/gen-voice.py --only v13,v14,v15,v16,v17`.
- Clip luật chơi số 1 và chữ "11 người" cũng đã đồng bộ.
- **Cảnh giới thiệu từng bước trong menu (`ui/introStage.ts`) đủ 11 lính**: lạc đảo (11 người lần lượt lên bờ, 2 hàng), nhiệm vụ (9 đồng đội đứng sau nhìn), gián điệp ẩn (11 dấu "?"), họp quanh lửa (11 ghế, 10 phiếu bầu), kết cục (10 biệt kích ăn mừng trên bục lớn hơn). `BOT_GUNS` mở rộng lên 11 phần tử (clip luật chơi dùng id 7..10).

## Độ cao núi: gió rít + băng giá (world/altitude.ts)
- **Gió rít theo độ cao**: nghe thấy từ độ cao ~26 m, to dần, mạnh nhất sát đỉnh (~74–76 m). Gồm thân gió ù ù + tiếng rít (noise băng hẹp) nhấp nhô theo các cơn gió giật (`windSfx` trong `audio.ts`).
- **Đứng lâu trên cao (≥ 40 m) thì bị phủ băng**: quần áo/tay áo của người chơi phủ trắng xanh, bắt đầu từ mặt hướng lên (vai, mũ), lan dần từng ô voxel; đồng thời màu sắc nhạt dần (nhân vật + cả màn hình + viền sương giá). Đứng yên ở đỉnh ≈ 30 s là phủ kín; ở ~50 m ≈ 1 phút; đi lại thì chậm hơn (×0,35). Xuống thấp hoặc ra gần lửa trại thì băng tan dần. Có toast cảnh báo (`UI.coldWarn`, đủ 11 ngôn ngữ).
- Chỉnh số ở `ALTITUDE` trong `src/config.ts` (windFrom/windMax/frostFrom/rate…).
