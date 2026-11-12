# Lost Island — Lính nhảy dù, bão, đảo hoang & gián điệp (3D + Zama FHEVM, Vite + TypeScript)

**Kịch bản:** biệt đội ALPHA nhảy dù xuống vùng nhiệm vụ mật, bị bão cuốn xuống đảo hoang, mất liên lạc; 1 trong 4 người là gián điệp. Toàn bộ chữ/lời thoại/cutscene nằm ở `src/story.ts`; cutscene ở `src/ui/cutscene.ts`.

## Chạy (một lệnh)
Bấm đúp **`CHAY.bat`** (Windows) hoặc `npm start`. Script tự: cài thư viện (có % tiến độ) → deploy contract nếu chưa có / contract đã đổi (hỏi PRIVATE_KEY ví test có Sepolia ETH, lưu vào `.env`) → mở game ở http://localhost:3000 (MetaMask, Sepolia).
Thủ công: `npm install` · `npm run deploy` · `npm run dev`. Khác: `npm run typecheck` · `npm run build`.
> v3 đổi contract (6 bot) nên **bắt buộc deploy lại**; địa chỉ contract cũ không dùng được.

## Mới ở v3
- **Cảnh mở đầu 3D voxel** (`world/cine3d.ts`, quỹ đạo ở `world/cinePath.ts`): đội ngồi trong khoang C-130 → lần lượt chạy ra ramp, nhảy dù → bão, sét, gió → trôi dạt, chạm đất, tối dần → mở mắt lúc bình minh thấy cả đội nằm quanh lửa trại → ngồi dậy. Lời dẫn ở `story.ts → CUTSCENE`. Click/Space = tiếp, Esc = bỏ qua.
- **6 Bot** (7 người/ván): `SOLO_BOTS = 6` trong contract. Lượt Bot và phiếu Bot chạy theo lô `BOTS_PER_TX = 3` (`runBotTurns` / `runBotVotes`) để mỗi giao dịch không vượt ngân sách FHE → mỗi lượt có thêm vài giao dịch (toast "Bot hành động / Bot bỏ phiếu"). Nếu giao dịch bị revert vì hết gas/HCU, giảm `BOTS_PER_TX` rồi deploy lại.
- **Súng** (`config.ts → GUNS`): súng lục, UZI, AK-47, shotgun; nạp đạn; **lựu đạn**; chuột phải ngắm; bắn đầu = ×2 sát thương.
- Phím: **Chuột trái** bắn · **Chuột phải** ngắm · **R** nạp · **G** lựu đạn · **1–4** đổi súng (lăn chuột ở góc 1/từ trên) · **V** đổi góc (3 / 1 / từ trên; từ trên bắn theo con trỏ chuột).
- Bắn trúng đồng đội: họ **hét "WHY YOU SHOT ME??"**, chất vấn rồi **chĩa súng lại** (có bong bóng thoại + giọng đọc của trình duyệt). **Bắn nhầm lần nữa → bị gán gián điệp, cả đội rượt và bắn bạn**; hết máu → bị xử bắn, ván kết thúc. Họp khẩn / sang lượt mới thì hoà giải. Chỉnh ở `COMBAT` (`playerHp`, `botDmg`, `grace`) và `gameplay/hostile.ts`. Đây là phản ứng cục bộ, không ghi on-chain.
- Đạn/lựu đạn làm đồng đội **ngất 6 giây** rồi tỉnh dậy (không đổi trạng thái on-chain). **Chỉ gián điệp** hạ gục thật bằng súng/lựu đạn — phát hạ gục đầu tiên mỗi lượt, dùng chung hạn mức 1 lần/lượt với phím Q. Chỉnh ở `COMBAT` trong `config.ts`.

## Cấu trúc
```
contracts/SpaceImpostorFHE.sol     Smart contract FHE
scripts/deploy.mjs                 Compile (solc) + deploy (ethers) -> ghi deployment.json
index.html                         Markup + nạp Zama Relayer SDK (CDN -> window.relayerSDK)
src/
  main.ts                          Vòng lặp game, khởi tạo, nối input
  story.ts                         MỌI chữ của game: kịch bản cutscene, vai trò, nhiệm vụ, HUD, chat, màn kết thúc
  config.ts                        Hằng số cân bằng / ánh sáng / tên / màu (sửa ở đây)
  types.ts · state.ts              Kiểu dữ liệu + trạng thái game dùng chung (G)
  input.ts                         Phím WASD / E / Q / Space
  world/                           ── 3D (không biết gì về blockchain)
    scene.ts                         renderer, camera, ánh sáng, fog
    map.ts                           tường, phòng, bàn họp, trạm task, vent
    soldier.ts                       Người lính voxel kiểu Minecraft (11 quân phục: rằn ri, mũ, áo giáp, cờ) — đội hình chọn ở SQUAD trong config.ts
  characters.ts                    nhân vật, va chạm, xác/hồn ma
    visibility.ts                    fog of war: tầm nhìn + nón nhìn + raycast tường
  web3/                            ── blockchain/FHE (không biết gì về 3D)
    context.ts · wallet.ts           ví, contract, Zama instance
    fhe.ts                           mã hoá input, user-decrypt (EIP-712), public-decrypt
    chain.ts                         hàng đợi tx + các hành động contract (act, vote, tally…)
  gameplay/                        ── luật chơi, nối world <-> web3
    session.ts                       luồng vào game (kết nối → tạo phòng → vai trò)
    actions.ts                       interact (E), kill (Q), vent, prompt
    minigames.ts                     nối dây / nhập mã / bơm oxy  (thêm game mới: thêm 1 nhánh)
    bots.ts                          AI đi lại của Bot
    meeting.ts                       họp, chat, vote mã hoá, animation eject
    round.ts                         round mới, checkpoint thắng/thua, act giả của Crew
  ui/                              DOM: dom.ts (helper, toast), hud.ts (HUD, splash, màn kết thúc)
  styles.css
```
Quy tắc phụ thuộc (một chiều, không vòng): `world` và `web3` độc lập nhau → `gameplay` dùng cả hai → `main`.
Chiến đấu: gameplay/combat.ts · world/guns.ts · world/fx.ts · ui/weaponHud.ts · audio.ts · weaponState.ts.
Muốn thêm PvP: thêm `src/net/` (WebSocket đồng bộ vị trí) và gọi từ `main.ts`; `world/` và `web3/` không phải sửa.

## Điều khiển
WASD di chuyển · Space nhảy · **E** tương tác · **Q** kill (Impostor, sát < 2.2m)

## Off-chain vs on-chain
Vị trí, tầm nhìn, vent, mini-game, animation, chat, AI đi lại: **client**. Vai trò, kill (mục tiêu mã hoá), tiến độ task, phiếu bầu, điều kiện thắng: **Zama FHE on-chain**.
Khoảng cách kill do client kiểm tra (contract không biết vị trí).

## Giới hạn
Chỉ Solo (1 + 6 Bot) · 1 kill/round (giới hạn contract) · Bot đi/vote ngẫu nhiên · chưa có voice chat · chưa có server PvP.
Ánh sáng dùng đơn vị three r155+: nếu quá tối/sáng chỉnh `LIGHT` trong `src/config.ts`.
