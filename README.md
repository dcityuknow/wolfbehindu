# 🪂 Lost Island — a confidential social-deduction game on the Zama Protocol

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

A squad of paratroopers is blown onto a desert island. **One of them is a spy.** Nobody — not the other players, not the host, not a block explorer, not the contract itself — knows who, until the game is over and anyone can verify it.

Built for *Zama Developer Program, Mainnet Season 5 — Confidential Gaming*. Smart contract (Solidity + FHEVM), Vite/TypeScript/Three.js frontend, deployed on **Sepolia**.

## What's new in v5 (PvP depth)
* **Quick Match** and public lobbies; any member can start a public lobby after 2 minutes. Private rooms still work with a code/link.
* **Encrypted prize pool**: stakes go to a separate `StakeVault`; the pot is only revealed (publicly decrypted) after the game.
* **Secret task bounties** paid from the pot; **last will** of a murdered player (encrypted, table-only); **bribe fund** with conditional encrypted payment; **table chat**.
* **Leaderboard**: detectives (crew wins), assassins (spy wins), and cUSDT winners who opt in to publish their encrypted total.
* **FHE overlay** (matrix rain + glitch) while roles are dealt / decrypted / settled; **footsteps**, **emergency siren**, murder sting and a racing heartbeat before a meeting ends.
* Contracts split into modules and satellites — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Why this game cannot exist on a transparent chain

| What must stay hidden | On a normal chain | Here |
|---|---|---|
| Who the spy is | Readable from storage / calldata the moment it is dealt | `euint8` role, `FHE.allow` only to its owner |
| Who the spy kills | The kill tx names the victim | Target is an **encrypted input**; success is computed with `FHE.select` |
| Whether I *am* the spy | A revert / success / gas pattern would leak it | **No data-dependent revert**: every player sends the same action, crew's is a silent no-op |
| Who voted for whom | Public calldata | Encrypted ballots, tallied with encrypted `argmax`; only the *result* is decrypted |
| Who is alive | Public state | Encrypted `status`; revealed to the room only when a meeting opens |
| Task progress (hints who is faking) | Public counter | Encrypted counter; the spy's tasks add 0 |
| Cash stakes / pot (ERC-7984) | Public balances and amounts | cUSDT confidential transfers; paid amounts and the pot stay encrypted |

If the state were public the game would be over before it started — a block explorer would show the spy.

## Fairness (randomness + verification)
- **Randomness is on-chain:** the spy slot is `FHE.rem(FHE.randEuint8(128), n)` inside the coprocessor. Nobody can predict or bias it, including the host. (For n = 11 the draw is biased by ~0.4 %; documented, acceptable.)
- **Public results are KMS-verified:** win checkpoints, vote results, death proofs and the final roles go `makePubliclyDecryptable` → relayer `publicDecrypt` → `FHE.checkSignatures`. The contract refuses any cleartext the KMS did not sign for *exactly the stored handles* (tests: forged checkpoint / forged roles are rejected).
- **Anyone can audit a finished game:** `revealRoles` makes every role public once the room is `Finished` (never earlier). The UI shows who the spy was; in staked rooms `settleStake` verifies those roles on-chain before any money moves.

## Game modes
| Mode | What it is | Where |
|---|---|---|
| **Solo** | 1 human + 10 bots (11 soldiers = 11 nations) in a 3D voxel island (campfire meetings, tasks, firefights, friendly-fire rules). One signature starts a game; a throw-away *session wallet* runs bot turns without popups. | `Play` button |
| **PvP table (3–11 players)** | Real wallets, the chain is the shared world: tasks, an encrypted secret action, emergency meetings, shielded voting, KMS-verified endings. Invite by link `?room=ID`. | `👥 Multiplayer table` |
| **Staked PvP** | Each player stakes cUSDT (ERC-7984) with an **encrypted transfer**. Winners split the pot; refunds if cancelled/stalled. | create a *staked room* |

