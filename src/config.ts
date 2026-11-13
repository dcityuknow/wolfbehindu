/** Hằng số game — chỉnh cân bằng/giao diện tại đây. */
export const NO_TARGET = 255;          // = NO_TARGET trong contract (skip vote / kill giả)
export const TASKS_PER_PLAYER = 3;     // = TASKS_PER_PLAYER trong contract
export const VIS = 16;                 // tầm nhìn tối đa (m) — đảo v27 rộng gấp 4 nên tăng từ 12
export const KILL_RANGE = 2.2;
export const PLAYER_SPEED = 7;
export const BOT_SPEED = 3.8;
export const BOTS = 6;                 // = SOLO_BOTS trong contract
export const PLAYERS = BOTS + 1;       // bạn + bot
/** Họp: ghế quanh đống lửa (mỗi người một ghế) · thời gian chạy tới lửa trại sau khi có người gọi họp · tầm với để ngồi vào ghế. */
export const CALL_SECONDS = 30;
export const CAMP_REACH = 4.5;
export const seatPos = (k: number) => { const a = (k / PLAYERS) * Math.PI * 2 + 0.3; return { x: Math.cos(a) * 2.5, z: Math.sin(a) * 2.5 }; };
export const COLORS = [0xff4d4d, 0x4da6ff, 0x4dff88, 0xffd24d, 0xff9f43, 0xc77dff, 0x2ee6d6];
/** Đội hình 7 người (mã quân phục trong soldier.ts: vn us ru ng bd id in cn ph ua kr). [0] = bạn. */
export const SQUAD = ["vn", "us", "id", "ph", "ru", "kr", "ng"];
export { CALLSIGNS as NAMES, CHAT_LINES } from "./story";
// Ánh sáng ngoài trời (three >= r155, đơn vị vật lý). Tối/sáng quá thì chỉnh ở đây.
export const LIGHT = { ambient: 1.6, sun: 3.2, torch: 18, torchRange: 12, fogPlay: 0.0045, fogGhost: 0.0032 };

/* ───────────── Vũ khí ───────────── */
export type GunId = "pistol" | "smg" | "rifle" | "shotgun";
export interface GunDef {
  id: GunId; name: string; icon: string;
  dmg: number; pellets: number;          // sát thương mỗi viên · số viên mỗi phát (shotgun)
  mag: number; reserve: number;          // băng đạn · đạn dự trữ
  rate: number; auto: boolean;           // phát/giây · giữ chuột để bắn liên thanh
  reload: number;                        // giây nạp đạn
  spread: number; bloom: number;         // độ toả đạn cơ bản · tối đa khi bắn liên tục (rad)
  range: number; recoil: number;         // tầm bắn (m) · độ giật camera (rad/phát)
}
/** Chỉnh cân bằng súng ở đây. Phím 1..4 chọn theo thứ tự mảng này. */
export const GUNS: GunDef[] = [
  { id: "pistol", name: "M1911 Pistol", icon: "🔫", dmg: 24, pellets: 1, mag: 12, reserve: 72, rate: 5, auto: false, reload: 1.3, spread: 0.006, bloom: 0.02, range: 70, recoil: 0.018 },
  { id: "smg", name: "UZI SMG", icon: "🔫", dmg: 13, pellets: 1, mag: 32, reserve: 160, rate: 13, auto: true, reload: 1.7, spread: 0.014, bloom: 0.05, range: 55, recoil: 0.01 },
  { id: "rifle", name: "AK-47 Rifle", icon: "🔫", dmg: 25, pellets: 1, mag: 30, reserve: 120, rate: 8.5, auto: true, reload: 2.1, spread: 0.008, bloom: 0.045, range: 110, recoil: 0.016 },
  { id: "shotgun", name: "Shotgun SPAS", icon: "💥", dmg: 14, pellets: 8, mag: 6, reserve: 36, rate: 1.1, auto: false, reload: 2.4, spread: 0.055, bloom: 0, range: 35, recoil: 0.07 },
];
export const GRENADE = { count: 3, fuse: 2.3, radius: 6.5, dmg: 140, speed: 14, gravity: 17, cooldown: 1.1 };
/** Chiến đấu: đồng đội trúng đạn → ngất tạm thời (không lệch trạng thái on-chain). Chỉ GIÁN ĐIỆP giết thật (1 lần/lượt, qua contract). */
export const COMBAT = { botHp: 100, stunTime: 6, reviveHp: 60, headMul: 2, playerHp: 120, botDmg: 0.4, grace: 2.5 };   // botDmg: sát thương Bot bắn lại = dmg súng × hệ số · grace: giây tính là 1 "lần" bắn nhầm (xả liên thanh không bị tính nhiều lần)
