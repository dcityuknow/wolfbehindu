# Space Impostor — Real-time 3D + Zama FHEVM

## Chạy
```bash
npm install
cp .env.example .env     # PRIVATE_KEY ví test có Sepolia ETH
npm run deploy           # compile + deploy -> web/config.json
npm run serve            # http://localhost:3000 (MetaMask, Sepolia)
```

## Điều khiển
WASD di chuyển · Space nhảy · **E** tương tác (task / vent / họp khẩn / báo cáo xác) · **Q** kill (Impostor, đứng sát < 2.2m)

## Kiến trúc: cái gì off-chain, cái gì on-chain
| Off-chain (client, real-time) | On-chain FHE (Zama) |
|---|---|
| Di chuyển, tầm nhìn (fog + nón nhìn + raycast tường), vent, mini-game, animation, chat, AI đi lại của Bot | Chia vai trò mã hoá · kill ẩn (mục tiêu mã hoá) · tiến độ task mã hoá · phiếu bầu mã hoá · kiểm phiếu & điều kiện thắng (giải mã công khai có proof KMS) |

Vị trí người chơi KHÔNG lên chain (quá chậm/đắt) nên "kill phải áp sát" do client thực thi — contract không kiểm chứng được khoảng cách.

## Giới hạn bản này
- Chỉ chơi **Solo (1 + 3 Bot)**. PvP real-time cần server WebSocket đồng bộ vị trí (contract đã hỗ trợ 3–5 người, chưa có server).
- Bot đi lại ngẫu nhiên; kill/vote của Bot do contract chạy ngẫu nhiên mã hoá → Crewmate chỉ biết ai chết khi họp (tiết lộ sớm hơn sẽ lộ Impostor).
- 1 kill / round (giới hạn của contract). Chưa có proximity voice chat.