### Staked rooms in detail (ERC-7984)
1. Player approves the game as operator: `cUSDT.setOperator(game, until)` (UI does it, 30 days).
2. `createStakedRoom(stake)` / `joinRoom(id)` pull `stake` with `confidentialTransferFrom`. If a balance is too low the token moves **0 instead of reverting** (a revert would leak the balance), so the contract stores what was **really paid** (`paid`, encrypted) and sums it into an encrypted `pot`.
3. Game ends → `revealRoles` → `settleStake(cleartexts, proof)` verifies every role against the stored handles and fixes the winning side (all commandos, or the spy).
4. Each winner calls `claimPayout`: `share = pot / winners` (encrypted `FHE.div`), paid only if their own stake really arrived — **no free riding**. A solo spy takes the whole pot.
5. `cancelRoom` (host any time, anyone after 24 h) and `abortStalled` (anyone after 48 h) → everybody pulls back exactly what they paid with `claimRefund`.

## What is encrypted / verified / off-chain (honest limits)
- **Encrypted on-chain:** role, status, kill target, votes, task counter, paid stake, pot.
- **Public on purpose:** room membership, plaintext *turn* counters that are identical for every role (tasks done ≤ 3, "has voted", "acted"), the entry **stake amount** (a public room rule), the ejected player + ejected role after a vote, the winner, all roles after game over.
- **Off-chain (Solo 3D layer):** movement, shooting, bot AI and positions. A real-time shooter cannot run on-chain. Two solo-only actions (`reportFriendlyKill`, `reportExecution`) are client-attested and the contract **rejects them in PvP**, so nobody can declare another player dead or end a staked game.
- **PvP has no shared 3D world** (no netcode): the encrypted table is turn-based on purpose — every secret action is an on-chain action.
- Known trade-offs: only one spy per game; FHE transactions need generous gas limits (the UI sets them); stake token address must be set to the real cUSDT (see below).

## Run it
Requires Node 18+, MetaMask on Sepolia, a **throw-away test wallet** with Sepolia ETH.

```bash
npm install
cp .env.example .env        # put a TEST wallet PRIVATE_KEY in .env (never commit it)
npm run deploy              # compiles + deploys to Sepolia, writes src/config/deployment.json
npm run dev                 # http://localhost:3000
# or: npm start  (Windows: double-click CHAY.bat) = install + deploy-if-needed + dev
```

