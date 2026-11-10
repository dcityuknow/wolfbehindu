# Space Impostor — Real-time 3D + Zama FHEVM (Vite + TypeScript)

## Chạy
```bash
npm install
cp .env.example .env     # PRIVATE_KEY ví test có Sepolia ETH
npm run deploy           # compile + deploy -> src/config/deployment.json (địa chỉ + ABI)
npm run dev              # http://localhost:3000 (MetaMask, Sepolia)
```
Khác: `npm run typecheck` · `npm run build` (ra `dist/`) · `npm run compile` (chỉ compile, cập nhật ABI).

## Cấu trúc
```
contracts/SpaceImpostorFHE.sol     Smart contract FHE
scripts/deploy.mjs                 Compile (solc) + deploy (ethers) -> ghi deployment.json
index.html                         Markup + nạp Zama Relayer SDK (CDN -> window.relayerSDK)
src/
  main.ts                          Vòng lặp game, khởi tạo, nối input
  config.ts                        Hằng số cân bằng / ánh sáng / tên / màu (sửa ở đây)
  types.ts · state.ts              Kiểu dữ liệu + trạng thái game dùng chung (G)
  input.ts                         Phím WASD / E / Q / Space
  world/                           ── 3D (không biết gì về blockchain)
    scene.ts                         renderer, camera, ánh sáng, fog
    map.ts                           tường, phòng, bàn họp, trạm task, vent
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
Muốn thêm PvP: thêm `src/net/` (WebSocket đồng bộ vị trí) và gọi từ `main.ts`; `world/` và `web3/` không phải sửa.

## Điều khiển
WASD di chuyển · Space nhảy · **E** tương tác · **Q** kill (Impostor, sát < 2.2m)

## Off-chain vs on-chain
Vị trí, tầm nhìn, vent, mini-game, animation, chat, AI đi lại: **client**. Vai trò, kill (mục tiêu mã hoá), tiến độ task, phiếu bầu, điều kiện thắng: **Zama FHE on-chain**.
Khoảng cách kill do client kiểm tra (contract không biết vị trí).

## Giới hạn
Chỉ Solo (1 + 3 Bot) · 1 kill/round (giới hạn contract) · Bot đi/vote ngẫu nhiên · chưa có voice chat · chưa có server PvP.
Ánh sáng dùng đơn vị three r155+: nếu quá tối/sáng chỉnh `LIGHT` trong `src/config.ts`.