**Stake token.** `scripts/deploy.mjs` defaults to the Sepolia confidential USDT from the [Zama protocol registry](https://github.com/zama-ai/protocol-registry/blob/main/testnet.md#ethereum-sepolia-ethereum_sepolia) (`0x4E7B06D78965594eB5EF5414c357ca21E1554491`). **Re-check it on the registry before deploying**; override with `STAKE_TOKEN=0x…` in `.env`, or `0x000…0` to disable staking. You need some cUSDT in your wallet to play a staked room.

## Tests (contract)
31 Hardhat tests on the FHEVM mock: roles (exactly one spy, private, random), secret kill (crew no-op, no self-kill, once per round), tasks, checkpoints, shielded voting (ties, skip, dead voters, deadline), KMS proofs (forged proofs rejected), death proofs, role reveal, solo operator limits, **staking** (encrypted transfers, crew/spy payouts, forged settle, under-funded player, cancel, timeout, abort, refunds).

```bash
npm test        # installs ./hh and runs hardhat test
```
Note: the Zama Hardhat plugin (0.4.2) targets `@fhevm/solidity` 0.11.1, so the test project in `hh/` compiles the contract against 0.11.1, while the app/deploy script use 0.13.4 (the contract compiles against both). `hh/` uses the npm `solc` package, so it works offline.

## Contract API (short)
`createRoom` · `createSoloGame` · `createStakedRoom` · `joinRoom` · `startGame` · `completeTask` · `executeSecretKill` (encrypted target) · `callMeeting` · `castShieldedVote` (encrypted) · `tallyVotes` → `finalizeTally` · `requestCheckpoint` → `submitCheckpoint` · `requestDeathProof` → `submitDeathProof` · `revealRoles` · `settleStake` · `claimPayout` · `cancelRoom` · `abortStalled` · `claimRefund` · views. NatSpec in `contracts/SpaceImpostorFHE.sol`.

## Structure
```
contracts/SpaceImpostorFHE.sol     the game + ERC-7984 stakes
contracts/mocks/MockCUSDT.sol      test-only confidential token
hh/                                Hardhat project: FHEVM-mock tests (test/game.test.ts, test/stake.test.ts)
scripts/deploy.mjs · run.mjs       compile + deploy · one-command launcher
src/web3/                          wallet, FHE (encrypt / user-decrypt / public-decrypt), chain.ts, pvp.ts
src/gameplay/                      Solo rules (combat, meeting, round…) and pvp.ts (the encrypted table)
src/world/ · src/ui/               3D island and DOM UI (no blockchain knowledge)
docs/CHANGELOG.md                  development history
```

## Controls (Solo)
WASD move · Space jump · **E** interact · **Q** assassinate (spy) · Left click shoot · Right click aim · **R** reload · **G** grenade · **1–4** weapons · **V** view · Shift roll.

## Security notes
- Never commit `.env`. Use throw-away wallets only. The session wallet key lives in this browser's `localStorage`; keep a tiny balance in it.
- Not audited. Testnet only.

## Cập nhật: hồ bơi/lặn, âm thanh nước, gió tuyết trên đỉnh núi, tầm nhìn thật

- **Hồ & ao trên cao nguyên nhảy xuống được, bơi và LẶN được** (`world/island.ts`: `pondAt`, `surfaceAt`, `swimYAt`, `waterBed`). Lòng hồ hình bát: hồ lớn sâu ~4 m, ao nhỏ ~3 m. Mỗi nơi có mực nước riêng; bắn súng / ném lựu đạn xuống hồ cũng tóe nước đúng độ cao mặt hồ.
- **Lặn**: giữ `Shift` = chìm, `Space` = trồi nhanh, thả ra = tự nổi. Đầu chìm → màn hình phủ xanh nước + sương dày + bong bóng khí + tiếng ù dưới nước; nín thở `WATER.air` = 20 s (thanh 🫧 ở giữa dưới màn hình), hết hơi thì mất máu từng nhịp nhưng **không bao giờ xuống dưới 1 máu**. Code: `world/water.ts`, chỉnh số ở `WATER` trong `config.ts`.
- **Âm thanh nước bê nguyên từ game tham khảo** (`engine/sound.js`): xuống nước "tũm" (`splashSnd`), mỗi nhịp bơi "bì-bõm" (`wadeSnd`), lặn xuống, bong bóng, đạn chạm nước, lựu đạn nổ dưới nước, chết đuối — nằm trong `sfx` của `audio.ts`.
- **Đỉnh núi có gió + tuyết bay** (`world/blizzard.ts`): từ độ cao `BLIZZARD.from` (34 m) hạt tuyết trôi theo gió giật + vệt gió trắng; lên tới `BLIZZARD.full` (66 m) thì dày và mạnh nhất. Chỉnh ở `BLIZZARD` trong `config.ts`.
- **Tầm nhìn thật** (`world/visibility.ts`): bỏ giới hạn 16 m và "nón nhìn"; thấy người khác ở MỌI khoảng cách, trừ khi bị che bởi địa hình (đồi/núi), công trình / đá / bụi rậm, hoặc thân cây. Sương mù khoảng cách giữ nguyên (`LIGHT.fogPlay`): người ở xa mờ dần trong sương nhưng vẫn thấy được.

## Cập nhật: bot khôn hơn + biểu cảm khi chết

- **Bot bị bắn / thấy đường đạn thì tìm người bắn** (`gameplay/hostile.ts`, `mood 4`): nhìn ngay về hướng đạn bay tới (bị bắn từ trên đỉnh núi xuống thì ngước lên), rồi quét xung quanh từ XA (ngẩng) đến GẦN (cúi). Người chơi trong tầm mắt và không bị che thì "độ phát hiện" tăng dần — càng xa càng lâu, vừa nổ súng (chớp lửa nòng) thì lộ rất nhanh. Bot nào bị trúng/bị đạn sượt qua mà thấy người bắn thì **bắn trả ngay**; bot chỉ thấy đường đạn thì chĩa súng hỏi. Bot bắn trả được tới tầm súng (tối đa 150 m), kể cả bắn lên đỉnh núi. Chỉnh ở `SEARCH` trong `hostile.ts`.
- **Biểu cảm mặt** (`world/soldier.ts`, `buildFaceFx`): trúng đạn → nhăn mặt nhắm mắt; chết → ngẫu nhiên 1 trong 3: nhắm mắt há hốc miệng / mắt chữ X lè lưỡi / trợn trừng mắt há miệng to; ngất → nhắm mắt. Áp dụng cho cả xác của chính người chơi.

## Cập nhật: bản đồ nhỏ (minimap) góc trái

- `ui/minimap.ts`: bản đồ tròn ở góc trái (dưới các nút), nền là địa hình thật (biển / hồ / cát / cỏ / đá / tuyết, có đổ bóng sườn núi). Phím **M** (hoặc bấm vào bản đồ) đổi cỡ: gần 110 m (xoay theo hướng nhìn) → rộng 240 m → cả đảo (Bắc ở trên).
- Hiện: mũi tên vàng = bạn · chấm màu = người đang nhìn thấy được (cùng luật tầm nhìn thật, bị che thì không có chấm) · ✕ đỏ = xác · chấm cam = trại · ◆ xanh = trạm nhiệm vụ · ▲ đỏ = núi lửa · mũi tên cam ở viền chỉ hướng về trại · chữ N = hướng Bắc · số mét độ cao dưới đáy.

## Cập nhật: bot dùng AK, súng ngắm, lựu đạn

- **Trang bị** (`BOT_GUNS` trong `world/characters.ts`): bot cầm AK hoặc súng ngắm. Bot cầm súng ngắm đeo thêm AK: người chơi ở xa (>50 m) thì dùng sniper, lại gần thì tự đổi sang AK (có thời gian rút súng ~1 s). Lính AK áp sát tới ~16 m rồi đứng bắn, lách ngang; xạ thủ đứng yên ngắm từ ≥38 m.
- **Súng ngắm của bot**: bắn từng phát, ngắm lâu hơn (nghỉ 1,5–2,4 s giữa phát), trúng nhiều hơn khi ở xa, tiếng nổ vang xa; tầm bắn tới 220 m. Sát thương = dmg súng × `COMBAT.botDmg` (0,4).
- **Lựu đạn của bot** (`throwBotGrenade` trong `gameplay/combat.ts`): mỗi bot có 2 quả/lượt. Khi đang thù địch và người chơi cách 11–36 m (và không ở cao hơn bot quá 5 m — lựu đạn không ném lên đỉnh núi được) thì ném theo đường parabol về chỗ bạn (có sai số), hô một trong 12 câu, câu nào cũng mở đầu bằng "Zama" (vd. "Zama grenade! Take cover!", "Zama frag out!"; không lặp lại câu vừa hô — danh sách `NADE` trong `hostile.ts`), nổ ~0,9 s sau khi chạm đất để kịp chạy. Sát thương bằng 60% lựu đạn của bạn và không làm đồng đội bị thương. Các bot cách nhau ≥3 s mới ném quả tiếp.

## Cập nhật: bot biết NHẢY để leo núi

- Nguyên nhân bot kẹt dưới chân núi: sườn núi có bậc cao 2 khối, người chơi nhảy lên được (nhảy ~1,1 m + bước 1 khối) còn bot chỉ bước được 1 khối nên đứng đẩy vào vách. (Mô phỏng: bản cũ kẹt ở độ cao ~58 m, không lên tới đỉnh 76 m.)
- **Sửa**: `world/nav.ts` — A* cho phép bậc leo 2 khối (`JUMP_UP`, tốn thêm công) và rơi xuống ≤4 khối (`DROP`); `gameplay/walk.ts` — thấy bậc cao hơn 1 khối trong ~1,2 m phía trước thì nhảy (lực nhảy bằng người chơi); `main.ts` — bot có trọng lực khi nhảy/rơi; `world/characters.ts` — bot đang bay được leo bậc 2 khối. Bot đuổi theo người chơi ở xa (>40 m) chỉ tìm lại đường mỗi 2,5 s cho nhẹ máy.
- Mô phỏng sau khi sửa: bot đi từ trại lên tới đỉnh núi cao nhất (76 m) trong khoảng 40 s, không kẹt.

## Cập nhật: cảnh nhảy dù — phải bấm E để bung dù

- **Luồng**: ở phân cảnh 4 (người chơi rơi tự do, nhìn xuống đất) đồng hồ "ĐỘ CAO NGUY HIỂM" bật đỏ, còi báo động kêu và **nút E vàng nhấp nháy phát sáng** hiện ra kèm thanh đếm ngược (**4,6 giây** để bấm; chạm vào nút E cũng được trên màn hình cảm ứng). Đồng thời nhân vật trong cảnh hoảng loạn (mắt trợn, mồ hôi).
  - **Bấm E kịp** → bung dù (nhảy tới ngay trước lúc dù bung, cắt cảnh nhanh), phát chữ "ĐÃ BUNG DÙ!", cảnh chạy tiếp như cũ, vào game bình thường.
  - **Không bấm** → hết hạn thì KHÔNG bung dù: máy quay điện ảnh cắt sang máy tĩnh thấp sát đất nhìn ngược lên người đang lao xuống (rơi nhanh dần ~2 s), đập đất → rung mạnh, chớp sáng, tiếng răng rắc + bịch, nhân vật nằm sấp dang tay, mắt nhắm nghiền há hốc miệng, rồi tối sầm và hiện màn **"BẠN ĐÃ TỬ NẠN"** với nút **Nhảy lại (E)**. Bấm E / Space / Enter / click để chơi lại đoạn nhảy dù (việc tạo phòng + chia vai chạy ngầm không bị ảnh hưởng, cảnh chỉ đi tiếp sau khi bạn bung dù thành công).
- Trong lúc chưa bung dù, click / Space / Enter KHÔNG bỏ qua được phân cảnh này (tránh bấm lướt nhầm). Nút **Bỏ qua ⏭** và phím Esc vẫn bỏ qua cả cảnh mở đầu như cũ.
- Code: `world/cinePath.ts` (`DIVE`, `ALERT_LEAD`, `DEP`, nhánh `"crash"` trong `stateOf`; `EXT` tăng 14 → 16 để có thêm 2 giây rơi) · `world/cine3d.ts` (hạn chót, `failCam`, `cineDeploy`, `cineRetry`) · `ui/cutscene.ts` (phím E, nút, màn chết) · `styles.css` (`#cineKey`, `#cineDead`) · bản dịch `cine.key / cine.keyOk / cine.dead / cine.dead2 / cine.retry` (vi, en).
- **Lồng tiếng**: câu cảnh báo cũ (`v5.mp3`) nói "tự động bung dù" nên không dùng nữa; câu mới `v5e` ("Warning! Critical altitude! Pull your chute! Press E!") hiện đọc bằng giọng trình duyệt vì chưa có file mp3. Muốn giọng giống các câu khác: chạy `python tools/gen-voice.py ...` (đã thêm dòng `v5e`) rồi bỏ `v5e.mp3` vào `public/voice/`.

## Cập nhật: cú rơi không dù thực tế hơn (rầm · cây gãy · lăn lốc · máu)

- **Mô phỏng vật lý** (`simFall` trong `world/cinePath.ts`): sau hạn chót bấm E người chơi rơi nhanh dần (không dù), có thể **đâm vào tán cây**, rồi **đập đất → nảy lên → lăn lốc lộn nhào theo đà (tay chân quăng quật) → dội lại khi va bậc đất cao → nằm im** (sấp hoặc ngửa). Đập đất ~40 m/s, nảy lần đầu ~2 m rồi nhỏ dần, lăn vài mét tới mười mấy mét.
- **Trúng cây** (`CANOPIES` trong `map.ts`, điền khi rải cây ở `terrain.ts`): giảm ~55% tốc độ rơi, bị hất ngang, lộn tít; **cành gãy răng rắc ×3, lá rụng như mưa (màu theo loại cây), mảnh cành văng**, lá vãi dọc đường rơi xuyên tán, rung màn hình.
- **Âm thanh** (`cineSfx` trong `audio.ts`): `slam` = RẦM cực to nhiều lớp (đập chát + trầm dội + đất xào xạc + dư âm), `crunch` xương gãy đục, `bounce` mỗi cú nảy (to nhỏ theo lực), `snap` cành gãy, `rustle` lá xào xạc.
- **Máu** (`cine3d.ts`, phần "Hiệu ứng rơi chết"): máu bắn tung toé lúc đập đất và mỗi lần nảy, giọt máu rơi xuống thành vệt (ô voxel 0,5 m, chồng lên thì đậm dần), **vệt máu kéo dài theo đường lăn**, nằm im thì **vũng máu loang to dần**; kèm bụi đất bắn lên.
- **Điện ảnh**: quay chậm nửa giây ngay lúc đập đất, rung màn hình + chớp trắng theo từng cú đập/nảy, camera tĩnh đặt giữa điểm đập và chỗ nằm im, bám theo người lăn rồi tiến lại gần, tối sầm sau khi nằm im ~1,8 s rồi hiện màn "BẠN ĐÃ TỬ NẠN".

## Cập nhật: biệt kích bắn chết hết bot thì sao?

- **Luật hợp đồng** (`hh/contracts/core`, không đổi): Biệt kích thắng khi xong đủ nhiệm vụ HOẶC không còn gián điệp nào sống; Gián điệp thắng khi số biệt kích sống ≤ số gián điệp sống. Gián điệp luôn là một bot trong phòng solo, nên bắn chết TẤT CẢ bot = gián điệp cũng chết = **Biệt kích thắng**.
- **Lỗi đã sửa**: hợp đồng chỉ cho kiểm tra thắng thua **1 lần mỗi vòng**, mà trước đây client kiểm tra ngay sau phát bắn chết ĐẦU TIÊN → các phát sau không bao giờ được xét, bắn chết hết bot mà ván vẫn không kết thúc (phải họp mới ra kết quả). Giờ `afterFriendlyKill` (`gameplay/round.ts`) gom cả loạt phát bắn rồi kiểm tra MỘT lần: chờ 4 s sau phát cuối (0,9 s nếu đã hết người), chờ giao dịch ghi tử vong xong. Nếu lượt kiểm tra của vòng đã dùng mà bạn vẫn đứng một mình thì kết thúc ngay ở máy theo đúng luật trên.
- **Kết cục riêng** "🎖 NGƯỜI SỐNG SÓT CUỐI CÙNG" (`ENDING.massacre`) cho biệt kích tự tay bắn hạ cả đội; vẫn tính là thắng.
- Lưu ý: nếu có bot nhìn thấy bạn bắn đồng đội thì cả đội nổ súng (bị xử bắn = kết cục "EXECUTED BY YOUR OWN SQUAD", không ai thắng), và bot bị bắn từ xa giờ sẽ tìm và bắn trả — nên muốn giết sạch phải bắn lén (xa, không ai thấy) hoặc hạ nhanh hơn chúng.

## Cập nhật: bot vừa chạy vừa bắn, nấp, đổi súng, nạp đạn, ném bom

- **Lỗi hiển thị đã sửa**: trước đây khi bot đổi súng (xạ thủ sniper lại gần thì rút AK) chỉ đổi khẩu súng tính sát thương mà hình ảnh vẫn cầm khẩu cũ. Giờ đổi `userData.gunId` nên hoạt ảnh cất súng → rút súng mới (~0,6 s, không bắn được lúc đổi) hiện đúng. (`swapGun` trong `gameplay/hostile.ts`)
- **Di chuyển khi chiến đấu** (không còn đứng yên một chỗ): tiến lên khi ở xa / mất dấu · **lách ngang** (đổi hướng 0,7–2,2 s, giữ khoảng cách trong tầm hiệu quả của khẩu đang cầm) · **lùi** khi bị áp sát · **chạy tới chỗ nấp** (thân cây / đá / tường trong 16 m mà đứng sau đó người chơi không thấy) khi bị bắn · thỉnh thoảng **nhảy né**. Vừa chạy vừa bắn thì kém chính xác hơn đứng ngắm (chạy ×0,65 · lách ×0,85).
- **Bot vừa bị bắn** (trạng thái tìm kiếm): không đứng quay đầu nữa mà **chạy zig-zag về phía đạn bay tới** trong lúc quét mắt xa → gần; thấy người bắn là bắn trả.
- **Đổi súng linh hoạt**: xạ thủ cầm sniper bắn từ >58 m, lại gần <48 m đổi sang AK; ai cũng rút **súng ngắn** khi bị áp sát <7 m (và đôi khi tự đổi); trả lại AK khi người chơi ra xa >12 m. **Có đạn thật**: AK 30, súng ngắn 12, sniper 5 — hết đạn thì rút súng ngắn (60%) hoặc nạp lại (hô "Reloading!"), không bắn trong lúc nạp/đổi.
- **Lựu đạn**: 3 quả/bot, ném khi cách 8–42 m (cả khi bạn nấp sau vật cản để dồn ra), vừa chạy vừa ném, cách nhau ≥2,5 s giữa các bot, hô "Zama …".
- Chỉnh số: khối `hostile.forEach` trong `gameplay/hostile.ts` (khoảng cách minD/maxD, thời gian lách, xác suất nấp / đổi súng).
